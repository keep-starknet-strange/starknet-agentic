#!/usr/bin/env python3
"""Regression tests for check_codex_distribution.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

MODULE_PATH = Path(__file__).with_name("check_codex_distribution.py")
SPEC = importlib.util.spec_from_file_location("check_codex_distribution", MODULE_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover
    raise RuntimeError(f"Unable to load module from {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_minimal_repo(root: Path) -> None:
    # Minimal repo layout with one Cairo skill.
    write_file(root / "skills" / "cairo-auditor" / "SKILL.md", "---\nname: cairo-auditor\n---\n")
    write_file(root / "README.md", "\n".join(MODULE.INSTALL_MARKERS[Path("README.md")]))
    write_file(root / "skills" / "README.md", "\n".join(MODULE.INSTALL_MARKERS[Path("skills/README.md")]))
    write_file(
        root / "skills" / "cairo-auditor" / "README.md",
        "\n".join(MODULE.INSTALL_MARKERS[Path("skills/cairo-auditor/README.md")]),
    )

    agents_dir = root / ".agents" / "skills"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "cairo-auditor").symlink_to(Path("../../skills/cairo-auditor"))


class CodexDistributionTests(unittest.TestCase):
    def test_codex_symlink_errors_passes_for_valid_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            build_minimal_repo(root)

            errors = MODULE.codex_symlink_errors(root)

            assert errors == []

    def test_codex_symlink_errors_reports_missing_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_file(root / "skills" / "cairo-auditor" / "SKILL.md", "---\nname: cairo-auditor\n---\n")
            (root / ".agents" / "skills").mkdir(parents=True, exist_ok=True)

            errors = MODULE.codex_symlink_errors(root)

            assert any("missing Codex symlink" in error for error in errors), errors

    def test_codex_symlink_errors_reports_non_symlink_entry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_file(root / "skills" / "cairo-auditor" / "SKILL.md", "---\nname: cairo-auditor\n---\n")
            write_file(root / ".agents" / "skills" / "cairo-auditor", "not-a-link")

            errors = MODULE.codex_symlink_errors(root)

            assert any("not a symlink" in error for error in errors), errors

    def test_metadata_errors_reports_missing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            errors = MODULE.metadata_errors(root)

            assert any("missing Codex metadata" in error for error in errors), errors

    def test_metadata_errors_reports_invalid_policy_type(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for slug in MODULE.CAIRO_SKILLS:
                write_file(
                    root / "skills" / slug / "agents" / "openai.yaml",
                    """
interface:
  display_name: Test
  short_description: Test
  default_prompt: Test
policy:
  allow_implicit_invocation: "false"
""".strip()
                    + "\n",
                )

            errors = MODULE.metadata_errors(root)

            assert any("policy.allow_implicit_invocation" in error for error in errors), errors

    def test_install_doc_errors_reports_missing_markers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            write_file(root / "README.md", "placeholder")
            write_file(root / "skills" / "README.md", "placeholder")
            write_file(root / "skills" / "cairo-auditor" / "README.md", "placeholder")

            errors = MODULE.install_doc_errors(root)

            assert len(errors) == 3
            assert all("missing install markers" in error for error in errors), errors


if __name__ == "__main__":
    unittest.main()
