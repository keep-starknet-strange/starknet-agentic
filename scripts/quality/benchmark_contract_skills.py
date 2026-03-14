#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from contract_benchmark_policy import (
    ALLOWED_SECURITY_CLASSES,
    BENCHMARK_GATE_FAILURE_EXIT_CODE,
    BENCHMARK_RUNTIME_ERROR_EXIT_CODE,
    MIN_REPORTABLE_CASES,
)


@dataclass
class PatternRule:
    path: str
    pattern: str
    description: str


@dataclass
class Case:
    case_id: str
    skill_id: str
    security_class: str
    fixture: str
    expected_pass: bool
    run_build: bool
    run_tests: bool
    test_filter: str | None
    must_match: list[PatternRule]
    must_not_match: list[PatternRule]


@dataclass
class CaseResult:
    case_id: str
    skill_id: str
    security_class: str
    expected_pass: bool
    predicted_pass: bool
    outcome: str
    build_ok: bool
    tests_ok: bool
    static_ok: bool
    skipped: bool
    notes: list[str]


@dataclass
class FixtureExecutionResult:
    build_ok: bool
    tests_ok: bool
    skipped: bool
    notes: list[str]


def load_cases(path: Path) -> list[Case]:
    cases: list[Case] = []
    seen_case_ids: set[str] = set()

    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        if not isinstance(raw, dict):
            raise ValueError(f"line {line_no}: case must be object")

        required = {
            "case_id",
            "skill_id",
            "fixture",
            "expected_pass",
            "run_build",
            "run_tests",
            "must_match",
            "must_not_match",
        }
        missing = required - set(raw.keys())
        if missing:
            raise ValueError(f"line {line_no}: missing keys: {sorted(missing)}")

        if raw["case_id"] in seen_case_ids:
            raise ValueError(f"line {line_no}: duplicate case_id: {raw['case_id']}")
        seen_case_ids.add(raw["case_id"])

        for key in ("case_id", "skill_id", "fixture"):
            if not isinstance(raw[key], str):
                raise ValueError(f"line {line_no}: {key} must be string")

        for key in ("expected_pass", "run_build", "run_tests"):
            if not isinstance(raw[key], bool):
                raise ValueError(f"line {line_no}: {key} must be bool")

        test_filter = raw.get("test_filter")
        if test_filter is not None and not isinstance(test_filter, str):
            raise ValueError(f"line {line_no}: test_filter must be string when present")

        security_class = raw.get("security_class")
        if not isinstance(security_class, str):
            raise ValueError(f"line {line_no}: security_class must be string")
        security_class = security_class.strip()
        if security_class not in ALLOWED_SECURITY_CLASSES:
            allowed = ", ".join(sorted(ALLOWED_SECURITY_CLASSES))
            raise ValueError(
                f"line {line_no}: security_class must be one of {{{allowed}}}"
            )

        must_match = parse_rules(raw["must_match"], line_no, "must_match")
        must_not_match = parse_rules(raw["must_not_match"], line_no, "must_not_match")

        cases.append(
            Case(
                case_id=raw["case_id"],
                skill_id=raw["skill_id"],
                security_class=security_class.strip(),
                fixture=raw["fixture"],
                expected_pass=raw["expected_pass"],
                run_build=raw["run_build"],
                run_tests=raw["run_tests"],
                test_filter=test_filter,
                must_match=must_match,
                must_not_match=must_not_match,
            )
        )

    return cases


def parse_rules(raw_rules: object, line_no: int, field: str) -> list[PatternRule]:
    if not isinstance(raw_rules, list):
        raise ValueError(f"line {line_no}: {field} must be array")

    rules: list[PatternRule] = []
    for idx, raw_rule in enumerate(raw_rules, start=1):
        if not isinstance(raw_rule, dict):
            raise ValueError(f"line {line_no}: {field}[{idx}] must be object")
        for key in ("path", "pattern", "description"):
            if key not in raw_rule or not isinstance(raw_rule[key], str):
                raise ValueError(f"line {line_no}: {field}[{idx}].{key} must be string")
        try:
            re.compile(raw_rule["pattern"])
        except re.error as exc:
            raise ValueError(
                f"line {line_no}: {field}[{idx}].pattern invalid regex: {exc}"
            ) from exc
        rules.append(
            PatternRule(
                path=raw_rule["path"],
                pattern=raw_rule["pattern"],
                description=raw_rule["description"],
            )
        )
    return rules


