#!/usr/bin/env python3
"""Determinism and assignment tests for the SCAbench scorer.

`evals/**` requires evaluation code to be deterministic and reproducible, which
for a matcher means the scorecard must be a function of the score matrix alone --
never of the order the expected findings or the reported findings arrive in.

An earlier greedy implementation violated that: an expected finding could claim a
report on a weak edge and block a later expected finding whose only edge was that
same report, so the result depended on iteration order.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from score import (  # noqa: E402 - path set above
    AUTO_MATCH_THRESHOLD,
    _max_matching,
    load_ground_truth,
    score,
)


def check_matching_is_maximum() -> tuple[bool, str]:
    """The A/R and B/R conflict: a weak edge must not block a strong one."""
    # A can take report 0 or 1; B can only take report 0. A maximum matching pairs
    # A->1 and B->0. A greedy pass in this order would take A->0 and lose B.
    edges = {0: [0, 1], 1: [0]}
    assignment = _max_matching(edges, order=[0, 1])
    if len(assignment) != 2:
        return False, f"matching lost a pair: {assignment} (expected both expected findings matched)"
    if assignment.get(1) != 0:
        return False, f"matching starved the constrained node: {assignment}"
    return True, "matching: maximum cardinality, weak edge does not block a strong one"


def check_matching_order_independent() -> tuple[bool, str]:
    """Same edges, different iteration order, same cardinality."""
    edges = {0: [0, 1], 1: [0], 2: [1, 2]}
    sizes = {
        len(_max_matching(edges, order=list(perm)))
        for perm in ([0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0])
    }
    if len(sizes) != 1:
        return False, f"matching cardinality varies with order: {sizes}"
    return True, f"matching: cardinality stable across orderings ({sizes.pop()} pairs)"


def _vuln(fid: str, title: str) -> dict[str, Any]:
    return {"finding_id": fid, "severity": "high", "title": title, "description": ""}


def _report(title: str, **extra: Any) -> dict[str, Any]:
    row = {"title": title, "class_id": "", "description": "", "root_cause": "", "attack_path": ""}
    row.update(extra)
    return row


def check_scorecard_order_independent() -> tuple[bool, str]:
    """Reversing either input list must not change any verdict."""
    project = {
        "project_id": "synthetic",
        "vulnerabilities": [
            _vuln("F-01", "Unchecked l1_handler from_address allows arbitrary minting"),
            _vuln("F-02", "Controlled class hash reaches library_call_syscall"),
            _vuln("F-03", "Span indexed with a length captured before pop_front"),
        ],
    }
    reports = [
        _report("Unchecked l1_handler from_address permits arbitrary minting"),
        _report("Caller controlled class hash reaches library_call_syscall"),
        _report("Totally unrelated gas optimisation note"),
    ]

    def verdicts(proj: dict[str, Any], rows: list[dict[str, Any]]) -> dict[str, str]:
        card = score(proj, rows)
        return {row["finding_id"]: row["verdict"] for row in card["per_finding"]}

    baseline = verdicts(project, reports)
    reversed_reports = verdicts(project, list(reversed(reports)))
    reversed_expected = verdicts(
        {**project, "vulnerabilities": list(reversed(project["vulnerabilities"]))}, reports
    )
    if baseline != reversed_reports:
        return False, f"verdicts changed when reports were reversed: {baseline} vs {reversed_reports}"
    if baseline != reversed_expected:
        return False, f"verdicts changed when expected were reversed: {baseline} vs {reversed_expected}"
    return True, "scorecard: verdicts independent of expected and report ordering"


def check_no_report_claimed_twice() -> tuple[bool, str]:
    """One report cannot satisfy two expected findings."""
    project = {
        "project_id": "synthetic",
        "vulnerabilities": [
            _vuln("F-01", "Unchecked l1_handler from_address allows minting"),
            _vuln("F-02", "Unchecked l1_handler from_address allows minting"),
        ],
    }
    reports = [_report("Unchecked l1_handler from_address allows minting")]
    card = score(project, reports)
    matched = [r for r in card["per_finding"] if r["verdict"] != "unmatched"]
    if len(matched) > 1:
        return False, f"one report satisfied {len(matched)} expected findings"
    return True, "assignment: a report is claimed by at most one expected finding"


def check_lead_never_auto_matches() -> tuple[bool, str]:
    """A lead is not a proven finding, however well its text matches."""
    title = "Unchecked l1_handler from_address allows arbitrary minting"
    project = {"project_id": "synthetic", "vulnerabilities": [_vuln("F-01", title)]}
    lead_card = score(project, [_report(title, _tier="lead")])
    verdict = lead_card["per_finding"][0]["verdict"]
    if verdict == "auto_matched":
        return False, "a lead was counted as a proven match, inflating the recall floor"
    if lead_card["recall_floor"] != 0.0:
        return False, f"lead raised the recall floor to {lead_card['recall_floor']}"

    # Sanity: the identical text as a normal finding must clear the auto threshold,
    # otherwise this test would pass for the wrong reason.
    finding_card = score(project, [_report(title)])
    if finding_card["per_finding"][0]["score"] < AUTO_MATCH_THRESHOLD:
        return False, "control case did not clear the auto threshold; test is vacuous"
    if finding_card["recall_floor"] != 1.0:
        return False, f"control case recall floor was {finding_card['recall_floor']}, expected 1.0"
    return True, "leads: capped at needs_review, control case auto-matches"


def check_ground_truth_loads() -> tuple[bool, str]:
    """The vendored target must stay loadable and pinned."""
    project = load_ground_truth("code4rena_starknet-perpetual_2025_06")
    if len(project.get("vulnerabilities", [])) != 13:
        return False, f"expected 13 vendored findings, got {len(project.get('vulnerabilities', []))}"
    if not project.get("expected_cairo_content_sha256"):
        return False, "vendored target has no expected_cairo_content_sha256; the content pin is absent"
    return True, "ground truth: 13 findings, content digest pinned"


CHECKS = (
    check_matching_is_maximum,
    check_matching_order_independent,
    check_scorecard_order_independent,
    check_no_report_claimed_twice,
    check_lead_never_auto_matches,
    check_ground_truth_loads,
)


def main() -> int:
    failures: list[str] = []
    for check in CHECKS:
        try:
            ok, message = check()
        except Exception as exc:  # noqa: BLE001 - surface the failure verbatim
            ok, message = False, f"{check.__name__} raised: {exc}"
        print(f"  {message}")
        if not ok:
            failures.append(message)

    if failures:
        print("\nscorer validation failed", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    print("\nall scorer checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
