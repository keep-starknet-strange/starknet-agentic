#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path


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
    check.set_defaults(func=_check)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
