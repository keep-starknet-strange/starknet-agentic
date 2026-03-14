#!/usr/bin/env python3
"""Minimal runnable example for invoking snforge test suites from Python."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run snforge tests for a target package.")
    parser.add_argument("--workdir", default=".", help="Project directory containing Scarb.toml")
    parser.add_argument("--filter", default=None, help="Optional test filter (passed to snforge)")
    args = parser.parse_args()

    workdir = Path(args.workdir).resolve()
    if not (workdir / "Scarb.toml").is_file():
        print(f"ERROR: missing Scarb.toml in {workdir}", file=sys.stderr)
        return 1

    cmd = ["snforge", "test"]
    if args.filter:
        cmd.append(args.filter)

    print(f"$ {' '.join(cmd)}  # cwd={workdir}")
    result = subprocess.run(cmd, cwd=workdir)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
