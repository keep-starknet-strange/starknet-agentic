#!/usr/bin/env python3
"""Precision gate for the deterministic preflight, against a held-out corpus.

Every contract under tests/fixtures/held-out-fp/ is benign, so every finding on
that corpus is a false positive. This gate compares the preflight's output to a
recorded baseline and fails in BOTH directions:

- a finding not in the baseline is a new false positive, and fails
- a baseline finding that no longer fires also fails, so a detector fix forces the
  baseline to ratchet down instead of leaving stale slack in the gate

Held out means the detectors were never fitted to these files. That is the whole
value: do not tune against them, and do not import them from detector logic.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCANNER = ROOT / "scripts" / "quality" / "audit_local_repo.py"
CORPUS = ROOT / "tests" / "fixtures" / "held-out-fp"
BASELINE = CORPUS / "expected_findings.json"


def scan(fixture: Path) -> list[dict[str, Any]]:
    with tempfile.TemporaryDirectory() as tmp:
        proc = subprocess.run(
            [
                sys.executable,
                str(SCANNER),
                "--repo-root",
                str(fixture),
                "--scan-id",
                fixture.name,
                "--output-dir",
                tmp,
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"scanner failed on {fixture.name}: {proc.stderr.strip()}")
        summary = json.loads(proc.stdout.strip().splitlines()[-1])
        payload = json.loads(Path(summary["output_json"]).read_text(encoding="utf-8"))
        return payload.get("findings", [])


def main() -> int:
    if not SCANNER.exists():
        print(f"missing scanner: {SCANNER}", file=sys.stderr)
        return 1
    if not BASELINE.exists():
        print(f"missing baseline: {BASELINE}", file=sys.stderr)
        return 1

    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))["known_false_positives"]
    fixtures = sorted(p for p in CORPUS.iterdir() if p.is_dir())
    if not fixtures:
        print(f"no fixtures under {CORPUS}", file=sys.stderr)
        return 1

    failures: list[str] = []
    total_fp = 0

    # A baseline entry for a fixture that no longer exists means the fixture was
    # deleted or renamed out of validation without CI noticing.
    present = {f.name for f in fixtures}
    for orphan in sorted(set(baseline) - present):
        failures.append(
            f"{orphan}: baseline references a fixture that is not on disk. "
            f"Restore it or remove its baseline entry."
        )

    for fixture in fixtures:
        findings = scan(fixture)
        actual = Counter(str(f.get("class_id", "UNKNOWN")) for f in findings)
        expected = Counter(
            {cls: int(meta["count"]) for cls, meta in baseline.get(fixture.name, {}).items()}
        )
        total_fp += sum(actual.values())

        # Locations matter, not just counts: an old false positive disappearing while a
        # new one of the same class appears elsewhere leaves the count unchanged.
        for cls, meta in baseline.get(fixture.name, {}).items():
            want_lines = sorted(int(line) for line in meta.get("lines", []))
            if not want_lines:
                continue
            got_lines = sorted(
                int(f["line"]) for f in findings if f.get("class_id") == cls and f.get("line") is not None
            )
            if got_lines != want_lines:
                failures.append(
                    f"{fixture.name}: {cls} moved -- baseline lines {want_lines}, found {got_lines}. "
                    f"Same count, different location means a different false positive."
                )

        for cls in sorted(set(actual) | set(expected)):
            got, want = actual.get(cls, 0), expected.get(cls, 0)
            if got == want:
                continue
            if want == 0:
                lines = [f.get("line") for f in findings if f.get("class_id") == cls]
                failures.append(
                    f"{fixture.name}: NEW false positive {cls} x{got} at line(s) {lines}. "
                    f"This corpus is benign; a finding here means the detector is wrong."
                )
            elif got == 0:
                failures.append(
                    f"{fixture.name}: {cls} no longer fires (baseline expects {want}). "
                    f"If you fixed the detector, remove it from {BASELINE.name}."
                )
            else:
                failures.append(
                    f"{fixture.name}: {cls} count changed {want} -> {got}. Update the baseline deliberately."
                )

        status = "clean" if not actual else f"{sum(actual.values())} known FP {dict(actual)}"
        print(f"  {fixture.name:<32} {status}")

    recorded = sum(int(m["count"]) for f in baseline.values() for m in f.values())
    print(f"\nfalse positives: {total_fp} actual / {recorded} recorded in baseline")

    if failures:
        print("\nprecision floor violated:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    if total_fp:
        print(f"precision floor held (baseline has {total_fp} known defects to drive to zero)")
    else:
        print("precision floor held at 1.0 -- no false positives on the held-out corpus")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
