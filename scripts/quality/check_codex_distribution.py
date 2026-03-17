#!/usr/bin/env python3
"""Validate Codex-facing skill distribution surface for public consumers."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPO_SLUG = "keep-starknet-strange/starknet-agentic"
DEFAULT_PUBLIC_REF = "main"
DEFAULT_PINNED_REF = "v0.1.0-beta.1"
PUBLIC_SKILLS = [
    "account-abstraction",
    "cairo-auditor",
    "cairo-contract-authoring",
    "cairo-deploy",
    "cairo-optimization",
    "cairo-testing",
    "controller-cli",
    "huginn-onboard",
    "starknet-anonymous-wallet",
    "starknet-defi",
    "starknet-identity",
    "starknet-js",
    "starknet-mini-pay",
    "starknet-network-facts",
    "starknet-tongo",
    "starknet-wallet",
    "starkzap-sdk",
]


def _latest_release_ref(root: Path = ROOT) -> str:
    changelog = root / "CHANGELOG.md"
    try:
        lines = changelog.read_text(encoding="utf-8").splitlines()
    except OSError:
        return DEFAULT_PINNED_REF

    release_heading = re.compile(r"^## \[([^\]]+)\]\s+-\s+\d{4}-\d{2}-\d{2}$")
    for raw_line in lines:
        line = raw_line.strip()
        match = release_heading.match(line)
        if not match:
            continue
        version = match.group(1).strip()
        if version.lower() == "unreleased":
            continue
        return version if version.startswith("v") else f"v{version}"
    return DEFAULT_PINNED_REF


def _resolved_repo_slug() -> str:
    return (os.getenv("PUBLIC_REPO_SLUG", DEFAULT_REPO_SLUG) or DEFAULT_REPO_SLUG).strip("/")


def _resolved_public_ref() -> str:
    return (os.getenv("PUBLIC_SKILL_REF", DEFAULT_PUBLIC_REF) or DEFAULT_PUBLIC_REF).strip()


def _resolved_pinned_ref(root: Path = ROOT) -> str:
    explicit = (os.getenv("PUBLIC_PINNED_REF") or "").strip()
    if explicit:
        return explicit
    return _latest_release_ref(root)


def _auditor_skill_url(repo_slug: str, ref: str) -> str:
    return f"https://github.com/{repo_slug}/tree/{ref}/skills/cairo-auditor"


def build_install_markers(
    root: Path = ROOT,
    *,
    repo_slug: str | None = None,
    public_ref: str | None = None,
    pinned_ref: str | None = None,
) -> dict[Path, list[str]]:
    resolved_repo_slug = repo_slug or _resolved_repo_slug()
    resolved_public_ref = public_ref or _resolved_public_ref()
    resolved_pinned_ref = pinned_ref or _resolved_pinned_ref(root)

    return {
        Path("README.md"): [
            f"skill-installer install {_auditor_skill_url(resolved_repo_slug, resolved_public_ref)}",
            f"skill-installer install {_auditor_skill_url(resolved_repo_slug, resolved_pinned_ref)}",
            "/plugin marketplace add keep-starknet-strange/starknet-agentic",
            "/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local",
            "npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor",
        ],
        Path("skills/README.md"): [
            f"skill-installer install {_auditor_skill_url(resolved_repo_slug, resolved_public_ref)}",
            f"skill-installer install {_auditor_skill_url(resolved_repo_slug, resolved_pinned_ref)}",
            "/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local",
            "npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor",
            "./QUICKSTART_2MIN.md",
            "./TROUBLESHOOTING.md",
        ],
        Path("skills/cairo-auditor/README.md"): [
            f"skill-installer install {_auditor_skill_url(resolved_repo_slug, resolved_public_ref)}",
            f"skill-installer install {_auditor_skill_url(resolved_repo_slug, resolved_pinned_ref)}",
            "/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local",
            "npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor",
            "../QUICKSTART_2MIN.md",
            "../TROUBLESHOOTING.md",
        ],
    }


FORBIDDEN_INSTALL_MARKERS = [
    "tree/<ref>/skills/cairo-auditor",
    "`<ref>` can be a commit SHA or release tag.",
]


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
        try:
            resolved = link.resolve()
        except (OSError, RuntimeError) as exc:
            errors.append(f"unable to resolve Codex symlink: {link}: {exc}")
            continue
        if resolved != expected:
            errors.append(f"Codex symlink points to {resolved}, expected {expected}")

    extra = sorted(
        p.name
        for p in agents_dir.iterdir()
        if p.name not in skill_slugs and p.name != "README.md" and not p.name.startswith(".")
    )
    if extra:
        errors.append(f"unexpected Codex entries without matching skills/*/SKILL.md: {', '.join(extra)}")

    return errors


def _load_yaml(path: Path) -> dict[str, Any] | None:
    try:
        parsed = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError):
        return None
    if not isinstance(parsed, dict):
        return None
    return parsed


def metadata_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    required_interface_keys = ["display_name", "short_description", "default_prompt"]
    public_skills_set = set(PUBLIC_SKILLS)
    discovered_skills = repo_skill_slugs(root)

    missing_from_constant = sorted(discovered_skills - public_skills_set)
    if missing_from_constant:
        errors.append(
            "PUBLIC_SKILLS is missing discovered skills: " + ", ".join(missing_from_constant)
        )
    missing_from_repo = sorted(public_skills_set - discovered_skills)
    if missing_from_repo:
        errors.append("PUBLIC_SKILLS has entries with no skills/*/SKILL.md: " + ", ".join(missing_from_repo))

    for slug in PUBLIC_SKILLS:
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


def install_doc_errors(root: Path = ROOT, install_markers: dict[Path, list[str]] | None = None) -> list[str]:
    errors: list[str] = []
    markers_to_validate = install_markers if install_markers is not None else build_install_markers(root)
    for relpath, markers in markers_to_validate.items():
        path = root / relpath
        try:
            content = path.read_text(encoding="utf-8")
        except OSError as exc:
            errors.append(f"unable to read {path}: {exc}")
            continue

        missing = [marker for marker in markers if marker not in content]
        if missing:
            errors.append(f"{path}: missing install markers: {', '.join(missing)}")
        forbidden = [marker for marker in FORBIDDEN_INSTALL_MARKERS if marker in content]
        if forbidden:
            errors.append(f"{path}: contains placeholder install markers: {', '.join(forbidden)}")

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
