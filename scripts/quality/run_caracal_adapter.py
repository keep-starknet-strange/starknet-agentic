#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import shlex
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path


def _collect_sierra_artifacts(repo_root: Path) -> list[Path]:
    repo_root = repo_root.resolve()
    artifacts: set[Path] = set()
    patterns = ("*.sierra.json", "*.contract_class.json", "*.sierra")
    for pattern in patterns:
        for path in repo_root.rglob(pattern):
            if path.is_symlink():
                continue
            if ".git/" in path.as_posix():
                continue
            resolved = path.resolve()
            try:
                resolved.relative_to(repo_root)
            except ValueError:
                continue
            artifacts.add(resolved)
    return sorted(artifacts)


def _render_md(payload: dict[str, object]) -> str:
    lines: list[str] = []
    lines.append("# Caracal Adapter (Experimental)")
    lines.append("")
    lines.append(f"Generated: {payload['generated_at']}")
    lines.append(f"Repo root: `{payload['repo_root']}`")
    lines.append(f"Status: `{payload['status']}`")
    lines.append("")
    if payload.get("reason"):
        lines.append(f"- Reason: {payload['reason']}")
    if payload.get("caracal_version"):
        lines.append(f"- Caracal version: `{payload['caracal_version']}`")
    lines.append(f"- Artifacts discovered: {payload['artifact_count']}")
    lines.append(f"- Attempts: {payload['attempt_count']}")
    lines.append(f"- Successful attempts: {payload['success_count']}")
    lines.append("")
    attempts = payload.get("attempts", [])
    if attempts:
        lines.append("## Attempts")
        lines.append("")
        lines.append("| Artifact | Exit |")
        lines.append("| --- | --- |")
        for row in attempts:
            lines.append(f"| `{row['artifact']}` | {row['exit_code']} |")
        lines.append("")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run optional Caracal auxiliary analysis (fail-open by default)."
    )
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-md", required=True)
    parser.add_argument("--allow-build", action="store_true")
    parser.add_argument("--scarb-bin", default="scarb")
    parser.add_argument("--scarb-timeout-seconds", type=float, default=240.0)
    parser.add_argument("--caracal-bin", default="caracal")
    parser.add_argument(
        "--caracal-timeout-seconds",
        type=float,
        default=60.0,
        help="Timeout for each Caracal subprocess invocation.",
    )
    parser.add_argument(
        "--caracal-args-template",
        default="{artifact}",
        help="Arguments template for each artifact. Supported placeholders: {artifact}, {repo_root}.",
    )
    parser.add_argument("--max-artifacts", type=int, default=10)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return non-zero on execution error when Caracal is installed.",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    out_json = Path(args.output_json).resolve()
    out_md = Path(args.output_md).resolve()
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)

    payload: dict[str, object] = {
        "generated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "repo_root": repo_root.as_posix(),
        "status": "skipped",
        "reason": "",
        "caracal_version": "",
        "artifact_count": 0,
        "attempt_count": 0,
        "success_count": 0,
        "attempts": [],
        "build_attempted": False,
        "build_exit_code": None,
    }

    caracal_bin = shutil.which(args.caracal_bin)
    if caracal_bin is None:
        payload["reason"] = "caracal_not_installed"
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 0

    try:
        version_proc = subprocess.run(
            [caracal_bin, "--version"],
            text=True,
            capture_output=True,
            check=False,
            timeout=min(30.0, args.caracal_timeout_seconds),
        )
    except subprocess.TimeoutExpired:
        version_proc = None
    if version_proc and version_proc.returncode == 0:
        payload["caracal_version"] = version_proc.stdout.strip()

    artifacts = _collect_sierra_artifacts(repo_root)
    if not artifacts and args.allow_build:
        payload["build_attempted"] = True
        scarb_bin = shutil.which(args.scarb_bin)
        if scarb_bin is None:
            payload["status"] = "error" if args.strict else "skipped"
            payload["reason"] = "scarb_not_installed"
            out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
            out_md.write_text(_render_md(payload), encoding="utf-8")
            print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
            return 1 if args.strict else 0
        try:
            build_proc = subprocess.run(
                [scarb_bin, "build"],
                cwd=repo_root,
                text=True,
                capture_output=True,
                check=False,
                timeout=args.scarb_timeout_seconds,
            )
            payload["build_exit_code"] = build_proc.returncode
            artifacts = _collect_sierra_artifacts(repo_root)
            if build_proc.returncode != 0 and not artifacts:
                payload["status"] = "error" if args.strict else "skipped"
                payload["reason"] = f"scarb_build_exit_{build_proc.returncode}"
                out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
                out_md.write_text(_render_md(payload), encoding="utf-8")
                print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
                return 1 if args.strict else 0
        except subprocess.TimeoutExpired:
            payload["status"] = "error" if args.strict else "skipped"
            payload["reason"] = "scarb_build_timeout"
            payload["build_exit_code"] = "timeout"
            out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
            out_md.write_text(_render_md(payload), encoding="utf-8")
            print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
            return 1 if args.strict else 0

    payload["artifact_count"] = len(artifacts)
    if not artifacts:
        if not payload["reason"]:
            payload["reason"] = "no_sierra_artifacts"
        out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
        out_md.write_text(_render_md(payload), encoding="utf-8")
        print(json.dumps({"status": payload["status"], "reason": payload["reason"]}, ensure_ascii=True))
        return 0

    attempts: list[dict[str, object]] = []
    success_count = 0
    for artifact in artifacts[: args.max_artifacts]:
        try:
            rendered = args.caracal_args_template.format(
                artifact=shlex.quote(artifact.as_posix()),
                repo_root=shlex.quote(repo_root.as_posix()),
            )
            cmd = [caracal_bin] + shlex.split(rendered)
        except (KeyError, ValueError, IndexError, AttributeError) as exc:
            attempts.append(
                {
                    "artifact": artifact.as_posix(),
                    "exit_code": "template_error",
                    "stdout_tail": "",
                    "stderr_tail": str(exc),
                    "command": [caracal_bin, args.caracal_args_template],
                }
            )
            continue
        try:
            proc = subprocess.run(
                cmd,
                cwd=repo_root,
                text=True,
                capture_output=True,
                check=False,
                timeout=args.caracal_timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            attempts.append(
                {
                    "artifact": artifact.as_posix(),
                    "exit_code": "timeout",
                    "stdout_tail": (exc.stdout or "")[-1200:] if isinstance(exc.stdout, str) else "",
                    "stderr_tail": (exc.stderr or "")[-1200:] if isinstance(exc.stderr, str) else "",
                    "command": cmd,
                }
            )
            continue
        attempts.append(
            {
                "artifact": artifact.as_posix(),
                "exit_code": proc.returncode,
                "stdout_tail": (proc.stdout or "")[-1200:],
                "stderr_tail": (proc.stderr or "")[-1200:],
                "command": cmd,
            }
        )
        # Many scanners use 0=no findings, 1=findings, >=2=execution error.
        if proc.returncode in (0, 1):
            success_count += 1

    payload["attempts"] = attempts
    payload["attempt_count"] = len(attempts)
    payload["success_count"] = success_count
    if success_count > 0:
        payload["status"] = "ok"
    else:
        payload["status"] = "error"
        payload["reason"] = "caracal_runs_failed"

    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(_render_md(payload), encoding="utf-8")
    print(
        json.dumps(
            {
                "status": payload["status"],
                "artifact_count": payload["artifact_count"],
                "attempt_count": payload["attempt_count"],
                "success_count": payload["success_count"],
                "output_json": out_json.as_posix(),
            },
            ensure_ascii=True,
        )
    )
    if args.strict and payload["status"] == "error":
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
