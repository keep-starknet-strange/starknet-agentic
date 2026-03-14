#!/usr/bin/env python3
"""Repository-level SKILL.md quality checks.

This validator enforces a minimal, deterministic subset of modern skill-authoring
standards for the starknet-agentic repository.
"""

from __future__ import annotations

import re
from pathlib import Path, PurePosixPath
from typing import Any

ROOT = Path(__file__).resolve().parents[2]

SKILL_NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
LINK_RE = re.compile(r"\[[^\]]+\]\(([^)]+\.md)\)")
DISALLOWED_DESCRIPTION_PREFIXES = ("use ", "use when ", "use for ", "use this ")

try:
    import yaml
except ImportError as exc:  # pragma: no cover - enforced in CI
    raise RuntimeError("PyYAML is required. Install with: pip install pyyaml") from exc


def parse_frontmatter(text: str, path: Path) -> tuple[dict[str, Any], int, list[str]] | None:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None

    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break

    if end is None:
        return None

    raw = "\n".join(lines[1:end])
    errors: list[str] = []

    try:
        parsed = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        errors.append(f"{path}: invalid YAML frontmatter: {exc}")
        return {}, end + 1, errors

    if parsed is None:
        parsed = {}

    if not isinstance(parsed, dict):
        errors.append(f"{path}: frontmatter must parse to a mapping/object")
        return {}, end + 1, errors

    return parsed, end + 1, errors


def _normalized_target(target: str) -> str:
    return target.split("#", 1)[0].split("?", 1)[0].strip()


def _posix_parts(target: str) -> tuple[str, ...]:
    return tuple(part for part in PurePosixPath(target.replace("\\", "/")).parts if part != "/")


def _path_depth(target: str) -> int:
    parts = [part for part in _posix_parts(target) if part not in (".", "..")]
    return max(len(parts) - 1, 0)


def _allow_root_router_link(current_skill: Path, target: str) -> bool:
    if current_skill.parent != ROOT:
        return False

    raw_segments = [segment for segment in target.replace("\\", "/").split("/") if segment]
    if target.startswith("/") or any(segment in (".", "..") for segment in raw_segments):
        return False

    parts = _posix_parts(target)
    if len(parts) != 3 or parts[0] != "skills" or parts[2] != "SKILL.md":
        return False

    resolved = (ROOT / parts[0] / parts[1] / parts[2]).resolve()
    return resolved.is_relative_to(ROOT.resolve())


def _resolve_link_path(current_skill: Path, target: str) -> Path:
    if target.startswith("/"):
        return (ROOT / target.lstrip("/")).resolve()
    return (current_skill.parent / target).resolve()


def check_skill(path: Path) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    if len(lines) > 500:
        errors.append(f"{path}: exceeds 500 lines ({len(lines)})")

    if "/Users/" in text or "C:\\Users\\" in text:
        errors.append(f"{path}: contains absolute local filesystem paths")

    parsed = parse_frontmatter(text, path)
    if parsed is None:
        errors.append(f"{path}: missing valid YAML frontmatter block")
        return errors

    frontmatter, body_start, frontmatter_errors = parsed
    errors.extend(frontmatter_errors)

    name_raw = frontmatter.get("name", "")
    description_raw = frontmatter.get("description", "")

    name = name_raw if isinstance(name_raw, str) else ""
    description = description_raw if isinstance(description_raw, str) else ""

    if not isinstance(name_raw, str) or not name.strip():
        errors.append(f"{path}: frontmatter missing 'name'")
    else:
        if len(name) > 64:
            errors.append(f"{path}: skill name too long (>64): {name}")
        if not SKILL_NAME_RE.match(name):
            errors.append(f"{path}: skill name is not kebab-case: {name}")

    if not isinstance(description_raw, str) or not description.strip():
        errors.append(f"{path}: frontmatter missing 'description'")
    else:
        lowered = description.strip().lower()
        if lowered.startswith(DISALLOWED_DESCRIPTION_PREFIXES):
            errors.append(
                f"{path}: description should be third-person trigger style, not imperative 'Use ...'"
            )

    body = "\n".join(lines[body_start:])

    # Enforce markdown reference validity on every SKILL.
    for m in LINK_RE.finditer(body):
        target = m.group(1)
        if target.startswith(("http://", "https://")):
            continue

        normalized = _normalized_target(target)
        if not normalized:
            continue

        depth = _path_depth(normalized)
        if depth > 1 and not _allow_root_router_link(path, normalized):
            errors.append(f"{path}: markdown link '{target}' is deeper than one level from SKILL.md")

        resolved = _resolve_link_path(path, normalized)
        if ROOT not in resolved.parents and resolved != ROOT:
            errors.append(f"{path}: markdown link '{target}' resolves outside repository root")
            continue

        if not resolved.exists():
            errors.append(f"{path}: markdown link target does not exist: {target}")

    # For non-root skills, enforce folder/name consistency and required sections.
    if path.parent != ROOT:
        if name and path.parent.name != name:
            errors.append(
                f"{path}: directory name '{path.parent.name}' must match frontmatter name '{name}'"
            )

        if "## When to Use" not in body:
            errors.append(f"{path}: missing '## When to Use' section")
        if "## When NOT to Use" not in body:
            errors.append(f"{path}: missing '## When NOT to Use' section")

        if "auditor" in path.as_posix() and "## Rationalizations to Reject" not in body:
            errors.append(f"{path}: security/audit skill missing '## Rationalizations to Reject'")

    return errors


def main() -> int:
    skill_files = sorted(
        p
        for p in ROOT.rglob("SKILL.md")
        if ".venv" not in p.as_posix() and "/tmp/" not in p.as_posix()
    )

    all_errors: list[str] = []
    for path in skill_files:
        all_errors.extend(check_skill(path))

    if all_errors:
        print("SKILL validation failed:")
        for e in all_errors:
            print(f"- {e}")
        return 1

    print(f"OK: validated {len(skill_files)} SKILL.md files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
