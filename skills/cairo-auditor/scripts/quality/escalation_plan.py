#!/usr/bin/env python3
"""Density-based model escalation plan (#8).

Policy: run the cheap vector model on the whole scope first, then promote to
the stronger (opus / gpt-5.4) model ONLY for files where the first pass
surfaced signal. Most files in a typical contract are clean, so escalating
everything wastes the premium model budget.

A file warrants escalation when the first-pass agent output (the
`cairo-audit-agent-*-findings.json` files) contains, for that file:
  - any finding (a confirmed candidate is worth a stronger second look), or
  - a borderline candidate (a dropped_candidate with reason
    `below_confidence_threshold` / `insufficient_evidence`), or
  - a P0/P1 finding (always escalate high-priority surfaces).

The orchestrator reads this plan to decide which files to re-check with the
adversarial / opus model, leaving the rest at the cheap model.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

BORDERLINE_DROP_REASONS = {"below_confidence_threshold", "insufficient_evidence"}
HIGH_PRIORITY = {"P0", "P1"}


def _load(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8") or "{}")
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def build_plan(agent_outputs: list[Path]) -> dict[str, Any]:
    escalate: dict[str, dict[str, Any]] = {}

    def mark(file_path: str, reason: str, *, high: bool = False) -> None:
        if not file_path:
            return
        row = escalate.setdefault(file_path, {"file": file_path, "reasons": [], "high_priority": False})
        if reason not in row["reasons"]:
            row["reasons"].append(reason)
        if high:
            row["high_priority"] = True

    seen_files: set[str] = set()
    for path in agent_outputs:
        data = _load(path)
        for finding in data.get("findings", []) if isinstance(data.get("findings"), list) else []:
            if not isinstance(finding, dict):
                continue
            file_path = str(finding.get("file", "")).split(":")[0].strip()
            seen_files.add(file_path)
            priority = str(finding.get("priority", "")).upper()
            if priority in HIGH_PRIORITY:
                mark(file_path, f"{priority} finding in first pass", high=True)
            else:
                mark(file_path, "finding in first pass")
        for drop in data.get("dropped_candidates", []) if isinstance(data.get("dropped_candidates"), list) else []:
            if not isinstance(drop, dict):
                continue
            if str(drop.get("drop_reason")) in BORDERLINE_DROP_REASONS:
                # Dropped candidates rarely carry a file; attribute to the agent
                # scope so the orchestrator re-checks broadly when borderline.
                mark(str(drop.get("candidate", "")) or "(scope)", "borderline candidate in first pass")

    escalate_files = sorted(escalate)
    return {
        "escalate_files": escalate_files,
        "escalate_detail": [escalate[f] for f in escalate_files],
        "model_for_escalated": "adversarial",
        "model_for_rest": "vector",
        "summary": (
            f"{len(escalate_files)} file(s) warrant opus/adversarial re-check; "
            f"remaining files stay on the vector model."
            if escalate_files
            else "no first-pass signal — keep the entire scope on the vector model."
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute density-based model escalation plan.")
    parser.add_argument("--workdir", default="", help="Glob cairo-audit-agent-*-findings.json from here.")
    parser.add_argument("--agent-output", action="append", default=[], help="Explicit agent findings JSON path(s).")
    parser.add_argument("--output", default="", help="Optional path to write the plan JSON.")
    args = parser.parse_args()

    paths: list[Path] = [Path(p).resolve() for p in args.agent_output]
    if args.workdir:
        paths += sorted(Path(args.workdir).resolve().glob("cairo-audit-agent-*-findings.json"))
    # De-duplicate while preserving order.
    seen: set[str] = set()
    unique: list[Path] = []
    for p in paths:
        key = p.as_posix()
        if key not in seen:
            seen.add(key)
            unique.append(p)

    plan = build_plan(unique)
    text = json.dumps(plan, indent=2, ensure_ascii=True)
    if args.output:
        out = Path(args.output).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
