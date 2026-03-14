#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable

from benchmark_cairo_auditor import DETECTORS


@dataclass
class RepoSpec:
    slug: str
    ref: str | None


REPO_SLUG_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
REF_RE = re.compile(r"^[A-Za-z0-9._/@+-]{1,200}$")


def parse_repo_spec(raw: str) -> RepoSpec:
    raw = raw.strip()
    if not raw:
        raise ValueError("empty repo spec")
    if "@" in raw:
        slug, ref = raw.split("@", 1)
    else:
        slug, ref = raw, None
    if not REPO_SLUG_RE.fullmatch(slug):
        raise ValueError(f"invalid repo slug: {raw}")
    if ref:
        if ref.startswith("-"):
            raise ValueError(f"invalid repo ref (must not start with '-'): {raw}")
        if not REF_RE.fullmatch(ref):
            raise ValueError(f"invalid repo ref: {raw}")
    return RepoSpec(slug=slug, ref=ref or None)


def run(cmd: list[str], cwd: Path | None = None, timeout: float = 300) -> str:
    try:
        proc = subprocess.run(
            cmd,
            cwd=cwd,
            check=True,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        cwd_str = cwd.as_posix() if cwd else "."
        cmd_str = " ".join(cmd)
        raise RuntimeError(f"command timed out after {timeout}s in {cwd_str}: {cmd_str}") from exc
    return proc.stdout.strip()


def repo_git_url(spec: RepoSpec, git_host: str) -> str:
    host = git_host.strip().rstrip("/")
    if not host:
        raise ValueError("git_host cannot be empty")
    parsed = urllib.parse.urlparse(host)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"invalid git_host: {git_host}")
    return f"{host}/{spec.slug}.git"


def clone_repo(spec: RepoSpec, workdir: Path, git_host: str) -> tuple[Path, str]:
    repo_dir = workdir / spec.slug.replace("/", "__")
    if repo_dir.exists():
        shutil.rmtree(repo_dir)
    url = repo_git_url(spec, git_host)
    clone_cmd = ["git", "clone", "--depth", "1", url, str(repo_dir)]
    run(clone_cmd)
    if spec.ref:
        run(["git", "fetch", "--depth", "1", "origin", spec.ref], cwd=repo_dir)
        run(["git", "checkout", spec.ref], cwd=repo_dir)
    resolved_ref = run(["git", "rev-parse", "HEAD"], cwd=repo_dir)
    return repo_dir, resolved_ref


def iter_cairo_files(repo_dir: Path) -> list[Path]:
    return sorted(repo_dir.rglob("*.cairo"))


def is_excluded(path: Path, excluded_markers: tuple[str, ...]) -> bool:
    parts = [p.lower() for p in path.as_posix().split("/")]
    for marker in excluded_markers:
        if any(
            part == marker
            or Path(part).stem.lower() == marker
            or part.startswith(f"{marker}_")
            or part.endswith(f"_{marker}")
            or part.startswith(f"{marker}-")
            or part.endswith(f"-{marker}")
            for part in parts
        ):
            return True
    return False


def scan_repo(
    *,
    spec: RepoSpec,
    repo_dir: Path,
    resolved_ref: str,
    git_host: str,
    detector_map: dict[str, Callable[[str], bool]],
    excluded_markers: tuple[str, ...],
) -> tuple[dict[str, object], list[dict[str, object]]]:
    all_files = iter_cairo_files(repo_dir)
    prod_files = [p for p in all_files if not is_excluded(p, excluded_markers)]

    findings: list[dict[str, object]] = []
    for file_path in prod_files:
        rel = file_path.relative_to(repo_dir).as_posix()
        try:
            code = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print(
                f"WARNING: utf-8 decode fallback for {spec.slug}:{rel}; using errors='ignore'",
                file=sys.stderr,
            )
            code = file_path.read_text(encoding="utf-8", errors="ignore")
        for class_id, detector in detector_map.items():
            if detector(code):
                findings.append(
                    {
                        "repo": spec.slug,
                        "ref": resolved_ref,
                        "file": rel,
                        "class_id": class_id,
                        "scope": "prod_scan",
                    }
                )

    repo_summary = {
        "repo": spec.slug,
        "url": repo_git_url(spec, git_host),
        "ref": resolved_ref,
        "all_cairo_files": len(all_files),
        "prod_cairo_files": len(prod_files),
        "prod_hits": len(findings),
    }
    return repo_summary, findings