def run_command(cmd: list[str], cwd: Path, timeout_seconds: int) -> tuple[bool, str]:
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    return proc.returncode == 0, output.strip()


def resolve_under_root(root: Path, relative_path: str) -> Path | None:
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


def display_path(path: Path, root: Path) -> Path:
    try:
        return path.relative_to(root)
    except ValueError:
        return path


def execute_fixture(
    case: Case,
    *,
    fixture: Path,
    have_scarb: bool,
    have_snforge: bool,
    require_tools: bool,
    timeout_seconds: int,
    cache: dict[tuple[str, bool, bool, str], FixtureExecutionResult],
) -> FixtureExecutionResult:
    cache_key = (case.fixture, case.run_build, case.run_tests, case.test_filter or "")
    cached = cache.get(cache_key)
    if cached is not None:
        return FixtureExecutionResult(
            build_ok=cached.build_ok,
            tests_ok=cached.tests_ok,
            skipped=cached.skipped,
            notes=list(cached.notes),
        )

    notes: list[str] = []
    skipped = False
    build_ok = True
    tests_ok = True

    if case.run_build and not have_scarb:
        notes.append("missing_tool:scarb")
        skipped = True

    if case.run_tests and not have_snforge:
        notes.append("missing_tool:snforge")
        skipped = True

    if skipped and require_tools:
        missing = ", ".join(
            note.split(":", 1)[1] for note in notes if note.startswith("missing_tool:")
        )
        raise RuntimeError(f"required tools missing for fixture {case.fixture}: {missing}")

    if case.run_build and not skipped:
        build_ok, build_log = run_command(["scarb", "build"], fixture, timeout_seconds)
        if not build_ok:
            notes.append(summarize_log("scarb_build_failed", build_log))

    if case.run_tests and not skipped:
        if build_ok:
            cmd = ["snforge", "test"]
            if case.test_filter:
                cmd.extend(["--exact", case.test_filter])
            tests_ok, test_log = run_command(cmd, fixture, timeout_seconds)
            if not tests_ok:
                notes.append(summarize_log("snforge_test_failed", test_log))
        else:
            tests_ok = False
            notes.append("snforge_skipped:build_failed")

    result = FixtureExecutionResult(
        build_ok=build_ok,
        tests_ok=tests_ok,
        skipped=skipped,
        notes=notes,
    )
    cache[cache_key] = result
    return FixtureExecutionResult(
        build_ok=result.build_ok,
        tests_ok=result.tests_ok,
        skipped=result.skipped,
        notes=list(result.notes),
    )


def evaluate_case(
    case: Case,
    *,
    repo_root: Path,
    have_scarb: bool,
    have_snforge: bool,
    require_tools: bool,
    timeout_seconds: int,
    fixture_cache: dict[tuple[str, bool, bool, str], FixtureExecutionResult],
) -> CaseResult:
    fixture = resolve_under_root(repo_root, case.fixture)
    notes: list[str] = []
    static_ok = True

    if fixture is None:
        notes.append(f"fixture_path_escape:{case.fixture}")
        return CaseResult(
            case_id=case.case_id,
            skill_id=case.skill_id,
            security_class=case.security_class,
            expected_pass=case.expected_pass,
            predicted_pass=False,
            outcome=map_outcome(expected_pass=case.expected_pass, predicted_pass=False),
            build_ok=False,
            tests_ok=False,
            static_ok=False,
            skipped=False,
            notes=notes,
        )

    if not fixture.is_dir():
        notes.append(f"fixture_missing:{fixture}")
        return CaseResult(
            case_id=case.case_id,
            skill_id=case.skill_id,
            security_class=case.security_class,
            expected_pass=case.expected_pass,
            predicted_pass=False,
            outcome=map_outcome(expected_pass=case.expected_pass, predicted_pass=False),
            build_ok=False,
            tests_ok=False,
            static_ok=False,
            skipped=False,
            notes=notes,
        )

    fixture_exec = execute_fixture(
        case,
        fixture=fixture,
        have_scarb=have_scarb,
        have_snforge=have_snforge,
        require_tools=require_tools,
        timeout_seconds=timeout_seconds,
        cache=fixture_cache,
    )
    notes.extend(fixture_exec.notes)

    static_errors = run_static_rules(case=case, fixture=fixture)
    if static_errors:
        static_ok = False
        notes.extend(static_errors)

    predicted_pass = (
        (not fixture_exec.skipped)
        and fixture_exec.build_ok
        and fixture_exec.tests_ok
        and static_ok
    )
    outcome = (
        "skip"
        if fixture_exec.skipped
        else map_outcome(expected_pass=case.expected_pass, predicted_pass=predicted_pass)
    )

    return CaseResult(
        case_id=case.case_id,
        skill_id=case.skill_id,
        security_class=case.security_class,
        expected_pass=case.expected_pass,
        predicted_pass=predicted_pass,
        outcome=outcome,
        build_ok=fixture_exec.build_ok,
        tests_ok=fixture_exec.tests_ok,
        static_ok=static_ok,
        skipped=fixture_exec.skipped,
        notes=notes,
    )


