#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent
if SCRIPT_DIR.as_posix() not in sys.path:
    sys.path.insert(0, SCRIPT_DIR.as_posix())

from benchmark_cairo_auditor import DETECTORS  # noqa: E402


def _normalize(identifier: str) -> str:
    return re.sub(r"[^A-Z0-9]+", "_", identifier.upper()).strip("_")


def _load_case_class_ids(path: Path) -> set[str]:
    classes: set[str] = set()
    with path.open(encoding="utf-8") as handle:
        for idx, raw in enumerate(handle, start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{idx}: invalid JSON: {exc}") from exc
            if "class_id" not in row or not isinstance(row["class_id"], str):
                raise ValueError(f"{path}:{idx}: missing or invalid class_id")
            classes.add(row["class_id"])
    return classes


def _load_vulndb_ids(vulndb_dir: Path) -> set[str]:
    ids: set[str] = set()
    for file_path in sorted(vulndb_dir.glob("*.md")):
        if file_path.name.upper() == "README.MD":
            continue
        ids.add(file_path.stem)
    return ids


def _resolve_under_repo(raw: str, repo_root: Path) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate.resolve()
    return (repo_root / candidate).resolve()


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Ensure benchmark class IDs and detector classes are represented in "
            "skills/cairo-auditor/references/vulnerability-db."
        )
    )
    parser.add_argument(
        "--cases",
        action="append",
        required=True,
        help="JSONL benchmark case file (repeatable).",
    )
    parser.add_argument(
        "--vulndb-dir",
        default="skills/cairo-auditor/references/vulnerability-db",
        help="Directory containing vuln-db markdown files.",
    )
    parser.add_argument(
        "--fail-on-orphans",
        action="store_true",
        help="Also fail when vuln-db files are not referenced by any benchmark class ID.",
    )
    args = parser.parse_args()

    case_paths = [_resolve_under_repo(p, REPO_ROOT) for p in args.cases]
    vulndb_dir = _resolve_under_repo(args.vulndb_dir, REPO_ROOT)
    for case_path in case_paths:
        if not case_path.exists() or not case_path.is_file():
            raise SystemExit(f"case file not found: {case_path}")
    if not vulndb_dir.exists() or not vulndb_dir.is_dir():
        raise SystemExit(f"vuln-db directory not found: {vulndb_dir}")

    case_ids: set[str] = set()
    for case_path in case_paths:
        case_ids |= _load_case_class_ids(case_path)

    detector_ids = set(DETECTORS.keys())
    vulndb_ids = _load_vulndb_ids(vulndb_dir)

    norm_case_map = {_normalize(x): x for x in case_ids}
    norm_detector_map = {_normalize(x): x for x in detector_ids}
    norm_vulndb_map = {_normalize(x): x for x in vulndb_ids}

    missing_for_cases = sorted(
        norm_case_map[norm]
        for norm in norm_case_map
        if norm not in norm_vulndb_map
    )
    missing_for_detectors = sorted(
        norm_detector_map[norm]
        for norm in norm_detector_map
        if norm not in norm_vulndb_map
    )
    orphan_vulndb = sorted(
        norm_vulndb_map[norm]
        for norm in norm_vulndb_map
        if norm not in norm_case_map and norm not in norm_detector_map
    )

    summary = {
        "case_files": [p.as_posix() for p in case_paths],
        "vulndb_dir": vulndb_dir.as_posix(),
        "benchmark_classes": len(case_ids),
        "detector_classes": len(detector_ids),
        "vulndb_files": len(vulndb_ids),
        "missing_for_cases": missing_for_cases,
        "missing_for_detectors": missing_for_detectors,
        "orphan_vulndb": orphan_vulndb,
    }
    print(json.dumps(summary, ensure_ascii=True))

    if missing_for_cases or missing_for_detectors:
        return 1
    if args.fail_on_orphans and orphan_vulndb:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
