#!/usr/bin/env python3
"""Regression tests for check_cairo_auditor_release_hygiene.py."""

from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

MODULE_PATH = Path(__file__).with_name("check_cairo_auditor_release_hygiene.py")
SPEC = importlib.util.spec_from_file_location("check_cairo_auditor_release_hygiene", MODULE_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover
    raise RuntimeError(f"Unable to load module from {MODULE_PATH}")
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class ReleaseHygieneTests(unittest.TestCase):
    def test_release_tag_prepends_v_prefix(self) -> None:
        self.assertEqual(MODULE.release_tag("0.2.2"), "v0.2.2")
        self.assertEqual(MODULE.release_tag("v0.2.2"), "v0.2.2")

    def test_parse_version_rejects_non_semver(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            version_file = Path(tmp) / "VERSION"
            version_file.write_text("not-semver\n", encoding="utf-8")
            with self.assertRaises(MODULE.ReleaseHygieneError):
                MODULE.parse_version(version_file)

    def test_find_release_by_tag_matches_exact_tag(self) -> None:
        releases = [
            {"tag_name": "v0.1.0-beta.1", "draft": False},
            {"tag_name": "v0.2.2", "draft": True},
        ]
        matched = MODULE.find_release_by_tag(releases, "v0.2.2")
        self.assertIsNotNone(matched)
        self.assertTrue(matched["draft"])

    def test_evaluate_release_hygiene_passes_with_tag(self) -> None:
        ok, message = MODULE.evaluate_release_hygiene(
            version="0.2.2",
            tag_present=True,
            release_entry=None,
        )
        self.assertTrue(ok)
        self.assertIn("found git tag", message)

    def test_evaluate_release_hygiene_passes_with_draft_release(self) -> None:
        ok, message = MODULE.evaluate_release_hygiene(
            version="0.2.2",
            tag_present=False,
            release_entry={"tag_name": "v0.2.2", "draft": True},
        )
        self.assertTrue(ok)
        self.assertIn("draft release", message)

    def test_main_skips_without_enforce(self) -> None:
        self.assertEqual(MODULE.main([]), 0)

    def test_main_fails_when_enforced_without_tag_or_release(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            version_file = Path(tmp) / "VERSION"
            version_file.write_text("0.2.2\n", encoding="utf-8")
            with mock.patch.object(MODULE, "tag_exists", return_value=False), mock.patch.object(
                MODULE, "fetch_releases", return_value=[]
            ):
                code = MODULE.main(
                    [
                        "--enforce",
                        "--repo-slug",
                        "keep-starknet-strange/starknet-agentic",
                        "--version-file",
                        str(version_file),
                    ]
                )
            self.assertEqual(code, 1)


if __name__ == "__main__":
    unittest.main()
