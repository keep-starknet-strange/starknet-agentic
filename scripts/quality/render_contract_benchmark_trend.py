#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from contract_benchmark_policy import (
    MIN_CONSECUTIVE_REPORTABLE_RELEASES,
    MIN_REPORTABLE_CASES,
)

VERSION_RE = re.compile(r"^v(\d+)\.(\d+)\.(\d+)-contract-skill-benchmark\.md$")


@dataclass
class ScorecardEntry:
    path: Path
    version: str
    version_tuple: tuple[int, int, int]
    cases: int | None
    precision: float | None
    recall: float | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render trend report for contract benchmark scorecards.")
    parser.add_argument(
        "--scorecards-glob",
        default="evals/scorecards/v*-contract-skill-benchmark.md",
        help="Glob pattern for versioned contract benchmark scorecards",
    )
    parser.add_argument(
        "--output",
        default="evals/scorecards/contract-skill-benchmark-trend.md",
        help="Output markdown path",
    )
    parser.add_argument(
        "--min-cases",
        type=int,
        default=MIN_REPORTABLE_CASES,
        help="Minimum cases for reportable runs",
    )
    parser.add_argument(
        "--min-consecutive",
        type=int,
        default=MIN_CONSECUTIVE_REPORTABLE_RELEASES,
        help="Consecutive reportable releases required for KPI publication",
    )
    parser.add_argument(
        "--enforce-min-consecutive",
        action="store_true",
        help="Fail if latest consecutive reportable runs are below --min-consecutive",
    )
    return parser.parse_args()


def parse_scorecard(path: Path) -> ScorecardEntry:
    text = path.read_text(encoding="utf-8")
    filename = path.name

    match = VERSION_RE.match(filename)
    if not match:
        raise ValueError(f"unexpected scorecard name format: {filename}")

    version_tuple = tuple(int(match.group(i)) for i in (1, 2, 3))
    version = f"v{version_tuple[0]}.{version_tuple[1]}.{version_tuple[2]}"

    cases_match = re.search(r"- Cases:\s+(\d+)", text)
    precision_match = re.search(r"- Precision:\s+([0-9.]+)", text)
    recall_match = re.search(r"- Recall:\s+([0-9.]+)", text)

    cases = int(cases_match.group(1)) if cases_match else None
    precision = float(precision_match.group(1)) if precision_match else None
    recall = float(recall_match.group(1)) if recall_match else None

    return ScorecardEntry(
        path=path,
        version=version,
        version_tuple=version_tuple,
        cases=cases,
        precision=precision,
        recall=recall,
    )


def consecutive_reportable(entries_desc: list[ScorecardEntry], min_cases: int) -> int:
    streak = 0
    for entry in entries_desc:
        if entry.cases is None or entry.cases < min_cases:
            break
        streak += 1
    return streak


def fmt_float(value: float | None) -> str:
    if value is None:
        return "n/a"
    return f"{value:.3f}"


def display_path(path: Path, repo_root: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return path.as_posix()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]

    scorecard_glob = args.scorecards_glob
    if scorecard_glob.startswith("/"):
        scorecard_paths = sorted(Path("/").glob(scorecard_glob.lstrip("/")))
    else:
        scorecard_paths = sorted(repo_root.glob(scorecard_glob))

    scorecard_paths = [path for path in scorecard_paths if VERSION_RE.match(path.name)]
    entries = [parse_scorecard(path) for path in scorecard_paths]
    entries_sorted = sorted(entries, key=lambda entry: entry.version_tuple)

    if not entries_sorted:
        raise RuntimeError("no contract benchmark scorecards found")

    entries_desc = sorted(entries_sorted, key=lambda entry: entry.version_tuple, reverse=True)
    streak = consecutive_reportable(entries_desc, args.min_cases)

    latest = entries_desc[0]
    kpi_publishable = streak >= args.min_consecutive

    generated = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    lines = [
        "# Contract Skill Benchmark Trend",
        "",
        f"Generated: {generated}",
        f"Scorecard glob: `{args.scorecards_glob}`",
        "",
        "## Policy",
        "",
        f"- Minimum cases for a reportable run: `{args.min_cases}`",
        f"- Minimum consecutive reportable releases for KPI publication: `{args.min_consecutive}`",
        f"- Latest release: `{latest.version}`",
        f"- Consecutive reportable releases (latest-first): `{streak}`",
        f"- KPI publication status: `{ 'ready' if kpi_publishable else 'hold' }`",
        "",
        "## Releases",
        "",
        "| Release | Cases | Precision | Recall | Reportable | Scorecard |",
        "| --- | ---: | ---: | ---: | --- | --- |",
    ]

    for entry in entries_desc:
        reportable = entry.cases is not None and entry.cases >= args.min_cases
        rel = display_path(entry.path, repo_root)
        lines.append(
            "| "
            f"`{entry.version}` | `{entry.cases if entry.cases is not None else 'n/a'}` | "
            f"`{fmt_float(entry.precision)}` | `{fmt_float(entry.recall)}` | "
            f"`{'yes' if reportable else 'no'}` | `{rel}` |"
        )

    output_path = (repo_root / args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    if args.enforce_min_consecutive and not kpi_publishable:
        print(
            "FAIL: KPI publication policy not met "
            f"(streak={streak}, required={args.min_consecutive}, latest={latest.version})"
        )
        return 1

    print(
        "OK: trend generated "
        f"(latest={latest.version}, streak={streak}, publishable={'yes' if kpi_publishable else 'no'})"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"FAIL: {exc}")
        sys.exit(2)
