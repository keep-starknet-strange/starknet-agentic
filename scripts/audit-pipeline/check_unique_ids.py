#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Check duplicate keys in manifest JSONL records.")
    parser.add_argument("--jsonl", required=True)
    parser.add_argument(
        "--keys",
        nargs="+",
        default=["audit_id", "source_url"],
        help="Record keys that must be globally unique.",
    )
    args = parser.parse_args()

    rows: list[tuple[int, dict[str, object]]] = []
    for i, line in enumerate(Path(args.jsonl).read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        rec = json.loads(line)
        if not isinstance(rec, dict):
            raise ValueError(f"line {i}: top-level JSON value must be object")
        rows.append((i, rec))

    failures = 0
    for key in args.keys:
        seen: dict[str, int] = {}
        for line_no, rec in rows:
            value = rec.get(key)
            if value is None:
                failures += 1
                print(f"missing {key} at line {line_no}")
                continue
            text = str(value)
            if not text.strip():
                failures += 1
                print(f"empty {key} at line {line_no}")
                continue
            if text in seen:
                failures += 1
                print(f"duplicate {key}: '{text}' at line {seen[text]} and line {line_no}")
            else:
                seen[text] = line_no

    if failures:
        print(f"FAILED: {failures} duplicate key violations")
        return 1

    print(f"OK: {args.jsonl} (checked keys: {', '.join(args.keys)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
