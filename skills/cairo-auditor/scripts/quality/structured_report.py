#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

ALLOWED_TAGS = {"[CODE-TRACE]", "[PREFLIGHT-HIT]", "[CROSS-AGENT]", "[ADVERSARIAL]"}
DROP_REASONS = {
    "false_positive",
    "duplicate_root_cause",
    "below_confidence_threshold",
    "insufficient_evidence",
}
PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
SEVERITY_ORDER = ("Critical", "High", "Medium", "Low")


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _md_cell(value: Any) -> str:
    return str(value).replace("|", "&#124;").replace("\n", " ").replace("\r", " ")


def _extract_tags(value: Any) -> list[str]:
    tags: list[str] = []
    if isinstance(value, str):
        candidates = re.findall(r"\[[A-Z-]+\]", value)
    else:
        candidates = [str(item) for item in _as_list(value)]
    for tag in candidates:
        if tag in ALLOWED_TAGS and tag not in tags:
            tags.append(tag)
    return tags


def _read_payload(path: Path) -> list[dict[str, Any]]:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return []

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        rows: list[dict[str, Any]] = []
        for line_number, line in enumerate(raw.splitlines(), 1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: invalid JSONL: {exc}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"{path}:{line_number}: JSONL row must be an object")
            rows.append(item)
        return rows

    if isinstance(parsed, list):
        return [item for item in parsed if isinstance(item, dict)]
    if isinstance(parsed, dict):
        if isinstance(parsed.get("findings"), list):
            rows = [item for item in parsed["findings"] if isinstance(item, dict)]
            for row in rows:
                row.setdefault("agent_id", parsed.get("agent_id"))
            drops = parsed.get("dropped_candidates")
            if isinstance(drops, list):
                for row in rows:
                    row.setdefault("_source_dropped_candidates", drops)
            return rows
        return [parsed]
    raise ValueError(f"{path}: expected JSON object, array, or JSONL objects")


