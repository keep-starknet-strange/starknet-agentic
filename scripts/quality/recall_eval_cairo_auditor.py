#!/usr/bin/env python3
"""Real-world recall + taxonomy-coverage eval for the cairo-auditor (#1).

The existing external-triage scorecards measure precision on the tool's own
output — recall there is tautological (a missed vuln can never appear in a set
defined as "what the tool reported"). This harness instead measures recall
against an INDEPENDENT ground truth: the 217 human-confirmed findings normalized
from public Cairo audits under `datasets/normalized/findings/`.

It reports three honest numbers, separating what is measured from what is not:

1. **Taxonomy coverage** — what fraction of real-world findings the tool's 13
   supported classes can even represent. Findings outside the taxonomy are a
   recall ceiling the tool cannot exceed regardless of how good the agents are.
2. **Deterministic recall on the evaluable subset** — for in-taxonomy findings
   that ship a real `vulnerable_snippet`, whether the deterministic detector
   fires. This is a lower bound (the full LLM agent catches more).
3. **Unmeasured remainder** — findings with placeholder snippets, made explicit
   rather than silently dropped.

This is deterministic and offline so it runs in CI. A full LLM-agent recall run
over real repos is a separate, manual step (see `evals/README.md`).
"""

from __future__ import annotations

import argparse
import glob
import importlib.util
import json
import shutil
import sys
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0, "best_practice": 0}
PLACEHOLDER_MARKERS = ("see source audit finding", "see audit", "unspecified")

# Best-effort keyword -> supported class mapping. Ordered: first match wins.
# Each rule is (class_id, required_any, required_all). A finding maps to the
# class when its searchable text contains any of `required_any` AND all of
# `required_all`.
CLASS_RULES: list[tuple[str, tuple[str, ...], tuple[str, ...]]] = [
    ("SHUTDOWN_OVERRIDE_PRECEDENCE", ("shutdown",), ("",)),
    ("SYSCALL_SELECTOR_FALLBACK_ASSUMPTION", ("selector", "syscall fallback"), ("",)),
    ("AA-SELF-CALL-SESSION", ("session key", "self-call", "self call"), ("",)),
    ("UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD", ("class hash", "class_hash"), ("upgrad",)),
    ("IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK", ("upgrade", "upgrad"), ("",)),
    ("FEES_RECIPIENT_ZERO_DOS", ("fees_recipient", "fee recipient"), ("",)),
    ("UNCHECKED_FEE_BOUND", ("fee",), ("",)),
    ("CONSTRUCTOR_DEAD_PARAM", ("unused", "dead param", "never used"), ("",)),
    ("CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD", ("zero address", "non-zero", "zero-address", "is_zero"), ("",)),
    ("IRREVOCABLE_ADMIN", ("irrevocable", "no rotation", "cannot rotate", "no recovery"), ("",)),
    ("ONE_SHOT_REGISTRATION", ("register", "registration"), ("once",)),
    ("CEI_VIOLATION_ERC1155", ("reentran", "interaction before", "check-effect", "cei", "erc1155", "erc-1155"), ("",)),
    ("NO_ACCESS_CONTROL_MUTATION", ("access control", "unauthorized", "missing auth", "without authorization", "privilege"), ("",)),
]


def _load_detectors() -> dict[str, Any]:
    path = REPO_ROOT / "scripts" / "quality" / "benchmark_cairo_auditor.py"
    spec = importlib.util.spec_from_file_location("cairo_auditor_benchmark_for_recall", path)
    if spec is None or spec.loader is None:
        return {}
    module = importlib.util.module_from_spec(spec)
    # Register before exec so @dataclass introspection (sys.modules lookup) works.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    detectors = getattr(module, "DETECTORS", {})
    return detectors if isinstance(detectors, dict) else {}


def _searchable(finding: dict[str, Any]) -> str:
    parts = [
        str(finding.get("root_cause", "")),
        str(finding.get("exploit_path", "")),
        str(finding.get("trigger_condition", "")),
        " ".join(str(t) for t in finding.get("tags", []) if isinstance(finding.get("tags"), list)),
        " ".join(str(f) for f in finding.get("functions", []) if isinstance(finding.get("functions"), list)),
        str(finding.get("notes", "")),
    ]
    return " ".join(parts).lower()


def map_class(finding: dict[str, Any]) -> str | None:
    text = _searchable(finding)
    for class_id, any_tokens, all_tokens in CLASS_RULES:
        if all_tokens != ("",) and not all(tok in text for tok in all_tokens if tok):
            continue
        if any(tok in text for tok in any_tokens if tok):
            return class_id
    return None


def _is_evaluable(finding: dict[str, Any]) -> bool:
    snippet = str(finding.get("vulnerable_snippet", "")).strip().lower()
    if len(snippet) < 25:
        return False
    return not any(marker in snippet for marker in PLACEHOLDER_MARKERS)


