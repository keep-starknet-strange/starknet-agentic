#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCANNER = ROOT / "scripts" / "quality" / "audit_local_repo.py"
FIXTURE = ROOT / "tests" / "fixtures" / "insecure_upgrade_controller"
REPORT_FORMAT = ROOT / "references" / "report-formatting.md"
SKILL_DOC = ROOT / "SKILL.md"

REQUIRED_CLASS = "NO_ACCESS_CONTROL_MUTATION"
SCANNER_TIMEOUT_SECONDS = 180
REQUIRED_REPORT_MARKERS = (
    "Execution Integrity: <FULL|DEGRADED|FAILED>",
    "## Execution Trace",
    "## Dropped Candidates",
)
REQUIRED_SKILL_MARKERS = (
    "Flags:",
    "--strict-models",
    "CAUD-009",
    "`Dropped Candidates`, `Findings Index`",
)


def run_fixture_scan() -> tuple[bool, str]:
    with tempfile.TemporaryDirectory(prefix="cairo-auditor-deep-smoke-") as tmpdir:
        cmd = [
            "python3",
            str(SCANNER),
            "--repo-root",
            str(FIXTURE),
            "--scan-id",
            "deep-smoke",
            "--output-dir",
            tmpdir,
        ]
        try:
            proc = subprocess.run(
                cmd,
                text=True,
                capture_output=True,
                check=False,
                timeout=SCANNER_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return False, f"scanner timed out after {SCANNER_TIMEOUT_SECONDS}s"
        if proc.returncode != 0:
            return False, f"scanner exited {proc.returncode}: {proc.stderr.strip()}"

        stdout = proc.stdout.strip()
        if not stdout:
            return False, "scanner produced empty stdout"

        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            return False, f"scanner stdout is not JSON: {exc}"

        findings = int(payload.get("findings", 0))
        classes = set(payload.get("class_counts", {}).keys())

        if findings < 1:
            return False, f"expected at least 1 deterministic finding, got {findings}"
        if REQUIRED_CLASS not in classes:
            return False, f"expected class {REQUIRED_CLASS}, got {sorted(classes)}"

    return True, "fixture scan produced >=1 finding with expected vulnerability class"


def validate_markers(path: Path, markers: tuple[str, ...], label: str) -> tuple[bool, str]:
    try:
        content = path.read_text(encoding="utf-8")
    except OSError as exc:
        return False, f"unable to read {path}: {exc}"

    missing = [marker for marker in markers if marker not in content]
    if missing:
        return False, f"{label} missing markers: {', '.join(missing)}"

    return True, f"{label} contains required deep-mode markers"


def main() -> int:
    if not SCANNER.exists():
        print(f"missing scanner script: {SCANNER}", file=sys.stderr)
        return 1

    checks = [
        run_fixture_scan(),
        validate_markers(REPORT_FORMAT, REQUIRED_REPORT_MARKERS, "report format"),
        validate_markers(SKILL_DOC, REQUIRED_SKILL_MARKERS, "skill contract"),
    ]

    failures: list[str] = []
    for ok, msg in checks:
        print(msg)
        if not ok:
            failures.append(msg)

    if failures:
        print("\ndeep smoke validation failed", file=sys.stderr)
        return 1

    print("\ndeep smoke validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
