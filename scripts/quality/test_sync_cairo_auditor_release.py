from __future__ import annotations

import json
import subprocess
import unittest
from pathlib import Path


class SyncCairoAuditorReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.root = Path(__file__).resolve().parents[2]
        cls.script = cls.root / "scripts" / "quality" / "sync_cairo_auditor_release.py"

    def run_script(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["python3", str(self.script), *args],
            cwd=self.root,
            text=True,
            capture_output=True,
            check=False,
        )

    def current_versions(self) -> tuple[str, str]:
        skill_version = (self.root / "skills" / "cairo-auditor" / "VERSION").read_text(
            encoding="utf-8"
        ).strip()
        plugin_version = json.loads(
            (self.root / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8")
        )["version"]
        return skill_version, plugin_version

    @staticmethod
    def bump_patch(version: str) -> str:
        # Strip optional pre-release/build metadata before bumping.
        base = version.split("-")[0].split("+")[0]
        parts = base.split(".")
        if len(parts) < 3:
            raise AssertionError(f"expected semantic version with 3 parts, got {version}")
        major, minor, patch = parts[:3]
        return f"{major}.{minor}.{int(patch) + 1}"

    def test_dry_run_reports_no_change_for_current_versions(self) -> None:
        skill_version, plugin_version = self.current_versions()
        proc = self.run_script(
            "--skill-version",
            skill_version,
            "--plugin-version",
            plugin_version,
            "--dry-run",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn(
            f"DRY-RUN: skill={skill_version}, plugin={plugin_version}",
            proc.stdout,
        )
        self.assertIn("skills/cairo-auditor/VERSION: unchanged", proc.stdout)

    def test_dry_run_reports_changes_for_new_versions(self) -> None:
        skill_version, plugin_version = self.current_versions()
        next_skill = self.bump_patch(skill_version)
        next_plugin = self.bump_patch(plugin_version)
        proc = self.run_script(
            "--skill-version",
            next_skill,
            "--plugin-version",
            next_plugin,
            "--dry-run",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("skills/cairo-auditor/VERSION: changed", proc.stdout)
        self.assertIn(".claude-plugin/plugin.json: changed", proc.stdout)

    def test_rejects_invalid_semver(self) -> None:
        proc = self.run_script(
            "--skill-version",
            "bad",
            "--plugin-version",
            "1.0.3",
            "--dry-run",
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("must match semantic version style", proc.stderr)


if __name__ == "__main__":
    unittest.main()