def render_markdown(
    *,
    scan_id: str,
    generated_at: str,
    repo_summaries: list[dict[str, object]],
    class_counts: Counter[str],
    repo_counts: Counter[str],
    findings: list[dict[str, object]],
    output_json: Path,
) -> str:
    json_path = output_json.as_posix()
    try:
        json_path = output_json.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        json_path = output_json.name

    lines: list[str] = []
    lines.append(f"# External Repo Detector Sweep ({scan_id})")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append("")
    lines.append("Machine-readable artifact:")
    lines.append("")
    lines.append(f"- `{json_path}`")
    lines.append("")
    lines.append("## Scope")
    lines.append("")
    for i, row in enumerate(repo_summaries, start=1):
        lines.append(f"{i}. `{row['repo']}@{str(row['ref'])[:12]}`")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append("| Repo | Cairo files (all) | Cairo files (prod-only) | Hits |")
    lines.append("| --- | ---: | ---: | ---: |")
    for row in repo_summaries:
        lines.append(
            f"| {row['repo']} | {row['all_cairo_files']} | {row['prod_cairo_files']} | {row['prod_hits']} |"
        )
    lines.append("")
    lines.append("## Results")
    lines.append("")
    lines.append(f"- Total findings: **{len(findings)}**")
    lines.append("")
    lines.append("By class:")
    lines.append("")
    for class_id, count in sorted(class_counts.items()):
        lines.append(f"- `{class_id}`: {count}")
    lines.append("")
    lines.append("By repo:")
    lines.append("")
    for row in sorted(repo_summaries, key=lambda item: str(item["repo"])):
        repo = str(row["repo"])
        lines.append(f"- `{repo}`: {repo_counts.get(repo, 0)}")
    lines.append("")
    if findings:
        lines.append("## Findings")
        lines.append("")
        lines.append("| Repo | File | Class |")
        lines.append("| --- | --- | --- |")
        for row in findings:
            lines.append(f"| `{row['repo']}` | `{row['file']}` | `{row['class_id']}` |")
        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Scan external repos with cairo-auditor detectors.")
    parser.add_argument("--scan-id", required=True)
    parser.add_argument("--repos", nargs="*", default=[])
    parser.add_argument("--repos-file", default="")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-md", default="")
    parser.add_argument("--output-findings-jsonl", default="")
    parser.add_argument(
        "--workdir",
        default=str(Path(tempfile.gettempdir()) / "starknet-skills-external-scan"),
    )
    parser.add_argument("--exclude", default="test,tests,mock,mocks,example,examples,preset,presets,fixture,fixtures,vendor,vendors")
    parser.add_argument("--detectors", default="")
    parser.add_argument("--git-host", default="https://github.com")
    args = parser.parse_args()

    repo_specs: list[RepoSpec] = []
    for raw in args.repos:
        repo_specs.append(parse_repo_spec(raw))
    if args.repos_file:
        for line in Path(args.repos_file).read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            repo_specs.append(parse_repo_spec(line))
    if not repo_specs:
        raise ValueError("no repos provided")

    detector_map = DETECTORS
    if args.detectors:
        selected = [d.strip() for d in args.detectors.split(",") if d.strip()]
        missing = [d for d in selected if d not in DETECTORS]
        if missing:
            raise ValueError(f"unknown detector(s): {missing}")
        detector_map = {k: DETECTORS[k] for k in selected}

    workdir = Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    excluded_markers = tuple(s.strip().lower() for s in args.exclude.split(",") if s.strip())

    repo_summaries: list[dict[str, object]] = []
    findings: list[dict[str, object]] = []
    failures: list[dict[str, str]] = []

    for spec in repo_specs:
        try:
            repo_dir, resolved_ref = clone_repo(spec, workdir, args.git_host)
            summary, repo_findings = scan_repo(
                spec=spec,
                repo_dir=repo_dir,
                resolved_ref=resolved_ref,
                git_host=args.git_host,
                detector_map=detector_map,
                excluded_markers=excluded_markers,
            )
            repo_summaries.append(summary)
            findings.extend(repo_findings)
        except Exception as exc:
            msg = str(exc).splitlines()[0][:400]
            print(f"WARNING: skipping {spec.slug}: {msg}", file=sys.stderr)
            failures.append({"repo": spec.slug, "ref": spec.ref or "", "error": msg})

    class_counts = Counter(str(row["class_id"]) for row in findings)
    repo_counts = Counter(str(row["repo"]) for row in findings)
    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    output_json = Path(args.output_json)
    output_json.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, object] = {
        "scan_id": args.scan_id,
        "generated_at": generated_at,
        "scanner": {
            "tool": "scripts/quality/scan_external_repos.py",
            "detectors_source": "scripts/quality/benchmark_cairo_auditor.py",
            "detectors": sorted(detector_map.keys()),
            "exclude_markers": list(excluded_markers),
        },
        "repos": repo_summaries,
        "summary": {
            "all_cairo_files": sum(int(r["all_cairo_files"]) for r in repo_summaries),
            "prod_cairo_files": sum(int(r["prod_cairo_files"]) for r in repo_summaries),
            "prod_hits": len(findings),
        },
        "failures": failures,
        "findings": findings,
    }
    output_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    if args.output_findings_jsonl:
        out_jsonl = Path(args.output_findings_jsonl)
        out_jsonl.parent.mkdir(parents=True, exist_ok=True)
        with out_jsonl.open("w", encoding="utf-8") as f:
            for row in findings:
                f.write(json.dumps(row, ensure_ascii=True) + "\n")

    if args.output_md:
        out_md = Path(args.output_md)
        out_md.parent.mkdir(parents=True, exist_ok=True)
        markdown = render_markdown(
            scan_id=args.scan_id,
            generated_at=generated_at,
            repo_summaries=repo_summaries,
            class_counts=class_counts,
            repo_counts=repo_counts,
            findings=findings,
            output_json=output_json,
        )
        out_md.write_text(markdown, encoding="utf-8")

    print(
        json.dumps(
            {
                "scan_id": args.scan_id,
                "repos": len(repo_summaries),
                "findings": len(findings),
                "output": output_json.as_posix(),
            },
            ensure_ascii=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
