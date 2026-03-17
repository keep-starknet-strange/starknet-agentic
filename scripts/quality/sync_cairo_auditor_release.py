#!/usr/bin/env python3
"""Sync cairo-auditor and plugin marketplace release versions in one command."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKILL_VERSION_FILE = ROOT / "skills" / "cairo-auditor" / "VERSION"
SKILL_DOC = ROOT / "skills" / "cairo-auditor" / "SKILL.md"
PLUGIN_JSON = ROOT / ".claude-plugin" / "plugin.json"
MARKETPLACE_JSON = ROOT / ".claude-plugin" / "marketplace.json"

VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")
SKILL_METADATA_VERSION_PATTERN = re.compile(r'("version"\s*:\s*")([^"]+)(")')


class SyncError(RuntimeError):
    pass


def _validate_version(raw: str, label: str) -> str:
    value = raw.strip()
    if not value:
        raise SyncError(f"{label} must be non-empty")
    if not VERSION_PATTERN.match(value):
        raise SyncError(
            f"{label} must match semantic version style 'X.Y.Z' (optionally with suffix), got '{value}'"
        )
    return value


def _load_json(path: Path) -> dict:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise SyncError(f"unable to read {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise SyncError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SyncError(f"expected JSON object in {path}")
    return payload


def _dump_json(path: Path, payload: dict, *, dry_run: bool) -> None:
    content = json.dumps(payload, indent=2, ensure_ascii=True) + "\n"
    if dry_run:
        return
    path.write_text(content, encoding="utf-8")


def _update_skill_doc(version: str, *, dry_run: bool) -> bool:
    try:
        content = SKILL_DOC.read_text(encoding="utf-8")
    except OSError as exc:
        raise SyncError(f"unable to read {SKILL_DOC}: {exc}") from exc

    match = SKILL_METADATA_VERSION_PATTERN.search(content)
    if match is None:
        raise SyncError("could not find metadata version in SKILL.md frontmatter")

    current = match.group(2)
    if current == version:
        return False

    updated = SKILL_METADATA_VERSION_PATTERN.sub(
        lambda m: f'{m.group(1)}{version}{m.group(3)}',
        content,
        count=1,
    )
    if not dry_run:
        SKILL_DOC.write_text(updated, encoding="utf-8")
    return True


def _update_plugin_json(version: str, *, dry_run: bool) -> bool:
    plugin = _load_json(PLUGIN_JSON)
    changed = False

    if plugin.get("version") != version:
        plugin["version"] = version
        changed = True

    _dump_json(PLUGIN_JSON, plugin, dry_run=dry_run)
    return changed


def _update_marketplace_json(version: str, *, dry_run: bool) -> bool:
    market = _load_json(MARKETPLACE_JSON)
    changed = False

    metadata = market.get("metadata")
    if not isinstance(metadata, dict):
        raise SyncError("marketplace.json metadata must be an object")

    if metadata.get("version") != version:
        metadata["version"] = version
        changed = True

    plugins = market.get("plugins")
    if not isinstance(plugins, list) or not plugins:
        raise SyncError("marketplace.json plugins must be a non-empty array")

    for entry in plugins:
        if not isinstance(entry, dict):
            continue
        source = entry.get("source")
        if source == "./" and entry.get("version") != version:
            entry["version"] = version
            changed = True

    _dump_json(MARKETPLACE_JSON, market, dry_run=dry_run)
    return changed


def _write_skill_version_file(version: str, *, dry_run: bool) -> bool:
    current = ""
    try:
        current = SKILL_VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise SyncError(f"unable to read {SKILL_VERSION_FILE}: {exc}") from exc

    if current == version:
        return False

    if not dry_run:
        SKILL_VERSION_FILE.write_text(f"{version}\n", encoding="utf-8")
    return True


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync cairo-auditor skill + plugin marketplace versions in one pass",
    )
    parser.add_argument("--skill-version", required=True, help="Version for skills/cairo-auditor")
    parser.add_argument(
        "--plugin-version",
        required=True,
        help="Version for .claude-plugin/plugin.json and .claude-plugin/marketplace.json",
    )
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    try:
        skill_version = _validate_version(args.skill_version, "--skill-version")
        plugin_version = _validate_version(args.plugin_version, "--plugin-version")

        changed = {
            "skills/cairo-auditor/VERSION": _write_skill_version_file(skill_version, dry_run=args.dry_run),
            "skills/cairo-auditor/SKILL.md": _update_skill_doc(skill_version, dry_run=args.dry_run),
            ".claude-plugin/plugin.json": _update_plugin_json(plugin_version, dry_run=args.dry_run),
            ".claude-plugin/marketplace.json": _update_marketplace_json(plugin_version, dry_run=args.dry_run),
        }
    except SyncError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    mode = "DRY-RUN" if args.dry_run else "UPDATED"
    print(f"{mode}: skill={skill_version}, plugin={plugin_version}")
    for path, did_change in changed.items():
        print(f"- {path}: {'changed' if did_change else 'unchanged'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