def run_static_rules(*, case: Case, fixture: Path) -> list[str]:
    errors: list[str] = []

    for rule in case.must_match:
        target = resolve_under_root(fixture, rule.path)
        if target is None:
            errors.append(f"must_match_path_escape:{rule.path}:{rule.description}")
            continue
        if not target.is_file():
            errors.append(f"must_match_file_missing:{rule.path}:{rule.description}")
            continue
        text = target.read_text(encoding="utf-8")
        if re.search(rule.pattern, text, flags=re.MULTILINE) is None:
            errors.append(f"must_match_failed:{rule.path}:{rule.description}")

    for rule in case.must_not_match:
        target = resolve_under_root(fixture, rule.path)
        if target is None:
            errors.append(f"must_not_match_path_escape:{rule.path}:{rule.description}")
            continue
        if not target.is_file():
            errors.append(f"must_not_match_file_missing:{rule.path}:{rule.description}")
            continue
        text = target.read_text(encoding="utf-8")
        if re.search(rule.pattern, text, flags=re.MULTILINE) is not None:
            errors.append(f"must_not_match_failed:{rule.path}:{rule.description}")

    return errors


def summarize_log(prefix: str, log: str, limit: int = 280) -> str:
    cleaned = " ".join(log.split())
    if len(cleaned) > limit:
        cleaned = cleaned[:limit] + "..."
    return f"{prefix}:{cleaned}"


def map_outcome(*, expected_pass: bool, predicted_pass: bool) -> str:
    if predicted_pass and expected_pass:
        return "tp"
    if predicted_pass and not expected_pass:
        return "fp"
    if (not predicted_pass) and expected_pass:
        return "fn"
    return "tn"


def compute_metrics(results: list[CaseResult]) -> tuple[dict[str, int], int, int, float, float]:
    totals = {"tp": 0, "tn": 0, "fp": 0, "fn": 0}
    skipped = 0
    evaluated = 0

    for result in results:
        if result.outcome == "skip":
            skipped += 1
            continue
        evaluated += 1
        totals[result.outcome] += 1

    tp = totals["tp"]
    fp = totals["fp"]
    fn = totals["fn"]

    precision = 1.0 if (tp + fp) == 0 else tp / (tp + fp)
    recall = 1.0 if (tp + fn) == 0 else tp / (tp + fn)

    return totals, evaluated, skipped, precision, recall


def compute_security_class_metrics(results: list[CaseResult]) -> dict[str, dict[str, int]]:
    class_totals: dict[str, dict[str, int]] = {}
    for result in results:
        bucket = class_totals.setdefault(
            result.security_class,
            {"tp": 0, "tn": 0, "fp": 0, "fn": 0, "cases": 0},
        )
        bucket["cases"] += 1
        if result.outcome == "skip":
            continue
        bucket[result.outcome] += 1
    return class_totals


