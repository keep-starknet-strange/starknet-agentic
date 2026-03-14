#!/usr/bin/env python3

from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path

VECTOR_PATTERN = re.compile(r"^\*\*(\d+)\.\s+", re.MULTILINE)
VECTOR_LIST_PATTERN = re.compile(r"attack_vectors_(?:core|extended):\s*\[([^\]]*)\]")
INT_PATTERN = re.compile(r"\d+")
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.parent


def _glob_paths(repo_root: Path, pattern: str) -> list[Path]:
    if Path(pattern).is_absolute():
        return sorted(Path(p).resolve() for p in glob.glob(pattern, recursive=True))
    return sorted(
        (repo_root / p).resolve()
        for p in glob.glob(pattern, root_dir=repo_root.as_posix(), recursive=True)
    )


def _display_path(path: Path, repo_root: Path) -> str:
    try:
        return path.relative_to(repo_root).as_posix()
    except ValueError:
        return path.as_posix()


def _extract_attack_vectors(path: Path) -> set[int]:
    content = path.read_text(encoding="utf-8")
    return {int(x) for x in VECTOR_PATTERN.findall(content)}


def _extract_semgrep_core_vectors(path: Path) -> set[int]:
    content = path.read_text(encoding="utf-8")
    found: set[int] = set()
    for raw_list in VECTOR_LIST_PATTERN.findall(content):
        for raw_int in INT_PATTERN.findall(raw_list):
            found.add(int(raw_int))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate Semgrep rule metadata covers required core attack vectors."
    )
    parser.add_argument(
        "--vectors-glob",
        default="skills/cairo-auditor/references/attack-vectors/attack-vectors-*.md",
        help="Glob for attack-vector markdown files.",
    )
    parser.add_argument(
        "--rules-glob",
        default="skills/cairo-auditor/references/semgrep/rules/*.yaml",
        help="Glob for Semgrep rule packs.",
    )
    parser.add_argument(
        "--core-min",
        type=int,
        default=1,
        help="Inclusive lower bound for required core vectors.",
    )
    parser.add_argument(
        "--core-max",
        type=int,
        default=120,
        help="Inclusive upper bound for required core vectors.",
    )
    parser.add_argument(
        "--allow-out-of-range",
        action="store_true",
        help=(
            "Allow Semgrep metadata to reference vectors outside [core-min, core-max] "
            "without failing the check."
        ),
    )
    args = parser.parse_args()

    vector_paths = _glob_paths(REPO_ROOT, args.vectors_glob)
    if not vector_paths:
        raise SystemExit(f"no vector files matched: {args.vectors_glob}")

    rule_paths = _glob_paths(REPO_ROOT, args.rules_glob)
    if not rule_paths:
        raise SystemExit(f"no semgrep rule files matched: {args.rules_glob}")

    available_vectors: set[int] = set()
    for path in vector_paths:
        available_vectors.update(_extract_attack_vectors(path))

    required_vectors = {
        vector_id
        for vector_id in available_vectors
        if args.core_min <= vector_id <= args.core_max
    }

    semgrep_vectors: set[int] = set()
    by_rule_file: dict[str, list[int]] = {}
    for path in rule_paths:
        present = sorted(_extract_semgrep_core_vectors(path))
        by_rule_file[_display_path(path, REPO_ROOT)] = present
        semgrep_vectors.update(present)

    missing = sorted(required_vectors - semgrep_vectors)
    out_of_range = sorted(
        vector_id
        for vector_id in semgrep_vectors
        if vector_id < args.core_min or vector_id > args.core_max
    )

    summary = {
        "vector_files": [_display_path(p, REPO_ROOT) for p in vector_paths],
        "rules_files": [_display_path(p, REPO_ROOT) for p in rule_paths],
        "core_min": args.core_min,
        "core_max": args.core_max,
        "allow_out_of_range": args.allow_out_of_range,
        "required_count": len(required_vectors),
        "covered_count": len(required_vectors & semgrep_vectors),
        "missing": missing,
        "out_of_range_refs": out_of_range,
        "covered_core_vectors": sorted(required_vectors & semgrep_vectors),
        "by_rule_file": by_rule_file,
    }
    print(json.dumps(summary, ensure_ascii=True))

    if missing:
        return 1
    if out_of_range and not args.allow_out_of_range:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
