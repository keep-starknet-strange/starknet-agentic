#!/usr/bin/env python3
"""Score a cairo-auditor run against vendored SCAbench ground truth.

Deliberately NOT an LLM judge. SCAbench's own scorer prompts a model to decide
whether a reported finding matches an expected one, which is more accurate than
anything textual but costs tokens per scoring run and is nondeterministic. That
is the wrong shape for a gate you want to run often and trust.

So this produces a deterministic, reproducible matching and is explicit about its
own limits: `auto_matched` is high-confidence overlap, `needs_review` is a
candidate a human should confirm, and `unmatched` found nothing. Recall is
reported as a range -- floor counts only auto-matched, ceiling adds review
candidates -- because pretending to a single number here would be false
precision.

Usage:
    python3 evals/scabench/score.py \
        --project code4rena_starknet-perpetual_2025_06 \
        --report /tmp/scabench-work/report.json
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

GROUND_TRUTH_DIR = Path(__file__).resolve().parent / "ground_truth"

_STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "can", "will", "are", "not",
    "all", "any", "due", "same", "used", "using", "into", "its", "when", "which",
    "vulnerability", "issue", "error", "should", "would", "could", "may", "might",
}

AUTO_MATCH_THRESHOLD = 0.45
# Above this many expected findings the exact subset DP is skipped for cardinality-only
# matching. Ground-truth sets in this corpus are far smaller (13 for the current target).
_DP_LIMIT = 20
REVIEW_THRESHOLD = 0.22


def _tokens(text: str) -> set[str]:
    """Tokenize, keeping snake_case identifiers whole AND split.

    `owner_account` must match prose that says "owner" and "account", and
    `price_tick` must match a title that names `price_tick` directly. Emitting
    both the whole identifier and its parts is what makes those line up.
    """
    out: set[str] = set()
    for word in re.findall(r"[a-zA-Z_][a-zA-Z0-9_]{2,}", (text or "").lower()):
        if word not in _STOPWORDS:
            out.add(word)
        if "_" in word:
            out.update(p for p in word.split("_") if len(p) > 2 and p not in _STOPWORDS)
    return out


def _weight(token: str) -> float:
    """Identifiers and long words carry the signal; short common words do not."""
    return 2.5 if ("_" in token or len(token) >= 9) else 1.0


def _overlap(expected: str, candidate: str) -> float:
    """Weighted coverage of the expected finding's terms by the candidate."""
    a, b = _tokens(expected), _tokens(candidate)
    if not a or not b:
        return 0.0
    shared = sum(_weight(t) for t in a & b)
    total = sum(_weight(t) for t in a)
    union = sum(_weight(t) for t in a | b)
    return (shared / total) * 0.75 + (shared / union) * 0.25


def _best_score(vuln: dict[str, Any], finding: dict[str, Any]) -> float:
    """Compare title-to-title first; audit prose in descriptions dilutes overlap.

    The expected descriptions are full contest write-ups. Concatenating them into
    one bag of words swamps the handful of tokens that actually identify the bug,
    which is how an earlier version of this scorer scored a known match at 0.12.
    """
    title = vuln.get("title", "")
    candidate_head = " ".join(str(finding.get(k, "")) for k in ("title", "class_id"))
    candidate_body = " ".join(str(finding.get(k, "")) for k in ("description", "root_cause", "attack_path"))
    head = _overlap(title, candidate_head)
    body = _overlap(title, candidate_body)
    return max(head, 0.6 * head + 0.4 * body)


