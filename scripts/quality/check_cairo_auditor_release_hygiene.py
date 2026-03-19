#!/usr/bin/env python3
"""Release hygiene gate for cairo-auditor VERSION changes."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VERSION_FILE = ROOT / "skills" / "cairo-auditor" / "VERSION"
VERSION_PATTERN = re.compile(r"^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$")


class ReleaseHygieneError(RuntimeError):
    """Raised when release hygiene checks cannot be evaluated safely."""


def parse_version(version_file: Path) -> str:
    try:
        value = version_file.read_text(encoding="utf-8").strip()
    except OSError as exc:  # pragma: no cover - straightforward I/O error
        raise ReleaseHygieneError(f"unable to read {version_file}: {exc}") from exc
    if not VERSION_PATTERN.match(value):
        raise ReleaseHygieneError(f"invalid semver in {version_file}: '{value}'")
    return value


def release_tag(version: str) -> str:
    return version if version.startswith("v") else f"v{version}"


def _run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        check=False,
        text=True,
        capture_output=True,
    )


def tag_exists(tag: str) -> bool:
    local = _run_git(["rev-parse", "-q", "--verify", f"refs/tags/{tag}"])
    if local.returncode == 0:
        return True
    remote = _run_git(["ls-remote", "--tags", "origin", f"refs/tags/{tag}"])
    return remote.returncode == 0 and bool(remote.stdout.strip())


def fetch_releases(repo_slug: str, token: str | None) -> list[dict[str, Any]]:
    url = f"https://api.github.com/repos/{repo_slug}/releases?per_page=100"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "cairo-auditor-release-hygiene",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise ReleaseHygieneError(f"release API HTTP {exc.code}: {exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise ReleaseHygieneError(f"release API unavailable: {exc.reason}") from exc
    if not isinstance(payload, list):
        raise ReleaseHygieneError("unexpected release API payload (expected list)")
    return [entry for entry in payload if isinstance(entry, dict)]


def find_release_by_tag(releases: list[dict[str, Any]], tag: str) -> dict[str, Any] | None:
    for release in releases:
        if release.get("tag_name") == tag:
            return release
    return None


def evaluate_release_hygiene(
    *,
    version: str,
    tag_present: bool,
    release_entry: dict[str, Any] | None,
) -> tuple[bool, str]:
    tag = release_tag(version)
    if tag_present:
        return True, f"OK: found git tag {tag} for cairo-auditor version {version}."
    if release_entry is not None:
        state = "draft release" if release_entry.get("draft") else "published release"
        return True, f"OK: found {state} for tag {tag} (version {version})."
    return (
        False,
        f"ERROR: skills/cairo-auditor/VERSION is {version}, but neither git tag {tag} nor a matching GitHub release/draft exists.",
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enforce cairo-auditor release hygiene when VERSION changes."
    )
    parser.add_argument(
        "--enforce",
        action="store_true",
        help="Execute the gate. Without this flag the script reports skip and exits 0.",
    )
    parser.add_argument(
        "--repo-slug",
        default=(os.getenv("GITHUB_REPOSITORY", "")).strip(),
        help="GitHub repo slug (owner/repo). Defaults to GITHUB_REPOSITORY.",
    )
    parser.add_argument(
        "--version-file",
        type=Path,
        default=DEFAULT_VERSION_FILE,
        help=f"Path to VERSION file (default: {DEFAULT_VERSION_FILE}).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    if not args.enforce:
        print("SKIP: release hygiene gate not enforced (pass --enforce to activate).")
        return 0

    try:
        version = parse_version(args.version_file)
    except ReleaseHygieneError as exc:
        print(f"ERROR: {exc}")
        return 1

    tag = release_tag(version)
    git_tag_present = tag_exists(tag)

    release_entry: dict[str, Any] | None = None
    if not git_tag_present and args.repo_slug:
        try:
            releases = fetch_releases(args.repo_slug, os.getenv("GITHUB_TOKEN"))
        except ReleaseHygieneError as exc:
            print(f"ERROR: {exc}")
            return 1
        release_entry = find_release_by_tag(releases, tag)

    ok, message = evaluate_release_hygiene(
        version=version,
        tag_present=git_tag_present,
        release_entry=release_entry,
    )
    print(message)
    if ok:
        return 0

    print("Remediation:")
    print(f"- Create tag: {tag}")
    print(f"- Or create a GitHub release draft targeting tag {tag}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
