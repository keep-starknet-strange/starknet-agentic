#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass(frozen=True)
class PatternRule:
    path: str
    pattern: str
    description: str


@dataclass(frozen=True)
class GenerationCase:
    case_id: str
    skill_id: str
    security_class: str
    fixture: str
    target_file: str
    prompt: str
    run_build: bool
    run_tests: bool
    must_match: list[PatternRule]
    must_not_match: list[PatternRule]


@dataclass
class GenerationResult:
    case_id: str
    skill_id: str
    security_class: str
    fixture: str
    build_attempted: bool
    build_ok: bool
    tests_ok: bool
    static_ok: bool
    passed: bool
    vuln_flag: bool
    skipped: bool
    generation_error: str
    notes: list[str]


RULE_CONTEXT = "\n".join(
    [
        "Build-side Cairo quality rules:",
        "- Every storage-mutating external function must have explicit access posture (guarded or intentionally public).",
        "- Timelock checks must source time from get_block_timestamp(), never from user arguments.",
        "- Upgrade flows must reject zero class hashes and clear pending state after execution.",
        "- For split/parity logic on division by 2, prefer DivRem::div_rem over standalone / and %.",
        "- Prefer while i != n over while i < n for bounded loops when semantics allow it.",
    ]
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Run build-side LLM generation eval: generate contract files from prompts, "
            "then compile/test/static-check and report pass/vulnerability rates."
        )
    )
    parser.add_argument(
        "--cases",
        default="evals/cases/contract_skill_generation_eval.jsonl",
        help="Generation case pack path",
    )
    parser.add_argument(
        "--output-json",
        required=True,
        help="Output JSON report path",
    )
    parser.add_argument(
        "--output-md",
        required=True,
        help="Output markdown report path",
    )
    parser.add_argument("--model", default=os.environ.get("GENERATION_EVAL_MODEL", "openai/gpt-4o"))
    parser.add_argument(
        "--api-url",
        default=os.environ.get(
            "GENERATION_EVAL_API_URL",
            "https://models.github.ai/inference/chat/completions",
        ),
    )
    parser.add_argument("--auth-env", default=os.environ.get("GENERATION_EVAL_AUTH_ENV", "GITHUB_TOKEN"))
    parser.add_argument("--timeout-seconds", type=int, default=120)
    parser.add_argument("--build-timeout-seconds", type=int, default=240)
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--retry-base-seconds", type=float, default=2.0)
    parser.add_argument("--min-pass-rate", type=float, default=0.60)
    parser.add_argument("--max-vuln-rate", type=float, default=0.25)
    parser.add_argument("--min-evaluated", type=int, default=8)
    parser.add_argument(
        "--enforce-min-evaluated",
        action="store_true",
        help="Fail when evaluated cases are below --min-evaluated",
    )
    parser.add_argument(
        "--require-tools",
        action="store_true",
        help="Fail if scarb/snforge are unavailable when required by cases",
    )
    return parser.parse_args()


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


def load_cases(path: Path) -> list[GenerationCase]:
    cases: list[GenerationCase] = []
    seen: set[str] = set()
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        if not isinstance(raw, dict):
            raise ValueError(f"line {line_no}: case must be object")

        required = {
            "case_id",
            "skill_id",
            "security_class",
            "fixture",
            "target_file",
            "prompt",
            "run_build",
            "run_tests",
            "must_match",
            "must_not_match",
        }
        missing = required - set(raw.keys())
        if missing:
            raise ValueError(f"line {line_no}: missing keys {sorted(missing)}")

        case_id = raw["case_id"]
        if not isinstance(case_id, str):
            raise ValueError(f"line {line_no}: case_id must be string")
        if case_id in seen:
            raise ValueError(f"line {line_no}: duplicate case_id {case_id}")
        seen.add(case_id)

        for key in ("skill_id", "security_class", "fixture", "target_file", "prompt"):
            if not isinstance(raw[key], str) or not raw[key].strip():
                raise ValueError(f"line {line_no}: {key} must be non-empty string")

        for key in ("run_build", "run_tests"):
            if not isinstance(raw[key], bool):
                raise ValueError(f"line {line_no}: {key} must be bool")

        must_match = parse_rules(raw["must_match"], line_no, "must_match")
        must_not_match = parse_rules(raw["must_not_match"], line_no, "must_not_match")

        cases.append(
            GenerationCase(
                case_id=case_id,
                skill_id=raw["skill_id"],
                security_class=raw["security_class"],
                fixture=raw["fixture"],
                target_file=raw["target_file"],
                prompt=raw["prompt"],
                run_build=raw["run_build"],
                run_tests=raw["run_tests"],
                must_match=must_match,
                must_not_match=must_not_match,
            )
        )

    return cases


