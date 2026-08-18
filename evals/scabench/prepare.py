#!/usr/bin/env python3
"""Fetch and sanitize a SCAbench project into a leak-free audit target.

The whole point of this script is the sanitization. A benchmark repository often
carries the answer key alongside the code: contest READMEs with a "Known Issues"
section, vendored audit reports, fix commits described in a changelog. An auditor
run against an unsanitized tree scores its own reading comprehension, and the
resulting recall number is worse than having no number at all, because it looks
like evidence.

So this script does three things, in order:

1. Strips files matching known answer-key shapes.
2. Scans everything that survives for ground-truth leakage, and FAILS LOUDLY if
   it finds any. Silence here would defeat the purpose.
3. Writes a manifest recording exactly what was removed and what was checked, so
   a reviewer can audit the sanitization rather than trust it.

A protocol specification is deliberately NOT treated as leakage. A real auditor
gets the spec; it is what makes a documented-invariant violation distinguishable
from an inferred one. Only finding-specific text is a leak.

Usage:
    python3 evals/scabench/prepare.py --project code4rena_starknet-perpetual_2025_06 \
        --out /tmp/scabench-work
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
GROUND_TRUTH_DIR = Path(__file__).resolve().parent / "ground_truth"

# Paths whose presence in an audit target is an answer key, not context.
STRIP_PATH_PATTERNS = (
    r"(^|/)audits?(/|$)",
    r"(^|/)findings?(/|$)",
    r"(^|/)security[-_]?(review|assessment|report)s?(/|$)",
    r"(^|/)\.github/",
    r"(^|/)CHANGELOG(\.md)?$",
    r"(^|/)(KNOWN[-_]?ISSUES|DISCLOSURES?)(\.md)?$",
    r"\.(pdf|patch|diff)$",
)

# Section headers that contest repos use to enumerate the bugs up front.
LEAK_SECTION_PATTERNS = (
    r"#+\s*(publicly\s+)?known\s+issues",
    r"#+\s*previous\s+audits?",
    r"#+\s*(known|existing)\s+vulnerabilit",
    r"#+\s*out\s+of\s+scope\s+findings",
)

# Words too generic to indicate leakage on their own; a spec legitimately uses them.
_STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "can", "will", "are", "not",
    "all", "any", "due", "same", "used", "using", "into", "vulnerability", "issue",
    "error", "missing", "incorrect", "wrong", "invalid", "unnecessary", "should",
    "cannot", "blocked", "check", "checks", "validation", "value", "values", "price",
    "prices", "asset", "assets", "position", "positions", "account", "public", "key",
    "keys", "owner", "interval", "rate", "order", "operations", "apply", "diff",
    "stale", "usage", "active", "inactive", "settlement", "transfers", "withdrawals",
}


def _normalize(text: str) -> str:
    """Lowercase and collapse whitespace so phrase matching survives line wrapping."""
    return re.sub(r"[^a-z0-9_]+", " ", text.lower()).strip()


def _distinctive_phrases(title: str) -> list[str]:
    """Consecutive word runs from a finding title that a spec would not naturally contain.

    Phrases are built from CONSECUTIVE title words rather than a stopword-filtered
    subsequence, because the haystack is raw prose: dropping "can" from the phrase
    means the phrase can never match text that contains "can". Stopwords are instead
    used as a density filter -- a run must carry at least two content words to count,
    which keeps generic spec language ("the price of the asset") from matching.
    """
    words = _normalize(title).split()
    phrases = []
    for size in (4, 5):
        for i in range(len(words) - size + 1):
            run = words[i : i + size]
            if sum(1 for w in run if w not in _STOPWORDS and len(w) > 2) >= 2:
                phrases.append(" ".join(run))
    return phrases


def load_ground_truth(project_id: str) -> dict[str, Any]:
    path = GROUND_TRUTH_DIR / f"{project_id}.json"
    if not path.is_file():
        available = sorted(p.stem for p in GROUND_TRUTH_DIR.glob("*.json"))
        raise SystemExit(f"No vendored ground truth for {project_id!r}. Available: {available}")
    return json.loads(path.read_text(encoding="utf-8"))


def pick_codebase(project: dict[str, Any]) -> dict[str, Any]:
    """Prefer a codebase pinned to a commit; an unpinned target is not reproducible."""
    pinned = [c for c in project.get("codebases", []) if c.get("commit") and c.get("tarball_url")]
    if not pinned:
        raise SystemExit("No codebase with both a commit and a tarball_url; cannot pin the target.")
    return pinned[0]


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "cairo-auditor-eval"})
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310 - fixed https URL
        return response.read()


def extract(blob: bytes, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar.getmembers():
            # Strip the GitHub-added top-level directory, and refuse traversal.
            parts = Path(member.name).parts[1:]
            if not parts:
                continue
            target = dest.joinpath(*parts).resolve()
            if not str(target).startswith(str(dest.resolve())):
                raise SystemExit(f"Refusing path traversal in archive: {member.name}")
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                extracted = tar.extractfile(member)
                if extracted is not None:
                    target.write_bytes(extracted.read())


def content_digest(source: Path) -> str:
    """Digest over .cairo content only: stable even if the host re-compresses tarballs."""
    digest = hashlib.sha256()
    for path in sorted(source.rglob("*.cairo")):
        digest.update(path.relative_to(source).as_posix().encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def strip_answer_keys(source: Path) -> list[str]:
    removed: list[str] = []
    for path in sorted(source.rglob("*"), reverse=True):
        rel = path.relative_to(source).as_posix()
        if any(re.search(pattern, rel, re.IGNORECASE) for pattern in STRIP_PATH_PATTERNS):
            if path.is_dir():
                shutil.rmtree(path, ignore_errors=True)
            else:
                path.unlink(missing_ok=True)
            removed.append(rel)
    return removed


def scan_for_leaks(source: Path, project: dict[str, Any]) -> list[dict[str, str]]:
    """Look for finding-specific text in whatever survived the strip pass."""
    vulns = project.get("vulnerabilities", [])
    finding_ids = [v["finding_id"] for v in vulns if v.get("finding_id")]
    phrases: dict[str, str] = {}
    for vuln in vulns:
        for phrase in _distinctive_phrases(vuln.get("title", "")):
            phrases[phrase] = vuln.get("finding_id", "?")

    leaks: list[dict[str, str]] = []
    for path in sorted(source.rglob("*")):
        if not path.is_file() or path.suffix.lower() in {".png", ".jpg", ".gz", ".lock"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        rel = path.relative_to(source).as_posix()
        lowered = text.lower()
        normalized = _normalize(text)

        for finding_id in finding_ids:
            if finding_id.lower() in lowered:
                leaks.append({"file": rel, "kind": "finding_id", "evidence": finding_id})
        for pattern in LEAK_SECTION_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                leaks.append({"file": rel, "kind": "known_issues_section", "evidence": match.group(0)})
        for phrase, finding_id in phrases.items():
            if phrase in normalized:
                leaks.append({"file": rel, "kind": "title_phrase", "evidence": f"{finding_id}: {phrase}"})
    return leaks


def main() -> int:
    parser = argparse.ArgumentParser(description="Fetch and sanitize a SCAbench audit target.")
    parser.add_argument("--project", required=True, help="Project id with vendored ground truth.")
    parser.add_argument("--out", required=True, help="Work directory to populate.")
    parser.add_argument(
        "--allow-leaks",
        action="store_true",
        help="Report leakage but do not fail. For diagnosing a new project only; never for scoring.",
    )
    args = parser.parse_args()

    project = load_ground_truth(args.project)
    codebase = pick_codebase(project)
    out = Path(args.out).resolve()
    source = out / "source"

    print(f"project      : {project['project_id']}")
    print(f"codebase     : {codebase['codebase_id']} @ {codebase['commit'][:12]}")
    print(f"ground truth : {len(project['vulnerabilities'])} findings")

    extract(download(codebase["tarball_url"]), source)
    cairo_before = len(list(source.rglob("*.cairo")))
    digest = content_digest(source)
    print(f"cairo files  : {cairo_before}")
    print(f"content sha  : {digest}")

    removed = strip_answer_keys(source)
    print(f"stripped     : {len(removed)} path(s){':' if removed else ' (nothing matched)'}")
    for rel in removed:
        print(f"               - {rel}")

    leaks = scan_for_leaks(source, project)
    manifest = {
        "project_id": project["project_id"],
        "codebase_id": codebase["codebase_id"],
        "commit": codebase["commit"],
        "tarball_url": codebase["tarball_url"],
        "cairo_content_sha256": digest,
        "cairo_files": cairo_before,
        "ground_truth_findings": len(project["vulnerabilities"]),
        "stripped_paths": removed,
        "leak_hits": leaks,
        "sanitized": not leaks,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if leaks:
        print(f"\nLEAKAGE DETECTED ({len(leaks)} hit(s)) — this target is not safe to score:")
        for leak in leaks[:20]:
            print(f"  {leak['file']}: {leak['kind']} -> {leak['evidence']}")
        if not args.allow_leaks:
            print("\nRefusing to produce a scoreable target. Extend STRIP_PATH_PATTERNS or drop this project.")
            return 1
        print("\n--allow-leaks set: continuing, but any score from this tree is invalid.")
    else:
        print("leak scan    : clean (no finding ids, known-issues sections, or title phrases)")

    print(f"\nprepared     : {source}")
    print(f"manifest     : {out / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
