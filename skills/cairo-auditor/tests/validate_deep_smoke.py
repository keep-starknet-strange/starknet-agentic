#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCANNER = ROOT / "scripts" / "quality" / "audit_local_repo.py"
SURFACE_MAP = ROOT / "scripts" / "quality" / "surface_map.py"
STRUCTURED_REPORT = ROOT / "scripts" / "quality" / "structured_report.py"
DEEP_INTEGRITY = ROOT / "scripts" / "quality" / "deep_integrity.py"
FIXTURE = ROOT / "tests" / "fixtures" / "insecure_upgrade_controller"
ADVERSARIAL_FIXTURE = ROOT / "tests" / "fixtures" / "adversarial_cross_function_vault"
REPORT_FORMAT = ROOT / "references" / "report-formatting.md"
SKILL_DOC = ROOT / "SKILL.md"

REQUIRED_CLASS = "NO_ACCESS_CONTROL_MUTATION"
SCANNER_TIMEOUT_SECONDS = 180
REQUIRED_REPORT_MARKERS = (
    "Execution Integrity: <FULL|DEGRADED|FAILED>",
    "## Execution Trace",
    "Allowed evidence tags:",
    "## Dropped Candidates",
)
REQUIRED_SKILL_MARKERS = (
    "Flags:",
    "--strict-models",
    "--proven-only",
    "CAUD-009",
    "structured_report.py",
    "surface_map.py",
    "deep_integrity.py",
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


def run_adversarial_fixture_preflight() -> tuple[bool, str]:
    with tempfile.TemporaryDirectory(prefix="cairo-auditor-adversarial-preflight-") as tmpdir:
        cmd = [
            "python3",
            str(SCANNER),
            "--repo-root",
            str(ADVERSARIAL_FIXTURE),
            "--scan-id",
            "adversarial-preflight",
            "--output-dir",
            tmpdir,
        ]
        proc = subprocess.run(cmd, text=True, capture_output=True, check=False, timeout=SCANNER_TIMEOUT_SECONDS)
        if proc.returncode != 0:
            return False, f"adversarial fixture preflight exited {proc.returncode}: {proc.stderr.strip()}"
        try:
            payload = json.loads(proc.stdout.strip())
        except json.JSONDecodeError as exc:
            return False, f"adversarial fixture preflight stdout is not JSON: {exc}"
        findings = int(payload.get("findings", -1))
        if findings != 0:
            return False, f"expected adversarial fixture to have 0 deterministic findings, got {findings}"
    return True, "adversarial fixture is not caught by deterministic preflight"


def run_structured_deep_path() -> tuple[bool, str]:
    fixture_file = ADVERSARIAL_FIXTURE / "src" / "lib.cairo"
    with tempfile.TemporaryDirectory(prefix="cairo-auditor-structured-deep-") as tmpdir:
        workdir = Path(tmpdir)
        scope_file = workdir / "cairo-audit-files.txt"
        scope_file.write_text(f"{fixture_file}\n", encoding="utf-8")

        surface_json = workdir / "cairo-audit-surface-map.json"
        surface_md = workdir / "cairo-audit-surface-map.md"
        proc = subprocess.run(
            [
                "python3",
                str(SURFACE_MAP),
                "--repo-root",
                str(ADVERSARIAL_FIXTURE),
                "--scope-file",
                str(scope_file),
                "--output-json",
                str(surface_json),
                "--output-md",
                str(surface_md),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            return False, f"surface map failed: {proc.stderr.strip()}"
        surface_text = surface_md.read_text(encoding="utf-8")
        for marker in ("execute_withdrawal", "_payout", "transfer"):
            if marker not in surface_text:
                return False, f"surface map missing marker: {marker}"

        init_proc = subprocess.run(
            [
                "python3",
                str(DEEP_INTEGRITY),
                "init",
                "--workdir",
                str(workdir),
                "--host",
                "codex",
                "--vector-model",
                "gpt-5.4",
                "--adversarial-model",
                "gpt-5.4",
                "--agent-tool-available",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if init_proc.returncode != 0:
            return False, f"deep integrity init failed: {init_proc.stderr.strip()}"

        for idx in range(1, 5):
            (workdir / f"cairo-audit-agent-{idx}-bundle.md").write_text("non-empty\n", encoding="utf-8")

        agent5 = workdir / "cairo-audit-agent-5-findings.json"
        agent5.write_text(
            json.dumps(
                {
                    "agent_id": 5,
                    "findings": [
                        {
                            "title": "Withdrawal Accounting Reset After External Payout",
                            "class_id": "STALE_STATE_WRITE",
                            "root_cause": "cross-function-payout-before-pending-reset",
                            "file": "src/lib.cairo",
                            "line": 17,
                            "priority": "P1",
                            "severity": "High",
                            "confidence": 88,
                            "description": "execute_withdrawal calls _payout before clearing pending_withdrawal, allowing callback-capable payout paths to observe stale withdrawal state.",
                            "attack_path": "operator -> execute_withdrawal() -> _payout() -> transfer() -> pending_withdrawal.write(..., 0)",
                            "guard_analysis": "The operator guard restricts the caller but does not change the interaction-before-effect ordering.",
                            "recommended_fix": "- self._payout(beneficiary, amount)\\n- self.pending_withdrawal.write(beneficiary, 0)\\n+ self.pending_withdrawal.write(beneficiary, 0)\\n+ self._payout(beneficiary, amount)",
                            "required_tests": [
                                "Regression test where payout callback cannot observe stale pending withdrawal",
                                "Guard test that pending withdrawal is cleared before transfer",
                            ],
                            "evidence_tags": ["[CODE-TRACE]", "[ADVERSARIAL]"],
                        }
                    ],
                    "dropped_candidates": [],
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        report_md = workdir / "security-review-test.md"
        report_json = workdir / "security-review-test.json"
        render_proc = subprocess.run(
            [
                "python3",
                str(STRUCTURED_REPORT),
                "--repo-root",
                str(ADVERSARIAL_FIXTURE),
                "--mode",
                "deep",
                "--workdir",
                str(workdir),
                "--scope-file",
                str(scope_file),
                "--agent-output",
                str(agent5),
                "--output-md",
                str(report_md),
                "--output-json",
                str(report_json),
                "--execution-integrity",
                "FULL",
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if render_proc.returncode != 0:
            return False, f"structured report failed: {render_proc.stderr.strip()}"
        report = report_md.read_text(encoding="utf-8")
        for marker in ("Execution Integrity: FULL", "Agent 5 adversarial", "[ADVERSARIAL]", "Dropped Candidates"):
            if marker not in report:
                return False, f"structured report missing marker: {marker}"

        check_proc = subprocess.run(
            [
                "python3",
                str(DEEP_INTEGRITY),
                "check",
                "--workdir",
                str(workdir),
                "--mode",
                "deep",
                "--report",
                str(report_md),
            ],
            text=True,
            capture_output=True,
            check=False,
        )
        if check_proc.returncode != 0:
            return False, f"deep integrity check failed: {check_proc.stdout.strip()} {check_proc.stderr.strip()}"

    return True, "structured deep path renders Agent 5-only finding with integrity evidence"


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
        run_adversarial_fixture_preflight(),
        run_structured_deep_path(),
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
