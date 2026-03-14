#!/usr/bin/env python3

from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path


VECTOR_PATTERN = re.compile(r"^\*\*(\d+)\.\s+", re.MULTILINE)
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


def _extract_vector_ids(path: Path) -> list[int]:
    content = path.read_text(encoding="utf-8")
    return [int(x) for x in VECTOR_PATTERN.findall(content)]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate attack-vector corpus size and ID uniqueness."
    )
    parser.add_argument(
        "--vectors-glob",
        default="skills/cairo-auditor/references/attack-vectors/attack-vectors-*.md",
        help="Glob for attack vector markdown files.",
    )
    parser.add_argument(
        "--min-vectors",
        type=int,
        default=120,
        help="Minimum total number of vectors required.",
    )
    args = parser.parse_args()

    vector_paths = _glob_paths(REPO_ROOT, args.vectors_glob)
    if not vector_paths:
        raise SystemExit(f"no vector files matched: {args.vectors_glob}")

    by_file: dict[str, int] = {}
    seen: dict[int, str] = {}
    duplicates: list[dict[str, object]] = []
    total = 0

    for path in vector_paths:
        ids = _extract_vector_ids(path)
        by_file[_display_path(path, REPO_ROOT)] = len(ids)
        total += len(ids)
        for vector_id in ids:
            if vector_id in seen:
                duplicates.append(
                    {
                        "vector_id": vector_id,
                        "first_file": seen[vector_id],
                        "duplicate_file": _display_path(path, REPO_ROOT),
                    }
                )
            else:
                seen[vector_id] = _display_path(path, REPO_ROOT)

    total_unique = len(seen)
    summary = {
        "vector_files": [_display_path(p, REPO_ROOT) for p in vector_paths],
        "by_file": by_file,
        "total_vectors": total_unique,
        "total_vectors_raw": total,
        "min_vectors": args.min_vectors,
        "duplicates": duplicates,
    }
    print(json.dumps(summary, ensure_ascii=True))

    if duplicates:
        return 1
    if total_unique < args.min_vectors:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