def load_findings(findings_dir: Path) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for fp in sorted(glob.glob(str(findings_dir / "*.findings.jsonl"))):
        for line in Path(fp).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(row, dict) and row.get("finding_id"):
                findings.append(row)
    return findings


def evaluate(findings: list[dict[str, Any]], detectors: dict[str, Any]) -> dict[str, Any]:
    total = len(findings)
    by_severity: Counter[str] = Counter()
    mapped_by_severity: Counter[str] = Counter()
    mapped_class_counts: Counter[str] = Counter()
    out_of_taxonomy = 0

    evaluable = 0
    detected = 0
    evaluable_misses: list[dict[str, str]] = []

    for f in findings:
        sev = str(f.get("severity_normalized", "info")).lower()
        by_severity[sev] += 1
        cls = map_class(f)
        if cls is None:
            out_of_taxonomy += 1
            continue
        mapped_by_severity[sev] += 1
        mapped_class_counts[cls] += 1
        if _is_evaluable(f) and cls in detectors:
            evaluable += 1
            try:
                hit = bool(detectors[cls](str(f.get("vulnerable_snippet", ""))))
            except Exception:
                hit = False
            if hit:
                detected += 1
            else:
                evaluable_misses.append(
                    {"finding_id": str(f.get("finding_id")), "class_id": cls, "severity": sev}
                )

    mapped = total - out_of_taxonomy

    def weighted(counter: Counter[str]) -> int:
        return sum(SEVERITY_WEIGHT.get(s, 0) * n for s, n in counter.items())

    # High-signal coverage: critical + high only.
    crit_high_total = by_severity["critical"] + by_severity["high"]
    crit_high_mapped = mapped_by_severity["critical"] + mapped_by_severity["high"]

    return {
        "total_findings": total,
        "mapped_in_taxonomy": mapped,
        "out_of_taxonomy": out_of_taxonomy,
        "taxonomy_coverage_count": round(mapped / total, 4) if total else 0.0,
        "taxonomy_coverage_weighted": round(weighted(mapped_by_severity) / weighted(by_severity), 4)
        if weighted(by_severity)
        else 0.0,
        "crit_high_total": crit_high_total,
        "crit_high_mapped": crit_high_mapped,
        "crit_high_coverage": round(crit_high_mapped / crit_high_total, 4) if crit_high_total else 0.0,
        "evaluable_subset": evaluable,
        "evaluable_detected": detected,
        "deterministic_recall_on_evaluable": round(detected / evaluable, 4) if evaluable else None,
        "unmeasured_placeholder": mapped - evaluable,
        "by_severity": dict(by_severity),
        "mapped_by_severity": dict(mapped_by_severity),
        "mapped_class_counts": dict(mapped_class_counts),
        "evaluable_misses": evaluable_misses,
    }