def resolve_under_root(root: Path, relative_path: str) -> Path | None:
    candidate = (root / relative_path).resolve()
    try:
        candidate.relative_to(root)
    except ValueError:
        return None
    return candidate


SAFE_SUBPROCESS_ENV_KEYS = (
    "PATH",
    "HOME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "USER",
)


def build_subprocess_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for key in SAFE_SUBPROCESS_ENV_KEYS:
        value = os.environ.get(key)
        if value:
            env[key] = value
    return env


def run_command(cmd: list[str], cwd: Path, timeout_seconds: int) -> tuple[bool, str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            env=build_subprocess_env(),
        )
        output = (proc.stdout or "") + (proc.stderr or "")
        return proc.returncode == 0, output.strip()
    except subprocess.TimeoutExpired as exc:
        output = ((exc.stdout or "") + (exc.stderr or "")).strip()
        timeout_note = f"timeout_after_{timeout_seconds}s"
        if output:
            return False, f"{timeout_note} || {output[:300]}"
        return False, timeout_note


def summarize_log(prefix: str, text: str, max_lines: int = 4) -> str:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return prefix
    compact = " || ".join(lines[:max_lines])
    if len(lines) > max_lines:
        compact += " || ..."
    return f"{prefix}:{compact[:400]}"


def extract_cairo_code(raw_text: str) -> str:
    blocks = re.findall(r"```(?:cairo)?\s*([\s\S]*?)```", raw_text, flags=re.IGNORECASE)
    if blocks:
        # Prefer the largest fenced block when multiple are present.
        largest = max(blocks, key=len)
        return largest.strip() + "\n"
    return raw_text.strip() + "\n"


def collect_fixture_context(*, fixture: Path, target_file: str, max_chars: int = 8000) -> str:
    sections: list[str] = []

    target = resolve_under_root(fixture, target_file)
    if target is not None and target.is_file():
        target_text = target.read_text(encoding="utf-8")
        sections.append(
            "Existing target file context:\n"
            f"Path: {target_file}\n"
            "```cairo\n"
            f"{target_text[:2500]}\n"
            "```"
        )

    scarb_toml = fixture / "Scarb.toml"
    if scarb_toml.is_file():
        scarb_text = scarb_toml.read_text(encoding="utf-8")
        sections.append(
            "Project manifest context:\n"
            "Path: Scarb.toml\n"
            "```toml\n"
            f"{scarb_text[:1000]}\n"
            "```"
        )

    tests_dir = fixture / "tests"
    if tests_dir.is_dir():
        for test_file in sorted(tests_dir.rglob("*.cairo"))[:4]:
            rel = test_file.relative_to(fixture).as_posix()
            test_text = test_file.read_text(encoding="utf-8")
            sections.append(
                "Relevant test context:\n"
                f"Path: {rel}\n"
                "```cairo\n"
                f"{test_text[:1500]}\n"
                "```"
            )

    if not sections:
        return ""
    context = "\n\n".join(sections)
    if len(context) > max_chars:
        return context[:max_chars] + "\n...[truncated]\n"
    return context


def build_messages(case: GenerationCase, fixture_context: str) -> list[dict[str, str]]:
    system = (
        "You are a senior Starknet Cairo engineer. "
        "Return only one complete file for the requested path. "
        "Output a single fenced code block with language 'cairo'."
    )
    user = (
        f"Case: {case.case_id}\n"
        f"Target file: {case.target_file}\n"
        "Task: produce production-grade Cairo code that compiles and passes tests in the provided fixture project.\n"
        f"{RULE_CONTEXT}\n"
        "Prompt:\n"
        f"{case.prompt}\n"
    )
    if fixture_context:
        user += "\nFixture context to preserve compatibility:\n" + fixture_context
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def call_model(
    *,
    api_url: str,
    api_key: str,
    model: str,
    case: GenerationCase,
    timeout_seconds: int,
    retries: int,
    retry_base_seconds: float,
    fixture_context: str,
) -> tuple[str, str]:
    payload = {
        "model": model,
        "temperature": 0,
        "messages": build_messages(case, fixture_context),
    }
    body = json.dumps(payload).encode("utf-8")

    last_error = ""
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            url=api_url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
            content = raw["choices"][0]["message"]["content"]
            code = extract_cairo_code(content)
            if not code.strip():
                return "", "empty_generation"
            return code, ""
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}: {exc.reason}"
            if attempt < retries and (exc.code in {408, 409, 425, 429} or exc.code >= 500):
                time.sleep(min(retry_base_seconds * (2**attempt), 20.0))
                continue
            break
        except (urllib.error.URLError, KeyError, ValueError, json.JSONDecodeError) as exc:
            last_error = str(exc)
            if attempt < retries:
                time.sleep(min(retry_base_seconds * (2**attempt), 20.0))
                continue
            break

    return "", f"model_call_failed:{last_error[:240]}"


