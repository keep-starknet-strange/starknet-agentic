#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

REQUIRED_SEED_KEYS = {
    "audit_id",
    "project",
    "auditor",
    "source_url",
    "source_type",
    "raw_path",
    "extracted_path",
    "source_sha256",
    "license",
    "usage_rights",
    "redaction_status",
    "extractor_version",
}
DATE_RE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


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


def resolve_repo_path(repo_root: Path, candidate: str, label: str) -> Path:
    resolved = (repo_root / candidate).resolve(strict=False)
    try:
        resolved.relative_to(repo_root)
    except ValueError as exc:
        raise ValueError(f"seed {label} escapes repo root: {candidate}") from exc
    return resolved


def validate_seed_rows(rows: object) -> list[dict]:
    if not isinstance(rows, list):
        raise ValueError("seed file must contain a JSON array")
    normalized: list[dict] = []
    for idx, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"seed row {idx} must be a JSON object")
        missing = sorted(REQUIRED_SEED_KEYS - set(row.keys()))
        if missing:
            raise ValueError(f"seed row {idx} missing keys: {', '.join(missing)}")
        for key in REQUIRED_SEED_KEYS:
            value = row.get(key)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"seed row {idx} has empty/invalid {key}")
        date_value = row.get("date")
        if date_value is not None and (
            not isinstance(date_value, str) or not date_value.strip()
        ):
            raise ValueError(f"seed row {idx} has empty/invalid date")
        if isinstance(date_value, str) and DATE_RE.fullmatch(date_value) is None:
            raise ValueError(f"seed row {idx} has invalid date format: {date_value}")
        if not row["source_url"].startswith("https://"):
            raise ValueError(
                f"seed row {idx} source_url must use https://: {row['source_url']}"
            )
        if SHA256_RE.fullmatch(row["source_sha256"]) is None:
            raise ValueError(f"seed row {idx} invalid source_sha256")
        if row["usage_rights"] not in {
            "public_redistributable",
            "public_reference_only",
            "restricted_no_redistribution",
            "unknown",
        }:
            raise ValueError(
                f"seed row {idx} invalid usage_rights: {row['usage_rights']}"
            )
        if row["redaction_status"] not in {"none", "partial", "required", "unknown"}:
            raise ValueError(
                f"seed row {idx} invalid redaction_status: {row['redaction_status']}"
            )
        normalized.append(row)
    return normalized


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate audits.jsonl with hashes from seed metadata")
    parser.add_argument("--seed", required=True, help="Path to seed metadata JSON array")
    parser.add_argument("--output", required=True, help="Path to output JSONL")
    args = parser.parse_args()

    seed_path = Path(args.seed)
    out_path = Path(args.output)
    repo_root = Path(__file__).resolve().parents[2]
    repo_root_resolved = repo_root.resolve()

    rows = validate_seed_rows(json.loads(seed_path.read_text(encoding="utf-8")))
    generated = []
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    blocked_audit_ids = load_blocked_audit_ids(repo_root_resolved)

    for row in rows:
        audit_id = row.get("audit_id")
        if audit_id in blocked_audit_ids:
            raise ValueError(f"audit_id is blocked by held-out policy: {audit_id}")

        raw_path = resolve_repo_path(repo_root_resolved, row["raw_path"], "raw_path")
        extracted_path = resolve_repo_path(
            repo_root_resolved, row["extracted_path"], "extracted_path"
        )

        if not raw_path.exists():
            raise FileNotFoundError(f"Missing raw artifact: {raw_path}")
        if not extracted_path.exists():
            raise FileNotFoundError(f"Missing extracted artifact: {extracted_path}")

        rec = dict(row)
        rec["raw_path"] = raw_path.relative_to(repo_root_resolved).as_posix()
        rec["extracted_path"] = extracted_path.relative_to(repo_root_resolved).as_posix()
        rec["raw_sha256"] = sha256_file(raw_path)
        rec["extracted_sha256"] = sha256_file(extracted_path)
        rec["ingested_at"] = now
        generated.append(rec)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        for rec in generated:
            f.write(json.dumps(rec, ensure_ascii=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
