#!/usr/bin/env python3
"""Validate Cairo skill cutover boundaries in skills/manifest.json.

This is a deterministic regression check for the repository migration from
legacy Cairo skill names to the new canonical split.
"""

from __future__ import annotations

import json
from json import JSONDecodeError
from pathlib import Path
import sys

MANIFEST = Path(__file__).resolve().parent.parent / "skills" / "manifest.json"

REQUIRED = {
    "cairo-auditor",
    "cairo-contract-authoring",
    "cairo-testing",
    "cairo-optimization",
    "cairo-deploy",
    "account-abstraction",
    "starknet-network-facts",
}

FORBIDDEN = {
    "cairo-security",
    "cairo-contracts",
}


def main() -> int:
    if not MANIFEST.is_file():
        print(f"ERROR: missing {MANIFEST}")
        return 1

    try:
        data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except JSONDecodeError as exc:
        print(f"ERROR: invalid JSON in {MANIFEST}: {exc}")
        return 1

    skills = data.get("skills", [])
    if not isinstance(skills, list):
        print(f"ERROR: expected 'skills' to be a list in {MANIFEST}")
        return 1

    names: set[str] = set()
    for idx, entry in enumerate(skills):
        if not isinstance(entry, dict):
            print(f"WARNING: skipping malformed skill entry at index {idx}: not an object")
            continue
        name = entry.get("name")
        if not isinstance(name, str) or not name:
            print(f"WARNING: skipping malformed skill entry at index {idx}: missing 'name'")
            continue
        names.add(name)

    missing = sorted(REQUIRED - names)
    present_forbidden = sorted(FORBIDDEN & names)

    if missing:
        print("ERROR: required cairo skills missing from manifest:")
        for name in missing:
            print(f"  - {name}")

    if present_forbidden:
        print("ERROR: superseded cairo skills still present in manifest:")
        for name in present_forbidden:
            print(f"  - {name}")

    if missing or present_forbidden:
        return 1

    print("OK: cairo skill cutover boundaries validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