def run_static_rules(*, case: GenerationCase, fixture: Path) -> list[str]:
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
        # Flags intentionally omitted: patterns rely on [\s\S] for cross-line behavior.
        if re.search(rule.pattern, text) is None:
            errors.append(f"must_match_failed:{rule.path}:{rule.description}")

    for rule in case.must_not_match:
        target = resolve_under_root(fixture, rule.path)
        if target is None:
            errors.append(f"must_not_match_path_escape:{rule.path}:{rule.description}")
            continue
        if not target.is_file():
            # Missing file means forbidden pattern cannot be present.
            continue
        text = target.read_text(encoding="utf-8")
        # Flags intentionally omitted: patterns rely on [\s\S] for cross-line behavior.
        if re.search(rule.pattern, text) is not None:
            errors.append(f"must_not_match_failed:{rule.path}:{rule.description}")

    return errors


def _is_vuln_static_error(error: str) -> bool:
    return error.startswith("must_not_match_failed:") or error.startswith("must_match_failed:")


def evaluate_case(
    *,
    case: GenerationCase,
    repo_root: Path,
    api_url: str,
    api_key: str,
    model: str,
    timeout_seconds: int,
    retries: int,
    retry_base_seconds: float,
    build_timeout_seconds: int,
    have_scarb: bool,
    have_snforge: bool,
) -> GenerationResult:
    notes: list[str] = []

    fixture = resolve_under_root(repo_root, case.fixture)
    if fixture is None or not fixture.is_dir():
        return GenerationResult(
            case_id=case.case_id,
            skill_id=case.skill_id,
            security_class=case.security_class,
            fixture=case.fixture,
            build_attempted=False,
            build_ok=False,
            tests_ok=False,
            static_ok=False,
            passed=False,
            vuln_flag=False,
            skipped=True,
            generation_error="fixture_missing",
            notes=[f"fixture_missing:{case.fixture}"],
        )

    if case.run_build and not have_scarb:
        return GenerationResult(
            case_id=case.case_id,
            skill_id=case.skill_id,
            security_class=case.security_class,
            fixture=case.fixture,
            build_attempted=False,
            build_ok=False,
            tests_ok=False,
            static_ok=False,
            passed=False,
            vuln_flag=False,
            skipped=True,
            generation_error="",
            notes=["skip_missing_tool:scarb"],
        )

    if case.run_tests and not have_snforge:
        return GenerationResult(
            case_id=case.case_id,
            skill_id=case.skill_id,
            security_class=case.security_class,
            fixture=case.fixture,
            build_attempted=False,
            build_ok=False,
            tests_ok=False,
            static_ok=False,
            passed=False,
            vuln_flag=False,
            skipped=True,
            generation_error="",
            notes=["skip_missing_tool:snforge"],
        )

    fixture_context = collect_fixture_context(fixture=fixture, target_file=case.target_file)

    generated_code, generation_error = call_model(
        api_url=api_url,
        api_key=api_key,
        model=model,
        case=case,
        timeout_seconds=timeout_seconds,
        retries=retries,
        retry_base_seconds=retry_base_seconds,
        fixture_context=fixture_context,
    )
    if generation_error:
        return GenerationResult(
            case_id=case.case_id,
            skill_id=case.skill_id,
            security_class=case.security_class,
            fixture=case.fixture,
            build_attempted=False,
            build_ok=False,
            tests_ok=False,
            static_ok=False,
            passed=False,
            vuln_flag=False,
            skipped=False,
            generation_error=generation_error,
            notes=[],
        )

    with tempfile.TemporaryDirectory(prefix=f"contract-gen-{case.case_id}-") as tmp_dir:
        tmp_root = Path(tmp_dir).resolve()
        tmp_fixture = tmp_root / "fixture"
        shutil.copytree(fixture, tmp_fixture, ignore=shutil.ignore_patterns("target"))

        target = resolve_under_root(tmp_fixture, case.target_file)
        if target is None:
            return GenerationResult(
                case_id=case.case_id,
                skill_id=case.skill_id,
                security_class=case.security_class,
                fixture=case.fixture,
                build_attempted=False,
                build_ok=False,
                tests_ok=False,
                static_ok=False,
                passed=False,
                vuln_flag=False,
                skipped=False,
                generation_error="target_path_escape",
                notes=[f"target_path_escape:{case.target_file}"],
            )

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(generated_code, encoding="utf-8")

        build_ok = True
        tests_ok = True

        if case.run_build:
            build_ok, build_log = run_command(["scarb", "build"], tmp_fixture, build_timeout_seconds)
            if not build_ok:
                notes.append(summarize_log("scarb_build_failed", build_log))

        if case.run_tests:
            if build_ok:
                tests_ok, test_log = run_command(["snforge", "test"], tmp_fixture, build_timeout_seconds)
                if not tests_ok:
                    notes.append(summarize_log("snforge_test_failed", test_log))
            else:
                tests_ok = False
                notes.append("snforge_skipped:build_failed")

        static_errors = run_static_rules(case=case, fixture=tmp_fixture)
        static_ok = len(static_errors) == 0
        notes.extend(static_errors)

    vuln_flag = any(_is_vuln_static_error(err) for err in static_errors)
    passed = build_ok and tests_ok and static_ok
    return GenerationResult(
        case_id=case.case_id,
        skill_id=case.skill_id,
        security_class=case.security_class,
        fixture=case.fixture,
        build_attempted=case.run_build,
        build_ok=build_ok,
        tests_ok=tests_ok,
        static_ok=static_ok,
        passed=passed,
        vuln_flag=vuln_flag,
        skipped=False,
        generation_error="",
        notes=notes,
    )


