#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path


def _resolve_from_repo(raw: str, repo_root: Path) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate.resolve()
    return (repo_root / candidate).resolve()


def _render_md(payload: dict[str, object]) -> str:
    lines: list[str] = []
    lines.append("# Semgrep Cairo Adapter")
    lines.append("")
    lines.append(f"Generated: {payload['generated_at']}")
    lines.append(f"Repo root: `{payload['repo_root']}`")
    lines.append(f"Config: `{payload['config']}`")
    lines.append(f"Status: `{payload['status']}`")
    lines.append("")
    if payload.get("reason"):
        lines.append(f"- Reason: {payload['reason']}")
        lines.append("")

    if payload.get("semgrep_version"):
        lines.append(f"- Semgrep version: `{payload['semgrep_version']}`")
        lines.append("")

    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Findings: {payload['findings']}")
    lines.append(f"- Files touched: {payload['files_touched']}")
    lines.append("")

    by_rule = payload.get("by_rule", {})
    if by_rule:
        lines.append("## Findings by Rule")
        lines.append("")
        for rule_id, count in sorted(by_rule.items()):
            lines.append(f"- `{rule_id}`: {count}")
        lines.append("")

    examples = payload.get("examples", [])
    if examples:
        lines.append("## Example Matches")
        lines.append("")
        lines.append("| Rule | File | Line |")
        lines.append("| --- | --- | --- |")
        for row in examples:
            lines.append(f"| `{row['rule_id']}` | `{row['path']}` | {row['line']} |")
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run optional Semgrep Cairo ruleset (fail-open by default).")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument(
        "--config",
        default="skills/cairo-auditor/references/semgrep/rules",
        help="Semgrep rules config.",
    )
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-md", required=True)
    parser.add_argument(
        "--semgrep-timeout-seconds",
        type=float,
        default=240.0,
        help="Timeout for each Semgrep subprocess invocation.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return non-zero on Semgrep execution errors or findings.",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    config_path = _resolve_from_repo(args.config, repo_root)
    out_json = _resolve_from_repo(args.output_json, repo_root)
    out_md = _resolve_from_repo(args.output_md, repo_root)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, object] = {
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "repo_root": repo_root.as_posix(),
        "config": config_path.as_posix(),
        "status": "skipped",
        "reason": "",
        "semgrep_version": "",
        "findings": 0,
        "files_touched": 0,
        "by_rule": {},
        "examples": [],
    }

    semgrep_bin = shutil.which("semgrep")
    if semgrep_bin is None:
        if args.strict:
            payload["status"] = "error"
        payload["reason"] = "semgrep_not_installed"
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 1 if args.strict else 0

    if not config_path.exists():
        payload["reason"] = "config_not_found"
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 1 if args.strict else 0

    try:
        version_proc = subprocess.run(
            [semgrep_bin, "--version"],
            text=True,
            capture_output=True,
            check=False,
            timeout=min(30.0, args.semgrep_timeout_seconds),
        )
    except subprocess.TimeoutExpired:
        version_proc = None
    if version_proc and version_proc.returncode == 0:
        payload["semgrep_version"] = version_proc.stdout.strip()

    try:
        proc = subprocess.run(
            [
                semgrep_bin,
                "--config",
                config_path.as_posix(),
                "--json",
                "--quiet",
                "--metrics=off",
                repo_root.as_posix(),
            ],
            text=True,
            capture_output=True,
            check=False,
            timeout=args.semgrep_timeout_seconds,
        )
    except subprocess.TimeoutExpired as exc:
        payload["status"] = "error"
        payload["reason"] = "semgrep_timeout"
        payload["stderr"] = (exc.stderr or "")[-4000:] if isinstance(exc.stderr, str) else ""
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 1 if args.strict else 0

    if proc.returncode not in (0, 1):
        payload["status"] = "error"
        payload["reason"] = f"semgrep_exit_{proc.returncode}"
        payload["stderr"] = proc.stderr[-4000:]
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 1 if args.strict else 0

    try:
        raw = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        payload["status"] = "error"
        payload["reason"] = "invalid_semgrep_json"
        payload["stderr"] = proc.stderr[-4000:]
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 1 if args.strict else 0

    results = raw.get("results", []) if isinstance(raw, dict) else []
    by_rule: Counter[str] = Counter()
    files: set[str] = set()
    examples: list[dict[str, object]] = []
    for row in results:
        if not isinstance(row, dict):
            continue
        rule_id = str(row.get("check_id", "unknown"))
        by_rule[rule_id] += 1
        path = str(row.get("path", ""))
        if path:
            files.add(path)
        start = row.get("start", {}) if isinstance(row.get("start"), dict) else {}
        line = int(start.get("line", 0)) if isinstance(start.get("line", 0), int) else 0
        if len(examples) < 20:
            examples.append({"rule_id": rule_id, "path": path, "line": line})

    payload["status"] = "ok"
    payload["findings"] = sum(by_rule.values())
    payload["files_touched"] = len(files)
    payload["by_rule"] = dict(by_rule)
    payload["examples"] = examples

    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(_render_md(payload), encoding="utf-8")
    print(
        json.dumps(
            {
                "status": payload["status"],
                "findings": payload["findings"],
                "files_touched": payload["files_touched"],
                "output_json": out_json.as_posix(),
            },
            ensure_ascii=True,
        )
    )

    if args.strict and payload["findings"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
