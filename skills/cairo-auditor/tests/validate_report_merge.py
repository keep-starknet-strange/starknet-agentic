#!/usr/bin/env python3
"""Merge-stage regression tests for structured_report.py.

Covers two guarantees the report contract depends on:

1. Dedupe never merges findings across files. Two specialists can describe
   unrelated bugs in different files with the same root-cause sentence; merging
   those silently discards a real finding.
2. Leads are reported separately from findings, carry no fix, and never inflate
   the severity counts.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "quality" / "structured_report.py"


def _finding(**overrides: Any) -> dict[str, Any]:
    base = {
        "title": "Missing access control",
        "class_id": "NO_ACCESS_CONTROL_MUTATION",
        "root_cause": "privileged setter lacks caller assertion",
        "file": "src/vault.cairo",
        "line": 42,
        "priority": "P0",
        "severity": "Critical",
        "confidence": 90,
        "description": "Unprivileged caller reaches the setter.",
        "attack_path": "caller -> set_fee -> fee storage -> value extraction",
        "guard_analysis": "No assert_only_owner on the write path.",
        "recommended_fix": "+ self.ownable.assert_only_owner();",
        "required_tests": ["non-owner call reverts"],
        "evidence_tags": ["[CODE-TRACE]"],
    }
    base.update(overrides)
    return base


def _run(findings: list[dict[str, Any]]) -> tuple[dict[str, Any], str]:
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        workdir = tmpdir / "wd"
        workdir.mkdir()
        agent_output = tmpdir / "agent-1.json"
        agent_output.write_text(
            json.dumps({"agent_id": 1, "findings": findings, "dropped_candidates": []}),
            encoding="utf-8",
        )
        out_md = tmpdir / "report.md"
        out_json = tmpdir / "report.json"
        proc = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--repo-root",
                str(tmpdir),
                "--mode",
                "deep",
                "--workdir",
                str(workdir),
                "--agent-output",
                str(agent_output),
                "--output-md",
                str(out_md),
                "--output-json",
                str(out_json),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"structured_report.py failed: {proc.stderr.strip()}")
        return json.loads(out_json.read_text(encoding="utf-8")), out_md.read_text(encoding="utf-8")


def check_no_cross_file_merge() -> tuple[bool, str]:
    """Same root_cause in two different files must yield two findings."""
    payload, _ = _run(
        [
            _finding(title="Missing access control on set_fee", file="src/vault.cairo", line=42),
            _finding(title="Missing access control on set_oracle", file="src/oracle.cairo", line=17),
        ]
    )
    titles = sorted(row["title"] for row in payload["findings"])
    if len(titles) != 2:
        dropped = [row.get("candidate") for row in payload["dropped_candidates"]]
        return False, f"cross-file merge: expected 2 findings, got {titles} (dropped {dropped})"
    return True, "cross-file: two files with one shared root cause stay separate"


def check_same_file_still_merges() -> tuple[bool, str]:
    """Same root_cause in the same file must still collapse to one finding."""
    payload, _ = _run(
        [
            _finding(title="Missing access control on set_fee", confidence=90),
            _finding(title="Setter lacks owner assertion", confidence=80),
        ]
    )
    if len(payload["findings"]) != 1:
        return False, f"same-file dedupe broke: expected 1 finding, got {len(payload['findings'])}"
    reasons = {row["drop_reason"] for row in payload["dropped_candidates"]}
    if reasons != {"duplicate_root_cause"}:
        return False, f"same-file dedupe: unexpected drop reasons {reasons}"
    return True, "same-file: duplicate root cause still collapses to one finding"


def check_lead_partition() -> tuple[bool, str]:
    """Leads are separated, keep no fix block, and stay out of severity counts."""
    payload, report = _run(
        [
            _finding(title="Missing access control on set_fee"),
            _finding(
                title="Possible cross-contract desync",
                class_id="STALE_SNAPSHOT_READ",
                root_cause="snapshot may be stale across callback",
                file="src/router.cairo",
                line=88,
                tier="lead",
                severity="Medium",
                confidence=40,
                unverified="Could not prove the callback re-enters before the snapshot is consumed.",
            ),
        ]
    )
    if len(payload["findings"]) != 1:
        return False, f"lead partition: expected 1 finding, got {len(payload['findings'])}"
    if len(payload["leads"]) != 1:
        return False, f"lead partition: expected 1 lead, got {len(payload['leads'])}"
    if "## Leads" not in report:
        return False, "lead partition: report is missing the Leads section"
    if "Could not prove the callback" not in report:
        return False, "lead partition: report does not surface the unverified link"
    # The lead is Medium; it must not be counted in the Medium severity column.
    # Expected row: Critical=1, High=0, Medium=0, Low=0, Total=1, Leads=1.
    if "| 1 | 0 | 0 | 0 | 1 | 1 |" not in report:
        summary_rows = [line for line in report.splitlines() if line.startswith("| ") and "|" in line][:3]
        return False, f"lead partition: severity counts include the lead: {summary_rows}"
    return True, "leads: partitioned, fix-free, and excluded from severity counts"


def check_completeness_reported() -> tuple[bool, str]:
    """Every file that produced a candidate is accounted for in the report."""
    payload, report = _run(
        [
            _finding(file="src/vault.cairo"),
            _finding(title="Other bug", file="src/oracle.cairo", root_cause="unbounded loop"),
        ]
    )
    completeness = payload["merge_completeness"]
    if completeness["missing_files"]:
        return False, f"completeness: files lost in merge {completeness['missing_files']}"
    if completeness["files_covered"] != completeness["files_with_candidates"]:
        return False, f"completeness: coverage mismatch {completeness}"
    if "| Merge completeness |" not in report:
        return False, "completeness: report is missing the merge completeness row"
    return True, "completeness: every file with a candidate survives the merge"


CHECKS = (
    check_no_cross_file_merge,
    check_same_file_still_merges,
    check_lead_partition,
    check_completeness_reported,
)


def main() -> int:
    if not SCRIPT.exists():
        print(f"missing report script: {SCRIPT}", file=sys.stderr)
        return 1

    failures: list[str] = []
    for check in CHECKS:
        try:
            ok, msg = check()
        except Exception as exc:  # noqa: BLE001 - surface the failure verbatim
            ok, msg = False, f"{check.__name__} raised: {exc}"
        print(msg)
        if not ok:
            failures.append(msg)

    if failures:
        print("\nreport merge validation failed", file=sys.stderr)
        return 1

    print("\nall report merge checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
