#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path


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


def check_json_file(path: Path, blocked: set[str]) -> list[str]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"{path}: invalid json: {exc.msg}"]
    if not isinstance(data, dict):
        return [f"{path}: expected JSON object"]
    findings = []
    for key in ("audit_id", "source_audit_id"):
        value = data.get(key)
        if isinstance(value, str) and value in blocked:
            findings.append(f"{path}: blocked {key}={value}")
    return findings


def check_jsonl_file(path: Path, blocked: set[str]) -> list[str]:
    findings = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError as exc:
            findings.append(f"{path}:{line_no}: invalid json: {exc.msg}")
            continue
        if not isinstance(rec, dict):
            findings.append(f"{path}:{line_no}: expected JSON object")
            continue
        for key in ("audit_id", "source_audit_id"):
            value = rec.get(key)
            if isinstance(value, str) and value in blocked:
                findings.append(f"{path}:{line_no}: blocked {key}={value}")
    return findings


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    blocked = load_blocked_audit_ids(repo_root)
    if not blocked:
        print("OK: no blocked audit IDs configured")
        return 0

    issues: list[str] = []
    for path in sorted((repo_root / "datasets" / "manifests").glob("*.jsonl")):
        issues.extend(check_jsonl_file(path, blocked))
    for path in sorted((repo_root / "datasets" / "segments").glob("*.jsonl")):
        issues.extend(check_jsonl_file(path, blocked))
    for path in sorted((repo_root / "datasets" / "normalized" / "findings").glob("*.jsonl")):
        issues.extend(check_jsonl_file(path, blocked))
    for path in sorted((repo_root / "datasets" / "normalized" / "audits").glob("*.json")):
        issues.extend(check_json_file(path, blocked))

    if issues:
        print("FAILED: held-out audit ID leakage detected")
        for issue in issues:
            print(issue)
        return 1

    print("OK: no held-out audit IDs found in datasets artifacts")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
