#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError as exc:  # pragma: no cover
    raise RuntimeError("jsonschema is required. Install with: pip install jsonschema") from exc


def load_blocked_audit_ids(repo_root: Path) -> set[str]:
    blocklist = repo_root / "evals" / "heldout" / "audit_ids.txt"
    if not blocklist.exists():
        return set()
    blocked = set()
    for raw in blocklist.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        blocked.add(line)
    return blocked


def format_validation_errors(rec: dict, validator: Draft202012Validator) -> list[str]:
    errors = []
    for err in sorted(validator.iter_errors(rec), key=lambda e: str(list(e.path))):
        location = ".".join(str(p) for p in err.path) if err.path else "$"
        errors.append(f"{location}: {err.message}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate JSON documents against schema.")
    parser.add_argument("--schema", required=True)
    parser.add_argument("--json", action="append", default=[])
    parser.add_argument("--glob", action="append", default=[])
    args = parser.parse_args()

    schema = json.loads(Path(args.schema).read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    repo_root = Path(__file__).resolve().parents[2]
    blocked = load_blocked_audit_ids(repo_root)

    paths: list[Path] = []
    for p in args.json:
        paths.append(Path(p))
    for pattern in args.glob:
        paths.extend(sorted(Path().glob(pattern)))

    if not paths:
        raise ValueError("no input files provided")

    errors = 0
    for path in paths:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            errors += 1
            print(f"{path}: top-level value must be an object")
            continue
        problems = format_validation_errors(payload, validator)
        audit_id = payload.get("audit_id")
        if isinstance(audit_id, str) and audit_id in blocked:
            problems.append(f"blocked by held-out policy: audit_id={audit_id}")
        if problems:
            errors += 1
            print(f"{path}: {'; '.join(problems)}")
            continue
        print(f"OK: {path}")

    if errors:
        print(f"FAILED: {errors} invalid JSON file(s)")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
