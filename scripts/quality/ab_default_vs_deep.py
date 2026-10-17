#!/usr/bin/env python3
"""Default-vs-deep A/B comparison for the cairo-auditor (#2).

Deep mode's premium cost is the adversarial Agent 5 (opus / gpt-5.4). This
harness answers the only question that justifies that cost: *does deep mode
surface findings the default 4-agent scan misses?*

It consumes the two rendered structured-report JSON artifacts
(`structured_report.py --output-json`) — one from a default run, one from a deep
run over the **same** repo at the **same** ref — and reports:

- findings only in default, only in deep, and in both (keyed by root cause);
- how many deep-only findings are adversarial-attributable (`[ADVERSARIAL]` /
  `[CROSS-AGENT]` tags) — the marginal value Agent 5 actually adds;
- a recall-delta and a cost proxy (agent count / model tier);
- a verdict: did Agent 5 earn its cost in this run?

Run it after generating both artifacts (see `evals/README.md`). It is pure data
comparison — it does not invoke the LLM — so its output is deterministic and
auditable.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

ADVERSARIAL_TAGS = {"[ADVERSARIAL]", "[CROSS-AGENT]"}
SEVERITY_RANK = {"Critical": 3, "High": 2, "Medium": 1, "Low": 0}


def _load_findings(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("findings"), list):
        return [f for f in data["findings"] if isinstance(f, dict)]
    if isinstance(data, list):
        return [f for f in data if isinstance(f, dict)]
    return []


def _key(finding: dict[str, Any]) -> str:
    rc = str(finding.get("root_cause", "")).strip().lower()
    if rc:
        return rc
    return "|".join(
        [
            str(finding.get("class_id", "")).lower(),
            str(finding.get("file", "")).lower(),
            str(finding.get("title", "")).lower(),
        ]
    )


def _tags(finding: dict[str, Any]) -> set[str]:
    return {str(t) for t in finding.get("evidence_tags", []) if isinstance(finding.get("evidence_tags"), list)}


def _summary_row(finding: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": str(finding.get("title", "")),
        "class_id": str(finding.get("class_id", "")),
        "file": str(finding.get("file", "")),
        "severity": str(finding.get("severity", "Low")),
        "confidence": finding.get("confidence"),
        "evidence_tags": sorted(_tags(finding)),
    }


def compare(default_findings: list[dict[str, Any]], deep_findings: list[dict[str, Any]]) -> dict[str, Any]:
    default_by_key = {_key(f): f for f in default_findings}
    deep_by_key = {_key(f): f for f in deep_findings}

    only_default_keys = sorted(set(default_by_key) - set(deep_by_key))
    only_deep_keys = sorted(set(deep_by_key) - set(default_by_key))
    both_keys = sorted(set(default_by_key) & set(deep_by_key))

    only_deep = [deep_by_key[k] for k in only_deep_keys]
    adversarial_attributable = [f for f in only_deep if _tags(f) & ADVERSARIAL_TAGS]
    deep_only_med_plus = [f for f in only_deep if SEVERITY_RANK.get(str(f.get("severity")), 0) >= 1]

    verdict_earned = bool(deep_only_med_plus)
    if verdict_earned and adversarial_attributable:
        verdict = "EARNED — deep surfaced Medium+ findings default missed, with adversarial/cross-agent attribution"
    elif verdict_earned:
        verdict = "EARNED — deep surfaced Medium+ findings default missed"
    elif only_deep:
        verdict = "MARGINAL — deep added only Low-severity findings over default"
    else:
        verdict = "NOT EARNED in this run — deep produced no findings default missed"

    return {
        "default_count": len(default_findings),
        "deep_count": len(deep_findings),
        "only_default": [_summary_row(default_by_key[k]) for k in only_default_keys],
        "only_deep": [_summary_row(f) for f in only_deep],
        "in_both": len(both_keys),
        "deep_only_count": len(only_deep),
        "deep_only_medium_plus": len(deep_only_med_plus),
        "adversarial_attributable_count": len(adversarial_attributable),
        "cost_proxy": {
            "default_agents": 4,
            "deep_agents": 5,
            "premium_model_agents_deep": 1,
            "note": "Agent 5 runs on the premium model (opus / gpt-5.4); see model-plan for exact labels.",
        },
        "verdict": verdict,
        "verdict_earned": verdict_earned,
    }


def render_markdown(metrics: dict[str, Any], *, default_path: str, deep_path: str, generated_at: str) -> str:
    L: list[str] = []
    L.append("# Cairo Auditor — Default vs Deep A/B")
    L.append("")
    L.append(f"Generated: {generated_at}")
    L.append(f"- Default artifact: `{default_path}`")
    L.append(f"- Deep artifact: `{deep_path}`")
    L.append("")
    L.append("## Headline")
    L.append("")
    L.append("| Metric | Value |")
    L.append("| --- | ---: |")
    L.append(f"| Default findings | {metrics['default_count']} |")
    L.append(f"| Deep findings | {metrics['deep_count']} |")
    L.append(f"| In both | {metrics['in_both']} |")
    L.append(f"| Deep-only | {metrics['deep_only_count']} |")
    L.append(f"| Deep-only (Medium+) | {metrics['deep_only_medium_plus']} |")
    L.append(f"| Deep-only adversarial/cross-agent | {metrics['adversarial_attributable_count']} |")
    L.append("")
    L.append(f"**Verdict: {metrics['verdict']}**")
    L.append("")
    L.append("## Deep-only findings (the marginal value of Agent 5)")
    L.append("")
    if metrics["only_deep"]:
        L.append("| Title | Class | File | Severity | Confidence | Evidence |")
        L.append("| --- | --- | --- | --- | ---: | --- |")
        for r in metrics["only_deep"]:
            tags = " ".join(r["evidence_tags"])
            L.append(
                f"| {r['title']} | `{r['class_id']}` | `{r['file']}` | {r['severity']} | {r['confidence']} | `{tags}` |"
            )
    else:
        L.append("_None — deep mode found nothing default did not in this run._")
    L.append("")
    L.append("## Findings only in default (deep regressions, if any)")
    L.append("")
    if metrics["only_default"]:
        L.append("| Title | Class | File | Severity |")
        L.append("| --- | --- | --- | --- |")
        for r in metrics["only_default"]:
            L.append(f"| {r['title']} | `{r['class_id']}` | `{r['file']}` | {r['severity']} |")
    else:
        L.append("_None — deep mode is a superset of default in this run._")
    L.append("")
    L.append("## Cost proxy")
    L.append("")
    cp = metrics["cost_proxy"]
    L.append(f"- Default: {cp['default_agents']} agents (vector model).")
    L.append(f"- Deep: {cp['deep_agents']} agents, {cp['premium_model_agents_deep']} on the premium model.")
    L.append(f"- {cp['note']}")
    L.append("")
    L.append("> Run over the same repo + ref for both artifacts. A single run is anecdotal;")
    L.append("> aggregate across several repos before drawing a conclusion about deep mode.")
    L.append("")
    return "\n".join(L)


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare default-mode vs deep-mode auditor findings.")
    parser.add_argument("--default-json", required=True, help="structured_report.py JSON from a default run")
    parser.add_argument("--deep-json", required=True, help="structured_report.py JSON from a deep run")
    parser.add_argument("--output-md", required=True)
    parser.add_argument("--output-json", default="")
    args = parser.parse_args()

    default_path = Path(args.default_json).resolve()
    deep_path = Path(args.deep_json).resolve()
    default_findings = _load_findings(default_path)
    deep_findings = _load_findings(deep_path)

    metrics = compare(default_findings, deep_findings)
    from datetime import UTC, datetime

    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    markdown = render_markdown(
        metrics, default_path=default_path.name, deep_path=deep_path.name, generated_at=generated_at
    )

    out_md = Path(args.output_md).resolve()
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_md.write_text(markdown + "\n", encoding="utf-8")
    if args.output_json:
        out_json = Path(args.output_json).resolve()
        out_json.parent.mkdir(parents=True, exist_ok=True)
        out_json.write_text(json.dumps(metrics, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "default_count": metrics["default_count"],
                "deep_count": metrics["deep_count"],
                "deep_only_count": metrics["deep_only_count"],
                "verdict_earned": metrics["verdict_earned"],
                "output_md": out_md.as_posix(),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
