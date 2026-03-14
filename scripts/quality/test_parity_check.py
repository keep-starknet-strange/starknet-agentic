#!/usr/bin/env python3
"""Regression tests for parity_check.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import textwrap
import unittest

MODULE_PATH = Path(__file__).with_name("parity_check.py")
SPEC = importlib.util.spec_from_file_location("parity_check", MODULE_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - import bootstrap failure
    raise RuntimeError(f"Unable to load parity module from {MODULE_PATH}")
PARITY_CHECK = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PARITY_CHECK
SPEC.loader.exec_module(PARITY_CHECK)


class ParityCheckTests(unittest.TestCase):
    def test_docs_category_page_slugs_extracts_only_target_category(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            docs_ts = Path(tmp) / "docs.ts"
            docs_ts.write_text(
                textwrap.dedent(
                    """
                    export const DOC_CATEGORIES = [
                      {
                        title: "Guides",
                        slug: "guides",
                        pages: [{ slug: "quick-start", title: "Quick Start" }],
                      },
                      {
                        title: "Skills",
                        slug: "skills",
                        pages: [
                          { slug: "overview", title: "Overview" },
                          { slug: "cairo-contract-authoring", title: "Cairo Contract Authoring" },
                          { slug: "cairo-testing", title: "Cairo Testing" },
                        ],
                      },
                    ];
                    """
                ),
                encoding="utf-8",
            )

            slugs = PARITY_CHECK.docs_category_page_slugs(docs_ts, "Skills")

            self.assertEqual(
                slugs,
                {"overview", "cairo-contract-authoring", "cairo-testing"},
            )

    def test_website_skill_registry_errors_reports_missing_skill_page_and_registry_entry(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "skills" / "cairo-testing").mkdir(parents=True)
            (root / "skills" / "cairo-testing" / "SKILL.md").write_text(
                "---\nname: cairo-testing\ndescription: tests\n---\n",
                encoding="utf-8",
            )
            (root / "skills" / "cairo-auditor").mkdir(parents=True)
            (root / "skills" / "cairo-auditor" / "SKILL.md").write_text(
                "---\nname: cairo-auditor\ndescription: audit\n---\n",
                encoding="utf-8",
            )
            docs_dir = root / "website" / "content" / "docs" / "skills"
            docs_dir.mkdir(parents=True)
            (docs_dir / "cairo-testing.mdx").write_text("---\ntitle: Cairo Testing\n---\n", encoding="utf-8")
            (docs_dir / "overview.mdx").write_text("---\ntitle: Overview\n---\n", encoding="utf-8")
            (docs_dir / "cairo-coding.mdx").write_text("---\ntitle: Cairo\n---\n", encoding="utf-8")
            (docs_dir / "writing-skills.mdx").write_text("---\ntitle: Writing\n---\n", encoding="utf-8")
            (docs_dir / "publishing.mdx").write_text("---\ntitle: Publishing\n---\n", encoding="utf-8")
            docs_ts = root / "website" / "app" / "data"
            docs_ts.mkdir(parents=True)
            (docs_ts / "docs.ts").write_text(
                textwrap.dedent(
                    """
                    export const DOC_CATEGORIES = [
                      {
                        title: "Skills",
                        slug: "skills",
                        pages: [
                          { slug: "overview", title: "Overview" },
                          { slug: "cairo-testing", title: "Cairo Testing" },
                        ],
                      },
                    ];
                    """
                ),
                encoding="utf-8",
            )

            errors = PARITY_CHECK.website_skill_registry_errors(root)

            self.assertTrue(
                any("missing skill docs pages: cairo-auditor" in error for error in errors),
                errors,
            )
            self.assertTrue(
                any("missing skills in docs registry: cairo-auditor" in error for error in errors),
                errors,
            )


if __name__ == "__main__":
    unittest.main()
