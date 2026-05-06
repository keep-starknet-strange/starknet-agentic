#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "references" / "finding.schema.json"


def _write_init(args: argparse.Namespace) -> int:
    workdir = Path(args.workdir).resolve()
    workdir.mkdir(parents=True, exist_ok=True)
    capabilities = {
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "host": args.host,
        "agent_tool_available": args.agent_tool_available,
        "specialists_required": 5,
        "threat_intel_fetch": args.threat_intel_fetch,
        "status": "OK" if args.agent_tool_available else "FAILED",
    }
    (workdir / "cairo-audit-host-capabilities.json").write_text(
        json.dumps(capabilities, indent=2, ensure_ascii=True) + "\n",
        encoding="utf-8",
    )
    (workdir / "cairo-audit-model-plan.txt").write_text(
        "\n".join(
            [
                f"host={args.host}",
                f"vector_model={args.vector_model}",
                f"adversarial_model={args.adversarial_model}",
                f"strict_models={'on' if args.strict_models else 'off'}",
                f"fallback_reason={args.fallback_reason}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(json.dumps({"status": capabilities["status"], "workdir": workdir.as_posix()}))
    return 0 if args.agent_tool_available else 1


def _line_count(path: Path) -> int:
    if not path.exists():
        return 0
    return len(path.read_text(encoding="utf-8", errors="ignore").splitlines())


def _type_ok(value: Any, type_spec: Any) -> bool:
    if isinstance(type_spec, list):
        return any(_type_ok(value, sub) for sub in type_spec)
    if type_spec == "object":
        return isinstance(value, dict)
    if type_spec == "array":
        return isinstance(value, list)
    if type_spec == "string":
        return isinstance(value, str)
    if type_spec == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if type_spec == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if type_spec == "null":
        return value is None
    return True


def _validate(value: Any, schema: dict, path: str, errors: list[str]) -> None:
    if "type" in schema and not _type_ok(value, schema["type"]):
        errors.append(f"{path}: expected type {schema['type']}, got {type(value).__name__}")
        return
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{path}: value {value!r} not in enum {schema['enum']}")
    if "const" in schema and value != schema["const"]:
        errors.append(f"{path}: value {value!r} != const {schema['const']!r}")
    if isinstance(value, str) and "minLength" in schema and len(value) < schema["minLength"]:
        errors.append(f"{path}: string shorter than minLength {schema['minLength']}")
    if isinstance(value, int) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            errors.append(f"{path}: {value} < minimum {schema['minimum']}")
        if "maximum" in schema and value > schema["maximum"]:
            errors.append(f"{path}: {value} > maximum {schema['maximum']}")
    if isinstance(value, dict):
        for required in schema.get("required", []):
            if required not in value:
                errors.append(f"{path}: missing required field {required!r}")
        for key, sub in schema.get("properties", {}).items():
            if key in value:
                _validate(value[key], sub, f"{path}.{key}", errors)
    if isinstance(value, list):
        item_schema = schema.get("items")
        if isinstance(item_schema, dict):
            for idx, item in enumerate(value):
                _validate(item, item_schema, f"{path}[{idx}]", errors)
        contains = schema.get("contains")
        if isinstance(contains, dict):
            sub_errors: list[str] = []
            matched = False
            for item in value:
                trial: list[str] = []
                _validate(item, contains, "", trial)
                if not trial:
                    matched = True
                    break
                sub_errors.extend(trial)
            if not matched:
                errors.append(f"{path}: no item matches contains schema {contains}")


def _validate_agent_outputs(workdir: Path) -> list[str]:
    if not SCHEMA_PATH.exists():
        return []
    try:
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"unable to load finding schema: {exc}"]

    errors: list[str] = []
    for agent_path in sorted(workdir.glob("cairo-audit-agent-*-findings.json")):
        try:
            payload = json.loads(agent_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{agent_path.name}: invalid JSON: {exc}")
            continue
        local: list[str] = []
        _validate(payload, schema, agent_path.name, local)
        errors.extend(local)
    return errors


def _check(args: argparse.Namespace) -> int:
    workdir = Path(args.workdir).resolve()
    failures: list[str] = []
    required = [
        workdir / "cairo-audit-host-capabilities.json",
        workdir / "cairo-audit-model-plan.txt",
        workdir / "cairo-audit-files.txt",
    ]
    for path in required:
        if not path.exists():
            failures.append(f"missing {path.name}")
    bundle_lines: dict[str, int] = {}
    for idx in range(1, 5):
        path = workdir / f"cairo-audit-agent-{idx}-bundle.md"
        lines = _line_count(path)
        bundle_lines[str(idx)] = lines
        if lines <= 0:
            failures.append(f"missing or empty bundle {idx}")

    if not args.skip_schema:
        for err in _validate_agent_outputs(workdir):
            failures.append(f"schema: {err}")

    report_path = Path(args.report).resolve() if args.report else None
    if report_path:
        if not report_path.exists():
            failures.append(f"missing report {report_path.as_posix()}")
        else:
            report = report_path.read_text(encoding="utf-8", errors="ignore")
            if "Execution Integrity:" not in report:
                failures.append("report missing Execution Integrity")
            if "## Execution Trace" not in report:
                failures.append("report missing Execution Trace")
            if args.mode == "deep" and "Agent 5 adversarial" not in report:
                failures.append("deep report missing Agent 5 trace")

    payload = {
        "status": "FAILED" if failures else "OK",
        "workdir": workdir.as_posix(),
        "bundle_lines": bundle_lines,
        "failures": failures,
    }
    print(json.dumps(payload, indent=2, ensure_ascii=True))
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or validate cairo-auditor deep-run integrity artifacts.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init = subparsers.add_parser("init")
    init.add_argument("--workdir", required=True)
    init.add_argument("--host", default="unknown")
    init.add_argument("--vector-model", default="unknown")
    init.add_argument("--adversarial-model", default="unknown")
    init.add_argument("--fallback-reason", default="none")
    init.add_argument("--strict-models", action="store_true")
    init.add_argument("--agent-tool-available", action=argparse.BooleanOptionalAction, default=True)
    init.add_argument("--threat-intel-fetch", action=argparse.BooleanOptionalAction, default=False)
    init.set_defaults(func=_write_init)

    check = subparsers.add_parser("check")
    check.add_argument("--workdir", required=True)
    check.add_argument("--mode", default="deep", choices=["default", "deep", "targeted", "degraded-deep"])
    check.add_argument("--report", default="")
    check.add_argument("--skip-schema", action="store_true")
    check.set_defaults(func=_check)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
