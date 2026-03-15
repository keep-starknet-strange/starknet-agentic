#!/usr/bin/env python3
"""Validate Codex-facing skill distribution surface for public consumers."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
CAIRO_SKILLS = [
    "cairo-contract-authoring",
    "cairo-testing",
    "cairo-auditor",
    "cairo-optimization",
    "cairo-deploy",
]
INSTALL_MARKERS = {
    Path("README.md"): [
        "$skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor",
        "/plugin marketplace add keep-starknet-strange/starknet-agentic",
        "npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor",
    ],
    Path("skills/README.md"): [
        "$skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor",
        "/plugin install starknet-agentic-skills@starknet-agentic-skills",
        "npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor",
        "<ref>",
    ],
    Path("skills/cairo-auditor/README.md"): [
        "$skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor",
        "/plugin install starknet-agentic-skills@starknet-agentic-skills",
        "npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor",
        "`<ref>` can be a commit SHA or release tag.",
    ],
}


def repo_skill_slugs(root: Path = ROOT) -> set[str]:
    return {path.parent.name for path in (root / "skills").glob("*/SKILL.md")}


def codex_symlink_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    agents_dir = root / ".agents" / "skills"
    if not agents_dir.is_dir():
        return [f"missing Codex discovery directory: {agents_dir}"]

    skill_slugs = repo_skill_slugs(root)
    for slug in sorted(skill_slugs):
        link = agents_dir / slug
        expected = (root / "skills" / slug).resolve()
        if not link.exists() and not link.is_symlink():
            errors.append(f"missing Codex symlink: {link}")
            continue
        if not link.is_symlink():
            errors.append(f"Codex entry is not a symlink: {link}")
            continue
        resolved = link.resolve()
        if resolved != expected:
            errors.append(f"Codex symlink points to {resolved}, expected {expected}")

    extra = sorted(p.name for p in agents_dir.iterdir() if p.name not in skill_slugs)
    if extra:
        errors.append(f"unexpected Codex entries without matching skills/*/SKILL.md: {', '.join(extra)}")

    return errors


def _load_yaml(path: Path) -> dict[str, Any] | None:
    try:
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError:
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def metadata_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    required_interface_keys = ["display_name", "short_description", "default_prompt"]

    for slug in CAIRO_SKILLS:
        path = root / "skills" / slug / "agents" / "openai.yaml"
        if not path.exists():
            errors.append(f"missing Codex metadata: {path}")
            continue

        parsed = _load_yaml(path)
        if parsed is None:
            errors.append(f"invalid YAML mapping: {path}")
            continue

        interface = parsed.get("interface")
        if not isinstance(interface, dict):
            errors.append(f"missing interface block: {path}")
            continue

        for key in required_interface_keys:
            value = interface.get(key)
            if not isinstance(value, str) or not value.strip():
                errors.append(f"missing or invalid interface.{key} in {path}")

        policy = parsed.get("policy")
        if not isinstance(policy, dict):
            errors.append(f"missing policy block: {path}")
            continue
        if not isinstance(policy.get("allow_implicit_invocation"), bool):
            errors.append(f"missing or invalid policy.allow_implicit_invocation in {path}")

    return errors


def install_doc_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for relpath, markers in INSTALL_MARKERS.items():
        path = root / relpath
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"unable to read {path}: {exc}")
            continue

        missing = [marker for marker in markers if marker not in content]
        if missing:
            errors.append(f"{path}: missing install markers: {', '.join(missing)}")

    return errors


def main() -> int:
    errors = [
        *codex_symlink_errors(),
        *metadata_errors(),
        *install_doc_errors(),
    ]

    if errors:
        for err in errors:
            print(f"ERROR: {err}")
        return 1

    print("OK: Codex distribution surface validated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