def _read_agent_output(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        return [], []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return _read_payload(path), []
    if not isinstance(parsed, dict):
        return _read_payload(path), []

    rows = parsed.get("findings", [])
    drops = parsed.get("dropped_candidates", [])
    findings = [item for item in rows if isinstance(item, dict)] if isinstance(rows, list) else []
    for row in findings:
        row.setdefault("agent_id", parsed.get("agent_id"))

    normalized_drops: list[dict[str, str]] = []
    if isinstance(drops, list):
        for item in drops:
            if not isinstance(item, dict):
                continue
            reason = str(item.get("drop_reason", "insufficient_evidence"))
            if reason not in DROP_REASONS:
                reason = "insufficient_evidence"
            normalized_drops.append(
                {
                    "candidate": str(item.get("candidate", "candidate")),
                    "class": str(item.get("class", "UNKNOWN")),
                    "drop_reason": reason,
                }
            )
    return findings, normalized_drops


def _normalize_finding(row: dict[str, Any], source: Path) -> dict[str, Any]:
    class_id = str(row.get("class_id", "")).strip()
    title = str(row.get("title", class_id or "Untitled Finding")).strip()
    file_path = str(row.get("file", row.get("entry_point", ""))).strip()
    if ":" in file_path and not row.get("line"):
        maybe_path, maybe_line = file_path.rsplit(":", 1)
        if maybe_line.isdigit():
            file_path = maybe_path
            row["line"] = int(maybe_line)

    evidence = _extract_tags(row.get("evidence_tags"))
    if "[CODE-TRACE]" not in evidence:
        evidence.insert(0, "[CODE-TRACE]")

    agent_id = str(row.get("agent_id", row.get("agent", ""))).strip()
    if agent_id == "5" and "[ADVERSARIAL]" not in evidence:
        evidence.append("[ADVERSARIAL]")

    confidence = max(0, min(100, _safe_int(row.get("confidence"), 75)))
    priority = str(row.get("priority", "P3")).strip().upper()
    if priority not in PRIORITY_RANK:
        priority = "P3"
    severity = str(row.get("severity", "Low")).strip().title()
    if severity not in SEVERITY_ORDER:
        severity = "Low"

    return {
        "title": title,
        "class_id": class_id or "UNKNOWN",
        "file": file_path or "unknown",
        "line": row.get("line"),
        "priority": priority,
        "severity": severity,
        "confidence": confidence,
        "description": str(row.get("description", "")).strip(),
        "attack_path": str(row.get("attack_path", "")).strip(),
        "guard_analysis": str(row.get("guard_analysis", "")).strip(),
        "recommended_fix": str(row.get("recommended_fix", "")).strip(),
        "required_tests": [str(item) for item in _as_list(row.get("required_tests")) if str(item)],
        "evidence_tags": evidence,
        "root_cause": str(row.get("root_cause", "")).strip(),
        "agent_id": agent_id,
        "source": source.as_posix(),
    }


def _root_key(finding: dict[str, Any]) -> str:
    explicit = str(finding.get("root_cause", "")).strip()
    if explicit:
        return explicit.lower()
    return "|".join(
        [
            str(finding.get("class_id", "")).lower(),
            str(finding.get("file", "")).lower(),
            str(finding.get("line", "")),
            str(finding.get("title", "")).lower(),
        ]
    )


def _better(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    a_key = (
        _safe_int(a.get("confidence")),
        -PRIORITY_RANK.get(str(a.get("priority", "P3")), 3),
        len(str(a.get("attack_path", ""))),
    )
    b_key = (
        _safe_int(b.get("confidence")),
        -PRIORITY_RANK.get(str(b.get("priority", "P3")), 3),
        len(str(b.get("attack_path", ""))),
    )
    return a if a_key >= b_key else b


def _load_preflight(path: Path | None) -> list[dict[str, Any]]:
    if path is None or not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("findings", [])
    return rows if isinstance(rows, list) else []


def _dedupe_and_tag(
    findings: list[dict[str, Any]],
    preflight: list[dict[str, Any]],
    *,
    proven_only: bool,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for finding in findings:
        grouped[_root_key(finding)].append(finding)

    merged: list[dict[str, Any]] = []
    dropped: list[dict[str, str]] = []
    for _key, group in grouped.items():
        winner = group[0]
        for candidate in group[1:]:
            winner = _better(winner, candidate)
        tags = []
        agents = {str(item.get("agent_id", "")) for item in group if str(item.get("agent_id", ""))}
        for item in group:
            for tag in _extract_tags(item.get("evidence_tags")):
                if tag not in tags:
                    tags.append(tag)
        if "[CODE-TRACE]" not in tags:
            tags.insert(0, "[CODE-TRACE]")
        if len(agents) >= 2 and "[CROSS-AGENT]" not in tags:
            tags.append("[CROSS-AGENT]")
        if "5" in agents and "[ADVERSARIAL]" not in tags:
            tags.append("[ADVERSARIAL]")

        for row in preflight:
            same_class = str(row.get("class_id")) == str(winner.get("class_id"))
            same_file = not row.get("file") or str(row.get("file")) == str(winner.get("file"))
            if same_class and same_file and "[PREFLIGHT-HIT]" not in tags:
                tags.append("[PREFLIGHT-HIT]")
                break

        winner["evidence_tags"] = tags
        if proven_only and tags == ["[CODE-TRACE]"]:
            winner["severity"] = "Low"
        merged.append(winner)

        for loser in group:
            if loser is winner:
                continue
            dropped.append(
                {
                    "candidate": str(loser.get("title", "duplicate")),
                    "class": str(loser.get("class_id", "UNKNOWN")),
                    "drop_reason": "duplicate_root_cause",
                }
            )

    merged.sort(
        key=lambda row: (
            PRIORITY_RANK.get(str(row.get("priority", "P3")), 3),
            -_safe_int(row.get("confidence")),
            str(row.get("title", "")),
        )
    )
    return merged, dropped


def _read_scope(scope_file: Path | None, repo_root: Path, findings: list[dict[str, Any]]) -> tuple[list[str], int]:
    paths: list[str] = []
    if scope_file and scope_file.exists():
        paths = [line.strip() for line in scope_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not paths:
        paths = sorted({str(row.get("file", "")) for row in findings if row.get("file")})
    total_lines = 0
    for raw in paths:
        path = Path(raw)
        if not path.is_absolute():
            path = repo_root / path
        try:
            total_lines += len(path.read_text(encoding="utf-8", errors="ignore").splitlines())
        except OSError:
            continue
    rel_paths: list[str] = []
    for raw in paths:
        path = Path(raw)
        if path.is_absolute():
            try:
                rel_paths.append(path.resolve().relative_to(repo_root.resolve()).as_posix())
                continue
            except ValueError:
                # path lives outside repo_root; keep the original absolute string in the scope table.
                pass
        rel_paths.append(raw)
    return rel_paths, total_lines


def _bundle_lines(workdir: Path, idx: int) -> int:
    path = workdir / f"cairo-audit-agent-{idx}-bundle.md"
    if not path.exists():
        return 0
    return len(path.read_text(encoding="utf-8", errors="ignore").splitlines())


def _read_agent_models(workdir: Path) -> dict[str, str]:
    """Parse `cairo-audit-agent-models.txt` if present.

    Accepts simple `agent=model` or `<idx>=<model>` lines so vector/adversarial
    overrides recorded by the orchestrator surface in the Execution Trace
    instead of always rendering as `unknown`.
    """
    path = workdir / "cairo-audit-agent-models.txt"
    if not path.exists():
        return {}
    models: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().lower()
        value = value.strip()
        if not key or not value:
            continue
        if key.startswith("agent_"):
            key = key[len("agent_") :]
        models[key] = value
    return models


def _agent_model(models: dict[str, str], idx: int, fallback_keys: tuple[str, ...] = ()) -> str:
    direct = models.get(str(idx))
    if direct:
        return direct
    for key in fallback_keys:
        value = models.get(key)
        if value:
            return value
    return "unknown"


def _findings_count(path: Path) -> int:
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}")
    except json.JSONDecodeError:
        return 0
    if isinstance(data, dict):
        findings = data.get("findings")
        if isinstance(findings, list):
            return len(findings)
    if isinstance(data, list):
        return sum(1 for item in data if isinstance(item, dict))
    return 0


def _render_report(
    *,
    repo_root: Path,
    mode: str,
    workdir: Path,
    findings: list[dict[str, Any]],
    dropped: list[dict[str, str]],
    scope_paths: list[str],
    total_lines: int,
    preflight_count: int,
    proven_only: bool,
    generated_at: str,
    integrity: str,
    threat_intel_status: str,
) -> str:
    counts = Counter(str(row.get("severity", "Low")) for row in findings)
    total = sum(counts.values())
    shown_files = " · ".join(f"`{_md_cell(path)}`" for path in scope_paths[:8]) or "none"
    if len(scope_paths) > 8:
        shown_files += f" · ... (+{len(scope_paths) - 8} more)"

    lines: list[str] = [
        f"# Security Review — {repo_root.name}",
        "",
        "## Signal Summary",
        "",
        "| Critical | High | Medium | Low | Total |",
        "|----------|------|--------|-----|-------|",
        f"| {counts.get('Critical', 0)} | {counts.get('High', 0)} | {counts.get('Medium', 0)} | {counts.get('Low', 0)} | {total} |",
        "",
        "---",
        "",
        "## Scope",
        "",
        "|                                  |                                                        |",
        "| -------------------------------- | ------------------------------------------------------ |",
        f"| **Mode**                         | {mode} |",
        f"| **Files reviewed**               | {shown_files} |",
        f"| **Total in-scope lines**         | {total_lines} |",
        "| **Confidence threshold (0-100)** | 75 |",
        f"| **Proven-only mode**             | {'on' if proven_only else 'off'} |",
        f"| **Preflight findings**           | {preflight_count} deterministic hits |",
        f"| **Generated**                    | {generated_at} |",
        "",
        f"`Execution Integrity: {integrity}`",
        "",
    ]
    if integrity == "DEGRADED":
        lines += ["`WARNING: degraded execution (specialist agents unavailable or strict-model fallback)`", ""]
    scope_path = workdir / "cairo-audit-files.txt"
    scope_status = "OK" if scope_path.exists() and scope_paths else "MISSING"
    agent_models = _read_agent_models(workdir)
    lines += [
        "---",
        "",
        "## Execution Trace",
        "",
        "| Stage | Model | Evidence | Status |",
        "|---|---|---|---|",
        f"| Scope discovery | n/a | `{scope_path}` ({len(scope_paths)} files) | {scope_status} |",
        f"| Threat intel enrichment (optional) | n/a | `{workdir / 'cairo-audit-threat-intel.md'}` | {_md_cell(threat_intel_status)} |",
    ]
    for idx in range(1, 5):
        bundle = workdir / f"cairo-audit-agent-{idx}-bundle.md"
        bundle_lines_count = _bundle_lines(workdir, idx)
        if not bundle.exists():
            agent_status = "MISSING"
        elif bundle_lines_count <= 0:
            agent_status = "EMPTY"
        else:
            agent_status = "OK"
        model_label = _agent_model(agent_models, idx, fallback_keys=("vector", "default"))
        lines.append(
            f"| Agent {idx} vector scan | {_md_cell(model_label)} | `{bundle}` ({bundle_lines_count} lines) | {agent_status} |"
        )
    agent5_findings_path = workdir / "cairo-audit-agent-5-findings.json"
    agent5_bundle = workdir / "cairo-audit-agent-5-bundle.md"
    agent5_findings = _findings_count(agent5_findings_path)
    agent5_bundle_lines = _bundle_lines(workdir, 5)
    if mode not in {"deep", "degraded-deep"}:
        agent5_status = "SKIPPED"
        agent5_evidence = f"direct read from `{scope_path}`"
    elif agent5_findings_path.exists() and agent5_findings > 0:
        agent5_status = "OK"
        agent5_evidence = f"`{agent5_findings_path}` ({agent5_findings} findings)"
    elif agent5_bundle.exists() and agent5_bundle_lines > 0:
        agent5_status = "OK"
        agent5_evidence = f"`{agent5_bundle}` ({agent5_bundle_lines} lines)"
    else:
        agent5_status = "MISSING"
        agent5_evidence = f"`{agent5_findings_path}` (not produced)"
    agent5_model = _agent_model(agent_models, 5, fallback_keys=("adversarial", "default"))
    lines += [
        f"| Agent 5 adversarial (deep only) | {_md_cell(agent5_model)} | {agent5_evidence} | {agent5_status} |",
        "",
        "---",
        "",
        "## Findings",
        "",
    ]

    if not findings:
        lines += ["No findings.", "", "---", ""]
    for idx, finding in enumerate(findings, 1):
        tags = " ".join(_extract_tags(finding.get("evidence_tags")))
        line = finding.get("line")
        location = f"{finding.get('file')}:{line}" if line else str(finding.get("file"))
        lines += [
            f"[{finding.get('priority')}] **{idx}. {_md_cell(finding.get('title'))}**",
            "",
            f"`Class: {finding.get('class_id')}` · `{_md_cell(location)}` · Confidence: {finding.get('confidence')} · Severity: {finding.get('severity')} · `{tags}`",
            "",
            "**Description**",
            str(finding.get("description") or finding.get("attack_path") or "Concrete in-scope path reported by specialist."),
            "",
        ]
        if finding.get("guard_analysis"):
            lines += ["**Guard Analysis**", str(finding.get("guard_analysis")), ""]
        if _safe_int(finding.get("confidence")) >= 75:
            fix = str(finding.get("recommended_fix") or "Add the missing guard or invariant before the vulnerable transition.")
            lines += ["**Fix**", "", "```diff", fix, "```", ""]
            tests = [str(item) for item in _as_list(finding.get("required_tests")) if str(item)]
            if tests:
                lines.append("**Required Tests**")
                for test in tests:
                    lines.append(f"- {test}")
                lines.append("")
        lines += ["---", ""]

    lines += ["## Dropped Candidates", "", "| Candidate | Class | Drop Reason |", "|-----------|-------|-------------|"]
    if dropped:
        for row in dropped:
            reason = row.get("drop_reason", "insufficient_evidence")
            if reason not in DROP_REASONS:
                reason = "insufficient_evidence"
            lines.append(f"| `{_md_cell(row.get('candidate', 'candidate'))}` | `{_md_cell(row.get('class', 'UNKNOWN'))}` | `{reason}` |")
    else:
        lines.append("| `none` | `n/a` | `n/a` |")
    lines += ["", "---", ""]
    if integrity == "DEGRADED":
        lines += ["`WARNING: degraded execution may omit exploitable paths`", "", "---", ""]

    lines += ["## Findings Index", "", "| # | Priority | Confidence | Severity | Evidence | Title |", "|---|----------|------------|----------|----------|-------|"]
    threshold_inserted = False
    for idx, finding in enumerate(findings, 1):
        if not threshold_inserted and _safe_int(finding.get("confidence")) < 75:
            lines.append("|   |          |            |          |  | **Below Confidence Threshold** |")
            threshold_inserted = True
        tags = " ".join(_extract_tags(finding.get("evidence_tags")))
        lines.append(
            f"| {idx} | {finding.get('priority')} | {finding.get('confidence')} | {finding.get('severity')} | `{tags}` | {_md_cell(finding.get('title'))} |"
        )
    if not findings:
        lines.append("| - | - | - | - | - | none |")
    lines += [
        "",
        "---",
        "",
        "> **Disclaimer.** This review was performed by an automated AI tool. Automated analysis catches pattern-based vulnerabilities but cannot detect specification bugs, economic exploits, cross-protocol interactions, or game-theoretic attacks. This report does not guarantee the absence of vulnerabilities. Use it as a pre-commit and pre-deployment gate, not as a substitute for professional security audits, formal verification, or manual code review.",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render structured cairo-auditor findings.")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--mode", default="default", choices=["default", "deep", "targeted", "degraded-deep"])
    parser.add_argument("--workdir", default=os.environ.get("CAIRO_AUDITOR_WORKDIR", "/tmp"))
    parser.add_argument("--scope-file", default="")
    parser.add_argument("--preflight-json", default="")
    parser.add_argument("--agent-output", action="append", default=[])
    parser.add_argument("--output-md", required=True)
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--execution-integrity", default="FULL", choices=["FULL", "DEGRADED", "FAILED"])
    parser.add_argument("--threat-intel-status", default="SKIPPED: not requested")
    parser.add_argument("--proven-only", action="store_true")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    workdir = Path(args.workdir).resolve()
    preflight_path = Path(args.preflight_json).resolve() if args.preflight_json else None
    scope_file = Path(args.scope_file).resolve() if args.scope_file else None
    raw_findings: list[dict[str, Any]] = []
    raw_dropped: list[dict[str, str]] = []
    for raw_path in args.agent_output:
        path = Path(raw_path).resolve()
        rows, drops = _read_agent_output(path)
        raw_findings.extend(_normalize_finding(row, path) for row in rows)
        raw_dropped.extend(drops)

    preflight = _load_preflight(preflight_path)
    findings, dropped = _dedupe_and_tag(raw_findings, preflight, proven_only=args.proven_only)
    dropped = raw_dropped + dropped
    scope_paths, total_lines = _read_scope(scope_file, repo_root, findings)
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()

    payload = {
        "generated_at": generated_at,
        "repo_root": repo_root.as_posix(),
        "mode": args.mode,
        "execution_integrity": args.execution_integrity,
        "findings": findings,
        "dropped_candidates": dropped or [{"candidate": "none", "class": "n/a", "drop_reason": "n/a"}],
    }
    out_json = Path(args.output_json).resolve()
    out_md = Path(args.output_md).resolve()
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(
        _render_report(
            repo_root=repo_root,
            mode=args.mode,
            workdir=workdir,
            findings=findings,
            dropped=dropped,
            scope_paths=scope_paths,
            total_lines=total_lines,
            preflight_count=len(preflight),
            proven_only=args.proven_only,
            generated_at=generated_at,
            integrity=args.execution_integrity,
            threat_intel_status=args.threat_intel_status,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"findings": len(findings), "output_md": out_md.as_posix(), "output_json": out_json.as_posix()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
