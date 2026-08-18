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


def check_case_distinct_files_stay_separate() -> tuple[bool, str]:
    """Paths differing only by case are different files on a case-sensitive FS."""
    payload, _ = _run(
        [
            _finding(title="Missing access control in Foo", file="src/Foo.cairo"),
            _finding(title="Missing access control in foo", file="src/foo.cairo"),
        ]
    )
    if len(payload["findings"]) != 2:
        dropped = [row.get("candidate") for row in payload["dropped_candidates"]]
        return False, f"case-distinct files merged: got {len(payload['findings'])} finding(s), dropped {dropped}"
    return True, "case: paths differing only by case are not merged"


def check_completeness_ignores_dropped_coverage() -> tuple[bool, str]:
    """A file present only in dropped candidates must not count as covered.

    Exercised as a unit because the end-to-end path can no longer produce a
    cross-file merge -- which is the point, but it means the masking bug this
    guards against has to be constructed directly.
    """
    sys.path.insert(0, str(ROOT / "scripts" / "quality"))
    from structured_report import _completeness  # noqa: PLC0415 - deliberate late import

    raw = [{"file": "src/a.cairo"}, {"file": "src/b.cairo"}]
    merged = [{"file": "src/a.cairo"}]
    dropped = [{"file": "src/b.cairo", "drop_reason": "duplicate_root_cause"}]
    covered, total, suspects = _completeness(raw, merged, dropped)
    if covered != 1 or total != 2:
        return False, f"completeness miscounted: covered={covered} total={total} (expected 1/2)"
    if suspects != ["src/b.cairo"]:
        return False, f"completeness did not flag the merge-lost file: {suspects}"

    # A file dropped as a false positive is an expected outcome, not a merge bug.
    fp_dropped = [{"file": "src/b.cairo", "drop_reason": "false_positive"}]
    _, _, fp_suspects = _completeness(raw, merged, fp_dropped)
    if fp_suspects:
        return False, f"false-positive drop wrongly flagged as a merge suspect: {fp_suspects}"
    return True, "completeness: dropped candidates never count as coverage"


def check_schema_conditionals_enforced_at_runtime() -> tuple[bool, str]:
    """deep_integrity must enforce the schema's conditionals, not just ajv.

    The finding schema expresses its conditionals under `allOf`. The bundled
    validator previously evaluated only a top-level `if`, so both requirements
    passed silently there while a spec-compliant validator still enforced them.
    """
    import importlib.util  # noqa: PLC0415 - deliberate late import

    spec = importlib.util.spec_from_file_location(
        "deep_integrity_probe", ROOT / "scripts" / "quality" / "deep_integrity.py"
    )
    if spec is None or spec.loader is None:
        return False, "could not load deep_integrity for validation probe"
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    schema = json.loads((ROOT / "references" / "finding.schema.json").read_text(encoding="utf-8"))

    cases = [
        ("high-confidence finding without a fix", _finding(recommended_fix=None, required_tests=None), False),
        ("high-confidence finding with a fix", _finding(), True),
        ("lead with unverified", _finding(tier="lead", unverified="u"), True),
        ("lead without unverified", _finding(tier="lead"), False),
        ("invalid tier value", _finding(tier="maybe"), False),
    ]
    for name, finding, should_pass in cases:
        finding = {k: v for k, v in finding.items() if v is not None}
        errors: list[str] = []
        module._validate(
            {"agent_id": 1, "findings": [finding], "dropped_candidates": []}, schema, "$", errors
        )
        if (not errors) != should_pass:
            verb = "accepted" if not errors else "rejected"
            return False, f"deep_integrity {verb} {name}; expected the opposite"
    return True, "schema: deep_integrity enforces both allOf conditionals"


def check_completeness_reported() -> tuple[bool, str]:
    """Every file that produced a candidate is accounted for in the report."""
    payload, report = _run(
        [
            _finding(file="src/vault.cairo"),
            _finding(title="Other bug", file="src/oracle.cairo", root_cause="unbounded loop"),
        ]
    )
    completeness = payload["merge_completeness"]
    if completeness["merge_suspect_files"]:
        return False, f"completeness: files lost to a cross-file merge {completeness['merge_suspect_files']}"
    if completeness["files_covered"] != completeness["files_with_candidates"]:
        return False, f"completeness: coverage mismatch {completeness}"
    if "| Merge completeness |" not in report:
        return False, "completeness: report is missing the merge completeness row"
    return True, "completeness: every file with a candidate survives the merge"


CHECKS = (
    check_no_cross_file_merge,
    check_case_distinct_files_stay_separate,
    check_same_file_still_merges,
    check_lead_partition,
    check_completeness_ignores_dropped_coverage,
    check_completeness_reported,
    check_schema_conditionals_enforced_at_runtime,
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
