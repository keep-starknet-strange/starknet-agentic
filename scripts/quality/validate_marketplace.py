#!/usr/bin/env python3
"""Validate Claude plugin marketplace metadata consistency."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ROOT_RESOLVED = ROOT.resolve()
PLUGIN_PATH = ROOT / ".claude-plugin" / "plugin.json"
MARKETPLACE_PATH = ROOT / ".claude-plugin" / "marketplace.json"


def load_json(path: Path) -> dict:
    try:
        with path.open("r", encoding="utf-8") as f:
            obj = json.load(f)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path} contains invalid JSON: {exc}") from exc
    if not isinstance(obj, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return obj


def _resolve_repo_file(
    path: Path,
    root_resolved: Path,
    *,
    label: str,
    errors: list[str],
) -> Path | None:
    try:
        resolved = path.resolve()
    except OSError as exc:
        errors.append(f"{label} cannot resolve path '{path}': {exc}")
        return None
    try:
        resolved.relative_to(root_resolved)
    except ValueError:
        errors.append(f"{label} resolves outside repository root: {path}")
        return None
    return resolved


def validate_skill_paths(
    *,
    skills: object,
    plugin_root: Path,
    root_resolved: Path,
    errors: list[str],
    label: str,
) -> None:
    if not isinstance(skills, list) or not skills:
        errors.append(f"{label} missing non-empty 'skills' array")
        return

    for idx, entry in enumerate(skills):
        if not isinstance(entry, str) or not entry:
            errors.append(f"{label} skills[{idx}] must be a non-empty string path")
            continue

        entry_path = Path(entry)
        if entry_path.is_absolute() or ".." in entry_path.parts:
            errors.append(f"{label} skills[{idx}] path must stay within repository: {entry}")
            continue

        skill_path = (plugin_root / entry_path).resolve()
        try:
            skill_path.relative_to(root_resolved)
        except ValueError:
            errors.append(f"{label} skills[{idx}] resolves outside repository root: {entry}")
            continue

        if not skill_path.exists():
            errors.append(f"{label} skills[{idx}] path does not exist: {entry}")
            continue
        if not skill_path.is_dir():
            errors.append(f"{label} skills[{idx}] path is not a directory: {entry}")
            continue
        skill_doc = skill_path / "SKILL.md"
        if not skill_doc.exists():
            errors.append(f"{label} skills[{idx}] missing SKILL.md: {entry}")
            continue
        skill_doc_resolved = _resolve_repo_file(
            skill_doc,
            root_resolved,
            label=f"{label} skills[{idx}]",
            errors=errors,
        )
        if skill_doc_resolved is None:
            continue
        # Defensive check: a path may exist but still resolve to a non-regular file.
        if not skill_doc_resolved.is_file():
            errors.append(f"{label} skills[{idx}] SKILL.md is not a file: {entry}")


def main() -> int:
    errors: list[str] = []

    if not PLUGIN_PATH.exists():
        errors.append(f"missing {PLUGIN_PATH}")
    if not MARKETPLACE_PATH.exists():
        errors.append(f"missing {MARKETPLACE_PATH}")
    if errors:
        print("Marketplace validation failed:")
        for e in errors:
            print(f"- {e}")
        return 1

    try:
        plugin = load_json(PLUGIN_PATH)
    except (OSError, ValueError) as exc:
        errors.append(f"invalid {PLUGIN_PATH}: {exc}")
        plugin = {}
    try:
        marketplace = load_json(MARKETPLACE_PATH)
    except (OSError, ValueError) as exc:
        errors.append(f"invalid {MARKETPLACE_PATH}: {exc}")
        marketplace = {}

    if errors:
        print("Marketplace validation failed:")
        for e in errors:
            print(f"- {e}")
        return 1

    plugin_name = plugin.get("name")
    plugin_version = plugin.get("version")
    plugin_description = plugin.get("description")
    plugin_author = plugin.get("author")
    plugin_author_name = plugin_author.get("name") if isinstance(plugin_author, dict) else None
    plugin_skills = plugin.get("skills")

    if not isinstance(plugin_name, str) or not plugin_name:
        errors.append("plugin.json missing non-empty 'name'")
    if not isinstance(plugin_version, str) or not plugin_version:
        errors.append("plugin.json missing non-empty 'version'")

    market_name = marketplace.get("name")
    metadata = marketplace.get("metadata")
    if metadata is None:
        metadata = {}
    elif not isinstance(metadata, dict):
        errors.append("marketplace.json metadata must be a JSON object")
        metadata = {}
    market_version = metadata.get("version")
    market_description = metadata.get("description")
    plugins = marketplace.get("plugins")

    if not isinstance(market_name, str) or not market_name:
        errors.append("marketplace.json missing non-empty 'name'")
    if not isinstance(market_version, str) or not market_version:
        errors.append("marketplace.json metadata.version missing/non-string")
    if not isinstance(plugins, list) or not plugins:
        errors.append("marketplace.json plugins must be a non-empty array")

    validate_skill_paths(
        skills=plugin_skills,
        plugin_root=ROOT,
        root_resolved=ROOT_RESOLVED,
        errors=errors,
        label="plugin.json",
    )

    matched = None
    if isinstance(plugins, list) and isinstance(plugin_name, str) and plugin_name:
        for entry in plugins:
            if isinstance(entry, dict) and entry.get("name") == plugin_name:
                matched = entry
                break

    if matched is None and isinstance(plugin_name, str) and plugin_name:
        errors.append(f"marketplace.json does not contain plugin entry for '{plugin_name}'")
    else:
        if matched.get("source") != "./":
            errors.append("marketplace plugin source for root plugin must be './'")
        if matched.get("version") != plugin_version:
            errors.append(
                f"version mismatch: plugin.json={plugin_version} vs marketplace.plugins[{plugin_name}].version={matched.get('version')}"
            )
        matched_description = matched.get("description")
        if isinstance(plugin_description, str) and plugin_description:
            if not isinstance(matched_description, str) or not matched_description:
                errors.append("marketplace.plugins[].description missing/non-string")
            elif matched_description != plugin_description:
                errors.append(
                    "description mismatch: plugin.json.description vs marketplace.plugins[].description"
                )
        matched_author = matched.get("author")
        matched_author_name = matched_author.get("name") if isinstance(matched_author, dict) else None
        if isinstance(plugin_author_name, str) and plugin_author_name:
            if not isinstance(matched_author_name, str) or not matched_author_name:
                errors.append("marketplace.plugins[].author.name missing/non-string")
            elif matched_author_name != plugin_author_name:
                errors.append(
                    "author.name mismatch: plugin.json.author.name vs marketplace.plugins[].author.name"
                )

    if isinstance(plugins, list):
        for idx, entry in enumerate(plugins):
            if not isinstance(entry, dict):
                errors.append(f"marketplace.json plugins[{idx}] must be an object")
                continue

            entry_name = entry.get("name")
            entry_source = entry.get("source")
            entry_version = entry.get("version")
            if not isinstance(entry_name, str) or not entry_name:
                errors.append(f"marketplace.json plugins[{idx}] missing non-empty 'name'")
                continue
            if not isinstance(entry_source, str) or not entry_source:
                errors.append(f"marketplace.json plugins[{idx}] missing non-empty 'source'")
                continue
            if not isinstance(entry_version, str) or not entry_version:
                errors.append(f"marketplace.json plugins[{idx}] missing non-empty 'version'")
                continue

            source_path = Path(entry_source)
            if source_path.is_absolute() or ".." in source_path.parts:
                errors.append(
                    f"marketplace.json plugins[{idx}] source must stay within repository: {entry_source}"
                )
                continue

            plugin_dir = (ROOT / source_path).resolve()
            try:
                plugin_dir.relative_to(ROOT_RESOLVED)
            except ValueError:
                errors.append(
                    f"marketplace.json plugins[{idx}] source resolves outside repository: {entry_source}"
                )
                continue

            if entry_source == "./":
                continue

            manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
            if not manifest_path.exists():
                errors.append(f"{manifest_path} missing for marketplace plugin '{entry_name}'")
                continue
            manifest_resolved = _resolve_repo_file(
                manifest_path,
                ROOT_RESOLVED,
                label=f"marketplace.json plugins[{idx}]",
                errors=errors,
            )
            if manifest_resolved is None:
                continue
            if not manifest_resolved.is_file():
                errors.append(
                    f"marketplace.json plugins[{idx}] manifest is not a file: {manifest_path}"
                )
                continue

            try:
                plugin_manifest = load_json(manifest_resolved)
            except (OSError, ValueError) as exc:
                errors.append(f"invalid {manifest_resolved}: {exc}")
                continue

            manifest_name = plugin_manifest.get("name")
            manifest_version = plugin_manifest.get("version")
            manifest_description = plugin_manifest.get("description")
            manifest_author = plugin_manifest.get("author")
            manifest_author_name = (
                manifest_author.get("name") if isinstance(manifest_author, dict) else None
            )
            entry_description = entry.get("description")
            entry_author = entry.get("author")
            entry_author_name = (
                entry_author.get("name") if isinstance(entry_author, dict) else None
            )
            if manifest_name != entry_name:
                errors.append(
                    f"name mismatch for source {entry_source}: marketplace='{entry_name}' vs plugin.json='{manifest_name}'"
                )
            if manifest_version != entry_version:
                errors.append(
                    f"version mismatch for source {entry_source}: marketplace='{entry_version}' vs plugin.json='{manifest_version}'"
                )
            if not isinstance(entry_description, str) or not entry_description:
                errors.append(
                    f"marketplace.json plugins[{idx}] missing non-empty 'description'"
                )
            elif manifest_description != entry_description:
                errors.append(
                    f"description mismatch for source {entry_source}: marketplace='{entry_description}' vs plugin.json='{manifest_description}'"
                )
            if not isinstance(entry_author_name, str) or not entry_author_name:
                errors.append(
                    f"marketplace.json plugins[{idx}].author.name missing/non-string"
                )
            elif manifest_author_name != entry_author_name:
                errors.append(
                    f"author.name mismatch for source {entry_source}: marketplace='{entry_author_name}' vs plugin.json='{manifest_author_name}'"
                )

            version_file = plugin_dir / "VERSION"
            if not version_file.exists():
                errors.append(f"{version_file} missing for marketplace plugin '{entry_name}'")
            else:
                version_resolved = _resolve_repo_file(
                    version_file,
                    ROOT_RESOLVED,
                    label=f"marketplace.json plugins[{idx}]",
                    errors=errors,
                )
                if version_resolved is None:
                    continue
                if not version_resolved.is_file():
                    errors.append(
                        f"marketplace.json plugins[{idx}] VERSION is not a file: {version_file}"
                    )
                    continue
                try:
                    module_version = version_resolved.read_text(encoding="utf-8").strip()
                except OSError as exc:
                    errors.append(f"cannot read {version_resolved}: {exc}")
                    module_version = ""
                if not module_version:
                    errors.append(f"{version_resolved} must contain a non-empty version")
                elif manifest_version != module_version:
                    errors.append(
                        f"version mismatch for source {entry_source}: plugin.json='{manifest_version}' vs VERSION='{module_version}'"
                    )

            validate_skill_paths(
                skills=plugin_manifest.get("skills"),
                plugin_root=plugin_dir,
                root_resolved=ROOT_RESOLVED,
                errors=errors,
                label=f"{manifest_path}",
            )

    if plugin_version and market_version and plugin_version != market_version:
        errors.append(
            f"version mismatch: plugin.json={plugin_version} vs marketplace.metadata.version={market_version}"
        )

    if market_name and plugin_name and market_name != plugin_name:
        errors.append(f"name mismatch: marketplace.name={market_name} vs plugin.name={plugin_name}")
    if isinstance(plugin_description, str) and plugin_description:
        if not isinstance(market_description, str) or not market_description:
            errors.append("marketplace.metadata.description missing/non-string")
        elif market_description != plugin_description:
            errors.append(
                "description mismatch: marketplace.metadata.description vs plugin.json.description"
            )

    if errors:
        print("Marketplace validation failed:")
        for e in errors:
            print(f"- {e}")
        return 1

    print(
        f"OK: marketplace metadata is consistent for plugin '{plugin_name}' at version {plugin_version}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
