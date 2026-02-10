#!/usr/bin/env python3
"""
skills_manifest.py

Generates and validates a machine-readable manifest of all skills in this repo.

Why:
- OpenClaw/MoltBook (and other agent platforms) need a stable list of skills to
  index and install.
- Humans can read skills/README.md; machines should read skills/manifest.json.

This script is intentionally dependency-free (stdlib only) so it can run in CI.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


REPO = "keep-starknet-strange/starknet-agentic"
DEFAULT_BRANCH = "main"
SKILLS_DIR = Path("skills")
MANIFEST_PATH = SKILLS_DIR / "manifest.json"


def _read_frontmatter(skill_md: Path) -> dict[str, str]:
    content = skill_md.read_text(encoding="utf-8")
    if not content.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")

    match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not match:
        raise ValueError("invalid YAML frontmatter block")

    fm = match.group(1)

    def _get_required(key: str) -> str:
        m = re.search(rf"^{re.escape(key)}:\s*(.+)\s*$", fm, re.MULTILINE)
        if not m:
            raise ValueError(f"missing '{key}' in frontmatter")
        return m.group(1).strip().strip('"').strip("'")

    return {
        "name": _get_required("name"),
        "description": _get_required("description"),
    }


def _skill_dirs() -> list[Path]:
    if not SKILLS_DIR.is_dir():
        raise RuntimeError("skills/ directory not found")
    dirs: list[Path] = []
    for p in sorted(SKILLS_DIR.iterdir(), key=lambda x: x.name):
        if not p.is_dir():
            continue
        # Convention: one skill per directory containing SKILL.md
        if (p / "SKILL.md").is_file():
            dirs.append(p)
    return dirs


def generate_manifest() -> dict:
    skills: list[dict] = []
    for d in _skill_dirs():
        skill_md = d / "SKILL.md"
        fm = _read_frontmatter(skill_md)
        name = fm["name"]
        if name != d.name:
            raise ValueError(f"skill name '{name}' does not match directory '{d.name}'")

        skills.append(
            {
                "name": name,
                "description": fm["description"],
                "skill_md_path": str(skill_md.as_posix()),
                "repo_path": f"skills/{name}",
                "raw_skill_md_url": (
                    f"https://raw.githubusercontent.com/{REPO}/{DEFAULT_BRANCH}/skills/{name}/SKILL.md"
                ),
                "install": f"npx skills add {REPO}/skills/{name}",
            }
        )

    return {
        "version": 1,
        "repo": REPO,
        "default_branch": DEFAULT_BRANCH,
        "skills": skills,
    }


def _json_dumps(obj: dict) -> str:
    # Stable output for CI diffs.
    return json.dumps(obj, indent=2, sort_keys=True) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true", help="Write skills/manifest.json")
    ap.add_argument("--check", action="store_true", help="Fail if skills/manifest.json is out of date")
    args = ap.parse_args()

    if not args.write and not args.check:
        ap.error("must pass --write or --check")

    manifest = generate_manifest()
    rendered = _json_dumps(manifest)

    if args.write:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(rendered, encoding="utf-8")
        print(f"Wrote {MANIFEST_PATH}")
        return 0

    # --check
    if not MANIFEST_PATH.is_file():
        print(f"ERROR: missing {MANIFEST_PATH}. Run: python3 scripts/skills_manifest.py --write")
        return 1
    existing = MANIFEST_PATH.read_text(encoding="utf-8")
    if existing != rendered:
        print(f"ERROR: {MANIFEST_PATH} is out of date. Run: python3 scripts/skills_manifest.py --write")
        return 1
    print(f"{MANIFEST_PATH} is up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