def render_markdown(
    *,
    title: str,
    version: str,
    generated_at: str,
    cases_path: Path,
    results: list[CaseResult],
    totals: dict[str, int],
    evaluated: int,
    skipped: int,
    precision: float,
    recall: float,
    have_scarb: bool,
    have_snforge: bool,
    min_reportable_cases: int,
    class_totals: dict[str, dict[str, int]],
) -> str:
    accuracy = 1.0 if evaluated == 0 else (totals["tp"] + totals["tn"]) / evaluated
    smoke_only = evaluated < min_reportable_cases

    lines = [
        f"# {title}",
        "",
        f"Generated: {generated_at}",
        f"Case pack: `{cases_path.as_posix()}`",
        "",
        "## Overall",
        "",
        f"- Version: {version}",
        f"- Cases: {evaluated}",
        f"- Precision: {precision:.3f}",
        f"- Recall: {recall:.3f}",
        f"- Accuracy: {accuracy:.3f}",
        f"- Interpretation: {'smoke-only (low sample)' if smoke_only else 'reportable benchmark sample'}",
        "",
        "## Outcome Summary",
        "",
        f"- TP: `{totals['tp']}`",
        f"- TN: `{totals['tn']}`",
        f"- FP: `{totals['fp']}`",
        f"- FN: `{totals['fn']}`",
        f"- Skipped: `{skipped}`",
    ]

    lines.extend(
        [
            "",
            "## Class Coverage",
            "",
            "| Security Class | Cases | TP | TN | FP | FN |",
            "| --- | ---: | ---: | ---: | ---: | ---: |",
        ]
    )

    for security_class in sorted(class_totals):
        counts = class_totals[security_class]
        lines.append(
            "| "
            f"`{security_class}` | `{counts['cases']}` | `{counts['tp']}` | `{counts['tn']}` | "
            f"`{counts['fp']}` | `{counts['fn']}` |"
        )

    lines.extend(
        [
            "",
            "## Case Results",
            "",
            "| Case | Class | Skill | Expected | Predicted | Outcome | Build | Tests | Static | Notes |",
            "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )

    for result in results:
        notes = "<br>".join(result.notes) if result.notes else ""
        lines.append(
            "| "
            f"`{result.case_id}` | `{result.security_class}` | `{result.skill_id}` | "
            f"`{result.expected_pass}` | `{result.predicted_pass}` | `{result.outcome}` | "
            f"`{result.build_ok}` | `{result.tests_ok}` | `{result.static_ok}` | {notes} |"
        )

    lines.extend(
        [
            "",
            "## Notes",
            "",
            f"- Tools: scarb={'yes' if have_scarb else 'no'}, snforge={'yes' if have_snforge else 'no'}.",
            "- Positive cases must compile/test and satisfy all static policy assertions.",
            "- Negative cases validate that policy checks fail on intentionally insecure patterns.",
            "- Cases are organized by security class to make regressions attributable.",
            f"- Sample policy: fewer than {min_reportable_cases} evaluated cases is smoke-only and should not be reported as broad skill quality.",
        ]
    )

    return "\n".join(lines) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run deterministic contract benchmark for cairo-contract-authoring/cairo-optimization patterns."
    )
    parser.add_argument(
        "--cases",
        default="evals/cases/contract_skill_benchmark.jsonl",
        help="JSONL case pack path",
    )
    parser.add_argument("--output", required=True, help="Output markdown scorecard path")
    parser.add_argument("--version", default="v0.5.0", help="Version label for scorecard")
    parser.add_argument(
        "--title",
        default="v0.5.0 Contract Skill Benchmark",
        help="Scorecard title",
    )
    parser.add_argument("--min-precision", type=float, default=1.0, help="Minimum precision threshold")
    parser.add_argument("--min-recall", type=float, default=1.0, help="Minimum recall threshold")
    parser.add_argument(
        "--timeout-seconds",
        type=int,
        default=600,
        help="Timeout per build/test command",
    )
    parser.add_argument(
        "--require-tools",
        action="store_true",
        help="Fail if required Cairo tools are unavailable",
    )
    parser.add_argument(
        "--min-evaluated",
        type=int,
        default=MIN_REPORTABLE_CASES,
        help="Minimum evaluated cases for reportable benchmark interpretation",
    )
    parser.add_argument(
        "--enforce-min-evaluated",
        action="store_true",
        help="Fail if evaluated cases are below --min-evaluated",
    )
    parser.add_argument(
        "--allow-empty-evaluated",
        action="store_true",
        help="Allow zero evaluated cases (all skipped) to pass with a warning",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Copy output markdown to evals/scorecards/<basename(output)>.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[2]

    cases_path = (repo_root / args.cases).resolve()
    output_path = (repo_root / args.output).resolve()

    cases = load_cases(cases_path)

    have_scarb = shutil.which("scarb") is not None
    have_snforge = shutil.which("snforge") is not None

    results: list[CaseResult] = []
    fixture_cache: dict[tuple[str, bool, bool, str], FixtureExecutionResult] = {}
    for case in cases:
        result = evaluate_case(
            case,
            repo_root=repo_root,
            have_scarb=have_scarb,
            have_snforge=have_snforge,
            require_tools=args.require_tools,
            timeout_seconds=args.timeout_seconds,
            fixture_cache=fixture_cache,
        )
        results.append(result)

    totals, evaluated, skipped, prec, rec = compute_metrics(results)
    class_totals = compute_security_class_metrics(results)

    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    markdown = render_markdown(
        title=args.title,
        version=args.version,
        generated_at=generated_at,
        cases_path=display_path(cases_path, repo_root),
        results=results,
        totals=totals,
        evaluated=evaluated,
        skipped=skipped,
        precision=prec,
        recall=rec,
        have_scarb=have_scarb,
        have_snforge=have_snforge,
        min_reportable_cases=args.min_evaluated,
        class_totals=class_totals,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown, encoding="utf-8")
    saved_output: str | None = None
    if args.save:
        scorecards_dir = repo_root / "evals" / "scorecards"
        scorecards_dir.mkdir(parents=True, exist_ok=True)
        target = scorecards_dir / output_path.name
        if output_path.resolve() != target.resolve():
            shutil.copy2(output_path, target)
        saved_output = target.as_posix()

    print(
        json.dumps(
            {
                "cases": len(cases),
                "precision": round(prec, 6),
                "recall": round(rec, 6),
                "evaluated": evaluated,
                "skipped": skipped,
                "output": output_path.as_posix(),
                "saved_output": saved_output,
            },
            ensure_ascii=True,
        )
    )

    if evaluated == 0:
        if args.allow_empty_evaluated:
            print(
                "WARNING: no evaluated cases (all skipped); allowed by --allow-empty-evaluated",
                file=sys.stderr,
            )
            return 0
        print("FAIL: no evaluated cases (all skipped)", file=sys.stderr)
        return BENCHMARK_GATE_FAILURE_EXIT_CODE

    if prec < args.min_precision or rec < args.min_recall:
        print(
            "FAIL: threshold gate not met "
            f"(precision={prec:.4f}, recall={rec:.4f}, "
            f"min_precision={args.min_precision:.4f}, min_recall={args.min_recall:.4f})",
            file=sys.stderr,
        )
        return BENCHMARK_GATE_FAILURE_EXIT_CODE

    if args.enforce_min_evaluated and evaluated < args.min_evaluated:
        print(
            "FAIL: reportable threshold not met "
            f"(evaluated={evaluated}, min_evaluated={args.min_evaluated})",
            file=sys.stderr,
        )
        return BENCHMARK_GATE_FAILURE_EXIT_CODE

    if evaluated < args.min_evaluated:
        print(
            "NOTE: benchmark passed but sample is smoke-only "
            f"(evaluated={evaluated}, recommended_min={args.min_evaluated}).",
            file=sys.stderr,
        )
        print(
            "PASS: contract smoke gate met "
            f"(precision={prec:.4f}, recall={rec:.4f}, evaluated={evaluated}, skipped={skipped})",
            file=sys.stderr,
        )
    else:
        print(
            "PASS: contract reportable gate met "
            f"(precision={prec:.4f}, recall={rec:.4f}, evaluated={evaluated}, skipped={skipped})",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(BENCHMARK_RUNTIME_ERROR_EXIT_CODE)
