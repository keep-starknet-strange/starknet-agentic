#!/usr/bin/env python3
"""Regression tests for validate_skills.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest import mock

MODULE_PATH = Path(__file__).with_name("validate_skills.py")
SPEC = importlib.util.spec_from_file_location("validate_skills", MODULE_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import bootstrap failure
    raise RuntimeError(f"Unable to load validator module from {MODULE_PATH}")
VALIDATE_SKILLS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATE_SKILLS)


class ValidateSkillsTests(unittest.TestCase):
    def test_parent_traversal_is_not_counted_as_deeper_nesting(self) -> None:
        self.assertEqual(VALIDATE_SKILLS._path_depth("../../README.md"), 0)
        self.assertEqual(VALIDATE_SKILLS._path_depth("../../docs/guide.md"), 1)

    def test_root_router_allows_skill_module_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            target = root / "skills" / "cairo-auditor"
            target.mkdir(parents=True)
            (target / "SKILL.md").write_text(
                "---\nname: cairo-auditor\ndescription: Security review router.\n---\n\n"
                "## When to Use\n- Audit Cairo code.\n\n"
                "## When NOT to Use\n- Deployment tasks.\n\n"
                "## Rationalizations to Reject\n- Tests passed.\n",
                encoding="utf-8",
            )
            router = root / "SKILL.md"
            router.write_text(
                "---\nname: starknet-agentic-skills\ndescription: Routes skill selection.\n---\n\n"
                "[cairo-auditor](skills/cairo-auditor/SKILL.md)\n",
                encoding="utf-8",
            )

            with mock.patch.object(VALIDATE_SKILLS, "ROOT", root):
                errors = VALIDATE_SKILLS.check_skill(router)

            self.assertEqual(errors, [], f"Expected no validation errors, got: {errors}")

    def test_root_router_rejects_dot_segments(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            target = root / "skills" / "cairo-auditor"
            target.mkdir(parents=True)
            (target / "SKILL.md").write_text(
                "---\nname: cairo-auditor\ndescription: Security review router.\n---\n\n"
                "## When to Use\n- Audit Cairo code.\n\n"
                "## When NOT to Use\n- Deployment tasks.\n\n"
                "## Rationalizations to Reject\n- Tests passed.\n",
                encoding="utf-8",
            )
            router = root / "SKILL.md"
            router.write_text(
                "---\nname: starknet-agentic-skills\ndescription: Routes skill selection.\n---\n\n"
                "[cairo-auditor](skills/./cairo-auditor/SKILL.md)\n",
                encoding="utf-8",
            )

            with mock.patch.object(VALIDATE_SKILLS, "ROOT", root):
                errors = VALIDATE_SKILLS.check_skill(router)

            self.assertTrue(
                any("deeper than one level" in error for error in errors),
                f"Expected an error mentioning 'deeper than one level', got: {errors}",
            )

    def test_nested_skill_links_still_reject_deeper_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            target = root / "skills" / "sample-skill" / "references" / "nested"
            target.mkdir(parents=True)
            (target / "doc.md").write_text("# nested\n", encoding="utf-8")
            skill_dir = root / "skills" / "sample-skill"
            skill = skill_dir / "SKILL.md"
            skill.write_text(
                "---\nname: sample-skill\ndescription: Sample skill reference.\n---\n\n"
                "## When to Use\n- Use for sample work.\n\n"
                "## When NOT to Use\n- Avoid for unrelated work.\n\n"
                "[nested](references/nested/doc.md)\n",
                encoding="utf-8",
            )

            with mock.patch.object(VALIDATE_SKILLS, "ROOT", root):
                errors = VALIDATE_SKILLS.check_skill(skill)

            self.assertTrue(
                any("deeper than one level" in error for error in errors),
                f"Expected an error mentioning 'deeper than one level', got: {errors}",
            )


if __name__ == "__main__":
    unittest.main()
