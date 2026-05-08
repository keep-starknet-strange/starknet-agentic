#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "quality" / "audit_local_repo.py"
FIXTURES = ROOT / "tests" / "fixtures"

CASES = [
    {
        "name": "insecure_upgrade_controller",
        "expected_classes": {
            "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD",
            "NO_ACCESS_CONTROL_MUTATION",
            "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK",
            "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD",
        },
        "expected_findings_exact": 4,
    },
    {
        "name": "secure_upgrade_controller",
        "expected_classes": set(),
        "expected_findings_exact": 0,
    },
    {
        "name": "insecure_embed_upgrade_controller",
        "expected_classes": {
            "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD",
            "NO_ACCESS_CONTROL_MUTATION",
            "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK",
            "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD",
        },
        "expected_findings_exact": 4,
    },
    {
        "name": "insecure_per_item_upgrade_controller",
        "expected_classes": {
            "NO_ACCESS_CONTROL_MUTATION",
            "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK",
            "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD",
        },
        "expected_findings_exact": 3,
    },
    {
        "name": "caller_read_without_auth",
        "expected_classes": {"NO_ACCESS_CONTROL_MUTATION"},
        "expected_findings_exact": 1,
    },
    {
        "name": "guarded_upgrade_without_timelock",
        "expected_classes": set(),
        "expected_findings_exact": 0,
    },
    {
        "name": "unchecked_fee_bound",
        "expected_classes": {"UNCHECKED_FEE_BOUND"},
        "expected_findings_exact": 1,
    },
]


def run_case(case: dict[str, object]) -> tuple[bool, str]:
    fixture = FIXTURES / str(case["name"])
    with tempfile.TemporaryDirectory(prefix="cairo-auditor-fixture-") as tmpdir:
        cmd = [
            "python3",
            str(SCRIPT),
            "--repo-root",
            str(fixture),
            "--scan-id",
            f"fixture-{case['name']}",
            "--output-dir",
            tmpdir,
            "--enable-benchmark-bridge",
        ]
        proc = subprocess.run(cmd, text=True, capture_output=True, check=False)
        if proc.returncode != 0:
            return False, f"{case['name']}: scanner exited {proc.returncode}: {proc.stderr.strip()}"

        raw_stdout = proc.stdout.strip()
        if not raw_stdout:
            return False, f"{case['name']}: scanner produced empty stdout"
        if "\n" in raw_stdout:
            return False, f"{case['name']}: unexpected multi-line stdout: {raw_stdout!r}"

        try:
            payload = json.loads(raw_stdout)
        except Exception as exc:  # noqa: BLE001
            return False, f"{case['name']}: failed to parse scanner JSON output: {exc}"

        out_json = Path(str(payload.get("output_json", "")))
        out_md = Path(str(payload.get("output_md", "")))
        if not out_json.is_file() or not out_md.is_file():
            return (
                False,
                f"{case['name']}: scanner did not emit expected report artifacts",
            )
        tmp_root = Path(tmpdir).resolve()
        out_json_resolved = out_json.resolve()
        out_md_resolved = out_md.resolve()
        if tmp_root not in out_json_resolved.parents or tmp_root not in out_md_resolved.parents:
            return (
                False,
                f"{case['name']}: scanner emitted reports outside case temp dir",
            )

        findings = int(payload.get("findings", -1))
        classes = set(payload.get("class_counts", {}).keys())
        if case["name"] == "unchecked_fee_bound":
            detector_source = payload.get("detector_source", {})
            benchmark_count = int(detector_source.get("benchmark_detector_count", 0))
            if benchmark_count <= 0:
                return (
                    False,
                    f"{case['name']}: benchmark detector bridge did not load",
                )

    if "expected_findings_exact" in case and findings != int(case["expected_findings_exact"]):
        return (
            False,
            f"{case['name']}: expected findings={case['expected_findings_exact']}, got {findings}",
        )

    if "expected_findings_min" in case and findings < int(case["expected_findings_min"]):
        return (
            False,
            f"{case['name']}: expected findings>={case['expected_findings_min']}, got {findings}",
        )

    expected_classes = set(case.get("expected_classes", set()))
    if "expected_findings_exact" in case and classes != expected_classes:
        return (
            False,
            f"{case['name']}: expected classes {sorted(expected_classes)}, got {sorted(classes)}",
        )

    if "expected_findings_exact" not in case and not expected_classes.issubset(classes):
        return (
            False,
            f"{case['name']}: missing classes {sorted(expected_classes - classes)}; got {sorted(classes)}",
        )

    return True, f"{case['name']}: ok (findings={findings}, classes={sorted(classes)})"


def run_bridge_default_disabled() -> tuple[bool, str]:
    fixture = FIXTURES / "unchecked_fee_bound"
    with tempfile.TemporaryDirectory(prefix="cairo-auditor-bridge-disabled-") as tmpdir:
        cmd = [
            "python3",
            str(SCRIPT),
            "--repo-root",
            str(fixture),
            "--scan-id",
            "bridge-disabled",
            "--output-dir",
            tmpdir,
        ]
        env = dict(os.environ)
        env.pop("CAUD_ENABLE_BENCHMARK_BRIDGE", None)
        proc = subprocess.run(cmd, text=True, capture_output=True, check=False, env=env)
        if proc.returncode != 0:
            return False, f"bridge-disabled: scanner exited {proc.returncode}: {proc.stderr.strip()}"
        try:
            payload = json.loads(proc.stdout.strip())
        except json.JSONDecodeError as exc:
            return False, f"bridge-disabled: scanner stdout is not JSON: {exc}"
        detector_source = payload.get("detector_source", {})
        benchmark_count = int(detector_source.get("benchmark_detector_count", -1))
        benchmark_source = str(detector_source.get("benchmark_detector_source", ""))
        if benchmark_count != 0 or benchmark_source != "unavailable":
            return (
                False,
                "bridge-disabled: benchmark bridge loaded without explicit opt-in",
            )
        classes = set(payload.get("class_counts", {}).keys())
        if "UNCHECKED_FEE_BOUND" in classes:
            return False, "bridge-disabled: benchmark-only fee detector ran without opt-in"

    return True, "benchmark detector bridge is unavailable without explicit opt-in"


def main() -> int:
    if not SCRIPT.exists():
        print(f"missing scanner script: {SCRIPT}", file=sys.stderr)
        return 1

    failures: list[str] = []
    ok, msg = run_bridge_default_disabled()
    print(msg)
    if not ok:
        failures.append(msg)
    for case in CASES:
        ok, msg = run_case(case)
        print(msg)
        if not ok:
            failures.append(msg)

    if failures:
        print("\nfixture validation failed", file=sys.stderr)
        return 1

    print("\nall fixture checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
