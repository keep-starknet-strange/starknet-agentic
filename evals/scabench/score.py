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


def score(project: dict[str, Any], findings: list[dict[str, Any]]) -> dict[str, Any]:
    expected = project.get("vulnerabilities", [])
    results = []
    claimed: set[int] = set()

    for vuln in expected:
        best_idx, best_score = -1, 0.0
        for idx, finding in enumerate(findings):
            value = _best_score(vuln, finding)
            if value > best_score:
                best_idx, best_score = idx, value

        if best_score >= AUTO_MATCH_THRESHOLD:
            verdict = "auto_matched"
            claimed.add(best_idx)
        elif best_score >= REVIEW_THRESHOLD:
            verdict = "needs_review"
        else:
            verdict = "unmatched"

        # Lexical ranking is not reliable enough to trust the top hit alone: on this
        # dataset a true match has been observed ranking second behind a false one
        # that shared generic words. Surface the top three so a reviewer confirms in
        # seconds rather than trusting a threshold.
        ranked = sorted(
            ((_best_score(vuln, f), f.get("title", "")) for f in findings),
            key=lambda pair: pair[0],
            reverse=True,
        )[:3]

        results.append(
            {
                "finding_id": vuln.get("finding_id"),
                "severity": vuln.get("severity"),
                "title": vuln.get("title"),
                "verdict": verdict,
                "score": round(best_score, 3),
                "candidate": (findings[best_idx].get("title") if best_idx >= 0 and verdict != "unmatched" else None),
                "top_candidates": [{"score": round(s, 3), "title": t} for s, t in ranked],
            }
        )

    auto = sum(1 for r in results if r["verdict"] == "auto_matched")
    review = sum(1 for r in results if r["verdict"] == "needs_review")
    total = len(expected) or 1
    extra = [f for i, f in enumerate(findings) if i not in claimed]

    return {
        "project_id": project.get("project_id"),
        "expected_findings": len(expected),
        "reported_findings": len(findings),
        "auto_matched": auto,
        "needs_review": review,
        "unmatched": len(expected) - auto - review,
        "recall_floor": round(auto / total, 3),
        "recall_ceiling": round((auto + review) / total, 3),
        "unmatched_reported": len(extra),
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
    print(f"reported but unmatched to ground truth: {card['unmatched_reported']}")
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