def load_ground_truth(project_id: str) -> dict[str, Any]:
    path = GROUND_TRUTH_DIR / f"{project_id}.json"
    if not path.is_file():
        raise SystemExit(f"No vendored ground truth for {project_id!r}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_report(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    rows = list(payload.get("findings", []))
    # Leads are explicitly not claims of a proven bug, but they do count as
    # "the auditor pointed here", so they are scored separately by the caller.
    rows += [dict(row, _tier="lead") for row in payload.get("leads", [])]
    return rows


def _max_weight_matching(
    edges: dict[int, list[int]], order: list[int], weight: dict[tuple[int, int], float]
) -> dict[int, int]:
    """Maximum cardinality first, then maximum total weight among those matchings.

    Plain augmenting-path matching maximises cardinality but not total score, so it
    can report a worse candidate for an expected finding than an equally-sized
    assignment would. For E0->R0=0.90, E0->R1=0.80, E1->R0=0.85, E1->R1=0.84 it
    yields 1.65 where 1.74 is available at the same cardinality.

    Solved exactly by DP over subsets of expected findings, scanning reports one at
    a time: dp[mask] is the best (count, weight) using the reports seen so far, with
    `mask` recording which expected findings are matched. Exact rather than
    heuristic, and deterministic because ties resolve on the lowest expected index.

    The expected set is small by construction (one entry per ground-truth finding),
    but the subset space is guarded: above _DP_LIMIT this falls back to cardinality-
    only matching rather than hanging, and says so via the returned assignment being
    merely maximum-cardinality.
    """
    if len(order) > _DP_LIMIT:
        return _max_matching(edges, order)

    index = {e: i for i, e in enumerate(order)}
    reports = sorted({r for e in order for r in edges.get(e, [])})
    # dp[mask] -> (matched count, total weight); count dominates so cardinality wins first.
    dp: dict[int, tuple[int, float]] = {0: (0, 0.0)}
    back: dict[tuple[int, int], tuple[int, int | None]] = {}

    for step, r in enumerate(reports):
        nxt = dict(dp)
        nxt_back: dict[int, tuple[int, int | None]] = {}
        for mask, (count, total) in dp.items():
            # Option: leave this report unassigned (already carried by dict(dp)).
            for e in order:
                bit = 1 << index[e]
                if mask & bit or r not in edges.get(e, []):
                    continue
                cand_mask = mask | bit
                cand = (count + 1, total + weight[(e, r)])
                best = nxt.get(cand_mask)
                if best is None or cand > best:
                    nxt[cand_mask] = cand
                    nxt_back[cand_mask] = (mask, e)
        for mask, parent in nxt_back.items():
            back[(step, mask)] = parent
        dp = nxt

    if not dp:
        return {}
    best_mask = max(dp, key=lambda m: (dp[m][0], dp[m][1], -m))

    # Walk the chosen reports back out of the DP table.
    assignment: dict[int, int] = {}
    mask = best_mask
    for step in range(len(reports) - 1, -1, -1):
        parent = back.get((step, mask))
        if parent is None:
            continue
        prev_mask, chosen = parent
        if chosen is not None and prev_mask != mask:
            assignment[chosen] = reports[step]
            mask = prev_mask
    return assignment


def _max_matching(edges: dict[int, list[int]], order: list[int]) -> dict[int, int]:
    """Maximum-cardinality bipartite matching by augmenting paths (Kuhn's).

    A greedy pass is order-dependent, which `evals/**` forbids: an expected finding
    can claim a report on a weak edge and block a later expected finding whose only
    edge is that same report, losing a match that a maximum matching would keep.
    Iterating `order` and pre-sorted `edges` deterministically makes the result a
    function of the score matrix alone, not of input ordering.
    """
    report_to_expected: dict[int, int] = {}

    def augment(node: int, seen: set[int]) -> bool:
        for report in edges.get(node, []):
            if report in seen:
                continue
            seen.add(report)
            holder = report_to_expected.get(report)
            if holder is None or augment(holder, seen):
                report_to_expected[report] = node
                return True
        return False

    for node in order:
        augment(node, set())
    return {expected: report for report, expected in report_to_expected.items()}


def score(project: dict[str, Any], findings: list[dict[str, Any]]) -> dict[str, Any]:
    expected = project.get("vulnerabilities", [])
    results = []

    matrix = [[_best_score(vuln, finding) for finding in findings] for vuln in expected]
    is_lead = [str(finding.get("_tier", "")) == "lead" for finding in findings]
    # Stable identity for tie-breaking, so equal scores never resolve by list order.
    identity = [str(finding.get("title", "")) for finding in findings]
    order = sorted(range(len(expected)), key=lambda e: str(expected[e].get("finding_id", "")))

    def edges_for(indices: list[int], floor: float, allow_leads: bool) -> dict[int, list[int]]:
        return {
            e: sorted(
                (
                    r
                    for r in indices
                    if matrix[e][r] >= floor and (allow_leads or not is_lead[r])
                ),
                key=lambda r: (-matrix[e][r], identity[r], r),
            )
            for e in range(len(expected))
        }

    # Proven matches first. A lead is never a proven finding, so it is excluded here
    # and can only ever reach needs_review, whatever its text similarity.
    all_reports = list(range(len(findings)))
    weights = {(e, r): matrix[e][r] for e in range(len(expected)) for r in all_reports}
    auto = _max_weight_matching(
        edges_for(all_reports, AUTO_MATCH_THRESHOLD, allow_leads=False), order, weights
    )

    # Review candidates draw only from reports no proven match claimed.
    remaining = [r for r in all_reports if r not in set(auto.values())]
    review_order = [e for e in order if e not in auto]
    review_edges = edges_for(remaining, REVIEW_THRESHOLD, allow_leads=True)
    review_edges = {e: rs for e, rs in review_edges.items() if e in set(review_order)}
    review = _max_weight_matching(review_edges, review_order, weights)

    claimed: set[int] = set(auto.values()) | set(review.values())

    for e, vuln in enumerate(expected):
        if e in auto:
            verdict, best_idx = "auto_matched", auto[e]
        elif e in review:
            verdict, best_idx = "needs_review", review[e]
        else:
            verdict, best_idx = "unmatched", -1
        best_score = matrix[e][best_idx] if best_idx >= 0 else (max(matrix[e]) if findings else 0.0)

        # Lexical ranking is not reliable enough to trust the top hit alone: on this
        # dataset a true match has been observed ranking second behind a false one
        # that shared generic words. Surface the top three so a reviewer confirms in
        # seconds rather than trusting a threshold. These are ranked over ALL reported
        # findings, including ones already claimed, so a reviewer can spot a
        # misassignment the greedy pass made.
        ranked = sorted(
            ((matrix[e][r], identity[r], r) for r in range(len(findings))),
            key=lambda triple: (-triple[0], triple[1], triple[2]),
        )[:3]

        results.append(
            {
                "finding_id": vuln.get("finding_id"),
                "severity": vuln.get("severity"),
                "title": vuln.get("title"),
                "verdict": verdict,
                "score": round(best_score, 3),
                "candidate": (findings[best_idx].get("title") if best_idx >= 0 and verdict != "unmatched" else None),
                "top_candidates": [{"score": round(sc, 3), "title": t} for sc, t, _ in ranked],
            }
        )

    auto_count = sum(1 for r in results if r["verdict"] == "auto_matched")
    review_count = sum(1 for r in results if r["verdict"] == "needs_review")
    total = len(expected) or 1
    extra = [f for i, f in enumerate(findings) if i not in claimed]

    return {
        "project_id": project.get("project_id"),
        "expected_findings": len(expected),
        "reported_findings": len(findings),
        "auto_matched": auto_count,
        "needs_review": review_count,
        "unmatched": len(expected) - auto_count - review_count,
        "recall_floor": round(auto_count / total, 3),
        "recall_ceiling": round((auto_count + review_count) / total, 3),
        "reported_unassigned": len(extra),
        "per_finding": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Score a cairo-auditor run against SCAbench ground truth.")
    parser.add_argument("--project", required=True)
    parser.add_argument("--report", required=True, help="cairo-auditor report JSON, or a list of findings.")
    parser.add_argument("--out", default="", help="Optional path to write the scorecard JSON.")
    args = parser.parse_args()

    project = load_ground_truth(args.project)
    findings = load_report(Path(args.report).resolve())
    card = score(project, findings)

    print(f"project        : {card['project_id']}")
    print(f"expected       : {card['expected_findings']} findings")
    print(f"reported       : {card['reported_findings']} findings")
    print(f"auto-matched   : {card['auto_matched']}")
    print(f"needs review   : {card['needs_review']}")
    print(f"unmatched      : {card['unmatched']}")
    print(f"recall (lexical): {card['recall_floor']:.0%} floor .. {card['recall_ceiling']:.0%} ceiling")
    print(f"reported but assigned to no expected finding: {card['reported_unassigned']}")
    print()
    print("NOTE: lexical matching is a triage aid, not a judge. Confirm the candidates")
    print("below before quoting a recall number. A true match has been observed ranking")
    print("second behind a false one on shared generic words.")
    print()
    for row in card["per_finding"]:
        mark = {"auto_matched": "HIT ", "needs_review": "?   ", "unmatched": "MISS"}[row["verdict"]]
        print(f"  {mark} [{row['severity']:<6}] {row['finding_id']}  ({row['score']:.2f})  {row['title'][:56]}")
        for cand in row["top_candidates"]:
            if cand["score"] >= 0.10:
                print(f"          {cand['score']:.2f}  {cand['title'][:70]}")

    if args.out:
        out = Path(args.out).resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(card, indent=2) + "\n", encoding="utf-8")
        print(f"\nscorecard      : {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
