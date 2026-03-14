#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

try:
    from contract_benchmark_policy import MIN_CONSECUTIVE_REPORTABLE_RELEASES
except ModuleNotFoundError:
    from scripts.quality.contract_benchmark_policy import MIN_CONSECUTIVE_REPORTABLE_RELEASES

LATEST_RELEASE_RE = re.compile(r"- Latest release:\s+`([^`]+)`")
STREAK_RE = re.compile(r"- Consecutive reportable releases \(latest-first\):\s+`(\d+)`")
RELEASE_RE = re.compile(r"^v[0-9]+\.[0-9]+\.[0-9]+$")
APPROVED_AT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


@dataclass
class SecuritySignoff:
    release: str
    reviewer: str
    approved: bool
    approved_at: str | None
    notes: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check KPI publication gate for contract benchmark releases."
    )
    parser.add_argument(
        "--trend",
        default="evals/scorecards/contract-skill-benchmark-trend.md",
        help="Contract benchmark trend markdown path",
    )
    parser.add_argument(
        "--signoffs",
        default="evals/scorecards/security-review-signoffs.contract-skill-benchmark.jsonl",
        help="Security signoff JSONL path",
    )
    parser.add_argument(
        "--output",
        default="evals/scorecards/contract-kpi-publication-gate.md",
        help="Gate report markdown output path",
    )
    parser.add_argument(
        "--min-consecutive",
        type=int,
        default=MIN_CONSECUTIVE_REPORTABLE_RELEASES,
        help="Minimum consecutive reportable releases required for publication",
    )
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="Fail when KPI publication gate is not satisfied",
    )
    return parser.parse_args()


def parse_trend(path: Path) -> tuple[str, int]:
    text = path.read_text(encoding="utf-8")
    latest_match = LATEST_RELEASE_RE.search(text)
    streak_match = STREAK_RE.search(text)
    if latest_match is None or streak_match is None:
        raise RuntimeError(
            f"trend format missing required fields: {path}"
        )
    latest_release = latest_match.group(1)
    if RELEASE_RE.match(latest_release) is None:
        raise RuntimeError(
            f"trend file contains unexpected release format: {latest_release!r}"
        )
    streak = int(streak_match.group(1))
    return latest_release, streak


def load_signoffs(path: Path) -> list[SecuritySignoff]:
    signoffs: list[SecuritySignoff] = []
    if not path.exists():
        return signoffs
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            raw = json.loads(line)
        except json.JSONDecodeError as exc:
            snippet = line.strip()
            raise RuntimeError(
                f"{path}:{line_no}: invalid JSON ({exc.msg}); line={snippet!r}"
            ) from exc
        if not isinstance(raw, dict):
            raise RuntimeError(f"{path}:{line_no}: signoff entry must be object")
        for key in ("release", "reviewer", "approved"):
            if key not in raw:
                raise RuntimeError(f"{path}:{line_no}: missing key '{key}'")
        if not isinstance(raw["release"], str) or RELEASE_RE.match(raw["release"]) is None:
            raise RuntimeError(f"{path}:{line_no}: invalid release")
        if not isinstance(raw["reviewer"], str) or len(raw["reviewer"].strip()) < 3:
            raise RuntimeError(f"{path}:{line_no}: invalid reviewer")
        if not isinstance(raw["approved"], bool):
            raise RuntimeError(f"{path}:{line_no}: approved must be bool")
        approved_at = raw.get("approved_at")
        if raw["approved"]:
            if not isinstance(approved_at, str) or APPROVED_AT_RE.match(approved_at) is None:
                raise RuntimeError(f"{path}:{line_no}: invalid approved_at")
        elif approved_at is not None:
            raise RuntimeError(f"{path}:{line_no}: approved_at must be omitted when approved=false")
        notes = raw.get("notes", "")
        if not isinstance(notes, str):
            raise RuntimeError(f"{path}:{line_no}: notes must be string when present")
        signoffs.append(
            SecuritySignoff(
                release=raw["release"],
                reviewer=raw["reviewer"],
                approved=raw["approved"],
                approved_at=approved_at,
                notes=notes,
            )
        )
    return signoffs


def latest_approved_signoff(signoffs: list[SecuritySignoff], release: str) -> SecuritySignoff | None:
    approved = [entry for entry in signoffs if entry.release == release and entry.approved]
    if not approved:
        return None
    # ISO timestamps sort lexicographically.
    return sorted(approved, key=lambda item: item.approved_at or "")[-1]


def render_report(
    *,
    latest_release: str,
    streak: int,
    min_consecutive: int,
    signoff: SecuritySignoff | None,
    ready: bool,
) -> str:
    generated = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    signoff_status = "present" if signoff is not None else "missing"
    reviewer = signoff.reviewer if signoff is not None else "n/a"
    approved_at = signoff.approved_at if signoff is not None and signoff.approved_at else "n/a"
    notes = signoff.notes if signoff is not None and signoff.notes else "n/a"
    return "\n".join(
        [
            "# Contract KPI Publication Gate",
            "",
            f"Generated: {generated}",
            "",
            "## Inputs",
            "",
            f"- Latest release: `{latest_release}`",
            f"- Consecutive reportable releases: `{streak}`",
            f"- Required consecutive releases: `{min_consecutive}`",
            f"- Security reviewer signoff: `{signoff_status}`",
            f"- Reviewer: `{reviewer}`",
            f"- Approved at: `{approved_at}`",
            f"- Notes: {notes}",
            "",
            "## Decision",
            "",
            f"- KPI publication status: `{ 'ready' if ready else 'hold' }`",
            "",
            "## Policy",
            "",
            "- Publish KPI only when both conditions are met:",
            "  1. at least the configured number of consecutive reportable releases",
            "  2. explicit approved security reviewer signoff for the latest release",
            "",
        ]
    ) + "\n"


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    trend_path = (repo_root / args.trend).resolve()
    signoffs_path = (repo_root / args.signoffs).resolve()
    output_path = (repo_root / args.output).resolve()

    latest_release, streak = parse_trend(trend_path)
    signoffs = load_signoffs(signoffs_path)
    signoff = latest_approved_signoff(signoffs, latest_release)

    ready = streak >= args.min_consecutive and signoff is not None
    report = render_report(
        latest_release=latest_release,
        streak=streak,
        min_consecutive=args.min_consecutive,
        signoff=signoff,
        ready=ready,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(report, encoding="utf-8")

    if args.enforce and not ready:
        print(
            "FAIL: KPI publication gate not met "
            f"(release={latest_release}, streak={streak}, signoff={'yes' if signoff else 'no'})"
        )
        return 1

    print(
        "OK: KPI publication gate evaluated "
        f"(release={latest_release}, status={'ready' if ready else 'hold'})"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"FAIL: {exc}")
        sys.exit(2)