def render_markdown(
    *,
    model: str,
    cases_path: Path,
    generated_at: str,
    total: int,
    evaluated: int,
    skipped: int,
    pass_rate: float,
    vuln_rate: float,
    build_failures: int,
    test_failures: int,
    generation_failures: int,
    results: list[GenerationResult],
) -> str:
    lines: list[str] = []
    lines.append("# Contract Skill Generation Eval")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Model: `{model}`")
    lines.append(f"Case pack: `{cases_path.as_posix()}`")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Total cases: `{total}`")
    lines.append(f"- Evaluated cases: `{evaluated}`")
    lines.append(f"- Skipped cases: `{skipped}`")
    lines.append(f"- Pass rate: `{pass_rate:.3f}`")
    lines.append(f"- Vulnerability rate: `{vuln_rate:.3f}`")
    lines.append(f"- Build failures: `{build_failures}`")
    lines.append(f"- Test failures: `{test_failures}`")
    lines.append(f"- Generation failures: `{generation_failures}`")
    lines.append("")
    lines.append("## Case Outcomes")
    lines.append("")
    lines.append("| Case | Skill | Class | Build | Tests | Static | Passed | Vulnerable | Notes |")
    lines.append("| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |")
    for row in results:
        note = row.generation_error or ("; ".join(row.notes[:2]) if row.notes else "")
        note = note.replace("|", "/")[:140]
        lines.append(
            "| "
            f"{row.case_id} | {row.skill_id} | {row.security_class} | "
            f"{str(row.build_ok).lower()} | {str(row.tests_ok).lower()} | {str(row.static_ok).lower()} | "
            f"{str(row.passed).lower()} | {str(row.vuln_flag).lower()} | {note} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()

    api_key = os.environ.get(args.auth_env, "").strip()
    used_fallback_auth = False
    if not api_key and args.auth_env != "OPENAI_API_KEY":
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        used_fallback_auth = bool(api_key)
    if used_fallback_auth:
        print(
            f"[warn] {args.auth_env} is unset; falling back to OPENAI_API_KEY. "
            "Ensure --api-url points to a trusted endpoint.",
            file=sys.stderr,
        )
    if not api_key:
        print(
            f"{args.auth_env} is required for generation eval "
            "(or OPENAI_API_KEY for compatibility fallback)"
        )
        return 1

    repo_root = Path(__file__).resolve().parents[2]
    cases_path = (repo_root / args.cases).resolve()
    out_json = (repo_root / args.output_json).resolve()
    out_md = (repo_root / args.output_md).resolve()

    cases = load_cases(cases_path)
    have_scarb = shutil.which("scarb") is not None
    have_snforge = shutil.which("snforge") is not None

    if args.require_tools:
        missing: list[str] = []
        if not have_scarb:
            missing.append("scarb")
        if not have_snforge:
            missing.append("snforge")
        if missing:
            print(f"FAILED: required tools missing: {', '.join(missing)}")
            return 1

    results: list[GenerationResult] = []
    for case in cases:
        try:
            results.append(
                evaluate_case(
                    case=case,
                    repo_root=repo_root,
                    api_url=args.api_url,
                    api_key=api_key,
                    model=args.model,
                    timeout_seconds=args.timeout_seconds,
                    retries=args.retries,
                    retry_base_seconds=args.retry_base_seconds,
                    build_timeout_seconds=args.build_timeout_seconds,
                    have_scarb=have_scarb,
                    have_snforge=have_snforge,
                )
            )
        except Exception as exc:
            results.append(
                GenerationResult(
                    case_id=case.case_id,
                    skill_id=case.skill_id,
                    security_class=case.security_class,
                    fixture=case.fixture,
                    build_attempted=False,
                    build_ok=False,
                    tests_ok=False,
                    static_ok=False,
                    passed=False,
                    vuln_flag=False,
                    skipped=False,
                    generation_error=f"case_eval_exception:{type(exc).__name__}",
                    notes=[f"case_eval_exception:{str(exc)[:240]}"],
                )
            )

    total = len(results)
    skipped = sum(1 for row in results if row.skipped)
    evaluated_rows = [row for row in results if not row.skipped]
    evaluated = len(evaluated_rows)
    generated_rows = [row for row in evaluated_rows if not row.generation_error]
    generated = len(generated_rows)

    passed_count = sum(1 for row in generated_rows if row.passed)
    vuln_count = sum(1 for row in generated_rows if row.vuln_flag)
    build_failures = sum(1 for row in generated_rows if not row.build_ok)
    test_failures = sum(1 for row in generated_rows if row.build_ok and not row.tests_ok)
    generation_failures = sum(1 for row in evaluated_rows if bool(row.generation_error))

    pass_rate = (passed_count / generated) if generated else 0.0
    vuln_rate = (vuln_count / generated) if generated else 0.0

    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    gate_passed = (
        (pass_rate >= args.min_pass_rate)
        and (vuln_rate <= args.max_vuln_rate)
        and (evaluated >= args.min_evaluated or not args.enforce_min_evaluated)
    )

    report = {
        "generated_at": generated_at,
        "model": args.model,
        "cases_path": cases_path.as_posix(),
        "totals": {
            "total": total,
            "evaluated": evaluated,
            "generated": generated,
            "skipped": skipped,
            "passed": passed_count,
            "vulnerable": vuln_count,
            "build_failures": build_failures,
            "test_failures": test_failures,
            "generation_failures": generation_failures,
        },
        "metrics": {
            "pass_rate": pass_rate,
            "vuln_rate": vuln_rate,
        },
        "gate": {
            "min_pass_rate": args.min_pass_rate,
            "max_vuln_rate": args.max_vuln_rate,
            "min_evaluated": args.min_evaluated,
            "enforce_min_evaluated": args.enforce_min_evaluated,
            "passed": gate_passed,
        },
        "results": [
            {
                "case_id": row.case_id,
                "skill_id": row.skill_id,
                "security_class": row.security_class,
                "fixture": row.fixture,
                "build_attempted": row.build_attempted,
                "build_ok": row.build_ok,
                "tests_ok": row.tests_ok,
                "static_ok": row.static_ok,
                "passed": row.passed,
                "vuln_flag": row.vuln_flag,
                "skipped": row.skipped,
                "generation_error": row.generation_error,
                "notes": row.notes,
            }
            for row in results
        ],
    }

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(report, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(
        render_markdown(
            model=args.model,
            cases_path=cases_path,
            generated_at=generated_at,
            total=total,
            evaluated=evaluated,
            skipped=skipped,
            pass_rate=pass_rate,
            vuln_rate=vuln_rate,
            build_failures=build_failures,
            test_failures=test_failures,
            generation_failures=generation_failures,
            results=results,
        )
        + "\n",
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "total": total,
                "evaluated": evaluated,
                "pass_rate": round(pass_rate, 6),
                "vuln_rate": round(vuln_rate, 6),
                "output_json": out_json.as_posix(),
                "output_md": out_md.as_posix(),
            },
            ensure_ascii=True,
        )
    )

    if args.enforce_min_evaluated and evaluated < args.min_evaluated:
        print(
            f"FAILED: evaluated={evaluated} below required minimum {args.min_evaluated}"
        )
        return 1

    if pass_rate < args.min_pass_rate or vuln_rate > args.max_vuln_rate:
        print(
            f"FAILED: pass_rate={pass_rate:.3f} vuln_rate={vuln_rate:.3f} "
            f"thresholds=({args.min_pass_rate:.3f}, {args.max_vuln_rate:.3f})"
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
