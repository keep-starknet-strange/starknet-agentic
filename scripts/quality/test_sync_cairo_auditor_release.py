from __future__ import annotations

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

    def test_dry_run_reports_no_change_for_current_versions(self) -> None:
        proc = self.run_script(
            "--skill-version",
            "0.2.1",
            "--plugin-version",
            "1.0.3",
            "--dry-run",
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("DRY-RUN: skill=0.2.1, plugin=1.0.3", proc.stdout)
        self.assertIn("skills/cairo-auditor/VERSION: unchanged", proc.stdout)

    def test_dry_run_reports_changes_for_new_versions(self) -> None:
        proc = self.run_script(
            "--skill-version",
            "0.2.2",
            "--plugin-version",
            "1.0.4",
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