def render_markdown(metrics: dict[str, Any], *, version: str, findings_dir: Path, generated_at: str) -> str:
    L: list[str] = []
    L.append(f"# {version} Cairo Auditor Recall & Taxonomy Coverage")
    L.append("")
    L.append(f"Generated: {generated_at}")
    L.append(f"Ground truth: `{findings_dir.relative_to(REPO_ROOT) if findings_dir.is_relative_to(REPO_ROOT) else findings_dir}` "
             f"({metrics['total_findings']} human-confirmed findings from public Cairo audits)")
    L.append("")
    L.append("> Unlike the external-triage scorecard (precision on the tool's own output, where")
    L.append("> recall is tautological), this measures coverage against an INDEPENDENT ground truth.")
    L.append("")
    L.append("## Taxonomy Coverage (what the tool's classes can represent)")
    L.append("")
    L.append("| Metric | Value |")
    L.append("| --- | ---: |")
    L.append(f"| Total real findings | {metrics['total_findings']} |")
    L.append(f"| Mapped to a supported class | {metrics['mapped_in_taxonomy']} |")
    L.append(f"| Out of taxonomy (recall ceiling) | {metrics['out_of_taxonomy']} |")
    L.append(f"| Coverage (count) | {metrics['taxonomy_coverage_count']:.3f} |")
    L.append(f"| Coverage (severity-weighted) | {metrics['taxonomy_coverage_weighted']:.3f} |")
    L.append(f"| Critical+High findings | {metrics['crit_high_total']} |")
    L.append(f"| Critical+High in taxonomy | {metrics['crit_high_mapped']} |")
    L.append(f"| Critical+High coverage | {metrics['crit_high_coverage']:.3f} |")
    L.append("")
    L.append("## Deterministic Recall (lower bound, evaluable subset only)")
    L.append("")
    recall = metrics["deterministic_recall_on_evaluable"]
    L.append("| Metric | Value |")
    L.append("| --- | ---: |")
    L.append(f"| Evaluable (in-taxonomy + real snippet) | {metrics['evaluable_subset']} |")
    L.append(f"| Detected by deterministic detector | {metrics['evaluable_detected']} |")
    L.append(f"| Deterministic recall | {'n/a' if recall is None else f'{recall:.3f}'} |")
    L.append(f"| Unmeasured (placeholder snippet) | {metrics['unmeasured_placeholder']} |")
    L.append("")
    L.append("## Coverage by Severity")
    L.append("")
    L.append("| Severity | Total | In taxonomy | Coverage |")
    L.append("| --- | ---: | ---: | ---: |")
    for sev in ("critical", "high", "medium", "low", "info", "best_practice"):
        tot = metrics["by_severity"].get(sev, 0)
        mp = metrics["mapped_by_severity"].get(sev, 0)
        cov = f"{mp / tot:.3f}" if tot else "n/a"
        L.append(f"| {sev} | {tot} | {mp} | {cov} |")
    L.append("")
    L.append("## Mapped Class Distribution")
    L.append("")
    L.append("| Class | Mapped findings |")
    L.append("| --- | ---: |")
    for cls, n in sorted(metrics["mapped_class_counts"].items(), key=lambda kv: (-kv[1], kv[0])):
        L.append(f"| {cls} | {n} |")
    L.append("")
    L.append("## Notes")
    L.append("")
    L.append("- **Taxonomy coverage is the dominant recall signal here.** Findings outside the")
    L.append("  13 supported classes (reentrancy variants, signature/merkle/oracle/precision, DoS,")
    L.append("  protocol-specific logic) are an upper bound the tool cannot exceed.")
    L.append("- Deterministic recall is a lower bound on the small subset with real snippets; the")
    L.append("  full LLM agent catches more. A live default-vs-deep agent recall run is the next step.")
    L.append("- Class mapping is keyword-based and approximate; treat coverage as directional.")
    L.append("")
    return "\n".join(L)


def main() -> int:
    parser = argparse.ArgumentParser(description="Cairo-auditor real-world recall + taxonomy coverage eval.")
    parser.add_argument("--findings-dir", default=str(REPO_ROOT / "datasets" / "normalized" / "findings"))
    parser.add_argument("--output", required=True, help="Output markdown scorecard path")
    parser.add_argument("--output-json", default="", help="Optional JSON metrics path")
    parser.add_argument("--version", default="v0.2.0")
    parser.add_argument("--min-taxonomy-coverage", type=float, default=0.0,
                        help="Advisory gate: fail if count coverage is below this.")
    parser.add_argument("--min-crit-high-coverage", type=float, default=0.0,
                        help="Advisory gate: fail if critical+high coverage is below this.")
    parser.add_argument("--save", action="store_true", help="Copy markdown to evals/scorecards/.")
    args = parser.parse_args()

    findings_dir = Path(args.findings_dir).resolve()
    detectors = _load_detectors()
    findings = load_findings(findings_dir)
    if not findings:
        print(json.dumps({"error": f"no findings under {findings_dir.as_posix()}"}))
        return 1

    metrics = evaluate(findings, detectors)
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    markdown = render_markdown(metrics, version=args.version, findings_dir=findings_dir, generated_at=generated_at)

    output_path = Path(args.output)
    if not output_path.is_absolute():
        output_path = (REPO_ROOT / output_path).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown + "\n", encoding="utf-8")

    saved_output = None
    if args.save:
        target = REPO_ROOT / "evals" / "scorecards" / output_path.name
        target.parent.mkdir(parents=True, exist_ok=True)
        if output_path.resolve() != target.resolve():
            shutil.copy2(output_path, target)
        saved_output = target.as_posix()

    if args.output_json:
        json_path = Path(args.output_json)
        if not json_path.is_absolute():
            json_path = (REPO_ROOT / json_path).resolve()
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "total_findings": metrics["total_findings"],
                "taxonomy_coverage_count": metrics["taxonomy_coverage_count"],
                "crit_high_coverage": metrics["crit_high_coverage"],
                "deterministic_recall_on_evaluable": metrics["deterministic_recall_on_evaluable"],
                "output": output_path.as_posix(),
                "saved_output": saved_output,
            }
        )
    )

    if metrics["taxonomy_coverage_count"] < args.min_taxonomy_coverage:
        print(f"FAILED: taxonomy coverage {metrics['taxonomy_coverage_count']:.3f} < {args.min_taxonomy_coverage:.3f}")
        return 1
    if metrics["crit_high_coverage"] < args.min_crit_high_coverage:
        print(f"FAILED: crit+high coverage {metrics['crit_high_coverage']:.3f} < {args.min_crit_high_coverage:.3f}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
