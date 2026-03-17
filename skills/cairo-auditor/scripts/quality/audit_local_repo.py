#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

EXCLUDED_FILE_PATTERNS = ("_test.cairo",)


@dataclass
class ExternalFunction:
    name: str
    line: int
    body: str


def _existing_dir(value: str) -> Path:
    path = Path(value).resolve()
    if not path.is_dir():
        raise argparse.ArgumentTypeError(f"directory does not exist: {path}")
    return path


def _git_head(repo_root: Path) -> str:
    proc = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode == 0 and proc.stdout.strip():
        return proc.stdout.strip()
    return "local"


def _is_excluded(path: Path, excluded_dirs: set[str]) -> bool:
    name = path.name
    if name.endswith(EXCLUDED_FILE_PATTERNS) or "Test" in name:
        return True
    return any(part.lower() in excluded_dirs for part in path.parts)


def _iter_cairo_files(repo_root: Path, excluded_dirs: set[str]) -> tuple[list[Path], list[Path]]:
    all_files: list[Path] = []
    prod_files: list[Path] = []
    for file_path in sorted(repo_root.rglob("*.cairo")):
        if file_path.is_symlink():
            continue
        all_files.append(file_path)
        if not _is_excluded(file_path.relative_to(repo_root), excluded_dirs):
            prod_files.append(file_path)
    return all_files, prod_files


def _skip_line_comment(text: str, idx: int) -> int:
    while idx < len(text) and text[idx] != "\n":
        idx += 1
    return idx


def _skip_block_comment(text: str, idx: int) -> int:
    idx += 2
    while idx + 1 < len(text):
        if text[idx] == "*" and text[idx + 1] == "/":
            return idx + 2
        idx += 1
    return len(text)


def _skip_string_literal(text: str, idx: int) -> int:
    quote = text[idx]
    idx += 1
    escaped = False
    while idx < len(text):
        ch = text[idx]
        if escaped:
            escaped = False
        elif ch == "\\":
            escaped = True
        elif ch == quote:
            return idx + 1
        idx += 1
    return len(text)


def _find_matching_brace(text: str, open_idx: int) -> int:
    depth = 0
    idx = open_idx
    while idx < len(text):
        ch = text[idx]
        nxt = text[idx + 1] if idx + 1 < len(text) else ""

        if ch == "/" and nxt == "/":
            idx = _skip_line_comment(text, idx + 2)
            continue
        if ch == "/" and nxt == "*":
            idx = _skip_block_comment(text, idx)
            continue
        if ch in ('"', "'"):
            idx = _skip_string_literal(text, idx)
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return idx
        idx += 1
    return -1


def _parse_external_functions(code: str) -> list[ExternalFunction]:
    functions: list[ExternalFunction] = []
    seen: set[tuple[str, int]] = set()

    fn_pattern = re.compile(r"\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
    ext_pattern = re.compile(r"(?m)^\s*#\[\s*external(?:\(\s*v0\s*\))?\s*\]\s*$")
    abi_embed_pattern = re.compile(r"(?m)^\s*#\[\s*abi\(\s*embed_v0\s*\)\s*\]\s*$")
    impl_pattern = re.compile(r"\bimpl\b[^{]*\{")

    def append_fn(name: str, line: int, body: str) -> None:
        key = (name, line)
        if key in seen:
            return
        seen.add(key)
        functions.append(ExternalFunction(name=name, line=line, body=body))

    # Legacy style: #[external(v0)] directly above fn.
    pos = 0
    while True:
        ext_match = ext_pattern.search(code, pos)
        if not ext_match:
            break

        fn_match = fn_pattern.search(code, ext_match.end())
        if not fn_match:
            break

        brace_idx = code.find("{", fn_match.end())
        if brace_idx == -1:
            break

        close_idx = _find_matching_brace(code, brace_idx)
        if close_idx == -1:
            break

        name = fn_match.group(1)
        line = code.count("\n", 0, fn_match.start()) + 1
        body = code[brace_idx + 1 : close_idx]
        append_fn(name, line, body)

        pos = close_idx + 1

    # Modern style: #[abi(embed_v0)] impl blocks expose external functions.
    pos = 0
    while True:
        abi_match = abi_embed_pattern.search(code, pos)
        if not abi_match:
            break

        impl_match = impl_pattern.search(code, abi_match.end())
        if not impl_match:
            pos = abi_match.end()
            continue

        impl_open = code.find("{", impl_match.start(), impl_match.end())
        if impl_open == -1:
            pos = impl_match.end()
            continue

        impl_close = _find_matching_brace(code, impl_open)
        if impl_close == -1:
            pos = impl_match.end()
            continue

        impl_body = code[impl_open + 1 : impl_close]
        fn_pos = 0
        while True:
            fn_match = fn_pattern.search(impl_body, fn_pos)
            if not fn_match:
                break

            local_open = impl_body.find("{", fn_match.end())
            if local_open == -1:
                fn_pos = fn_match.end()
                continue

            local_close = _find_matching_brace(impl_body, local_open)
            if local_close == -1:
                fn_pos = fn_match.end()
                continue

            name = fn_match.group(1)
            absolute_fn_start = impl_open + 1 + fn_match.start()
            line = code.count("\n", 0, absolute_fn_start) + 1
            body = impl_body[local_open + 1 : local_close]
            append_fn(name, line, body)
            fn_pos = local_close + 1

        pos = impl_close + 1

    return functions


def _guard_present(body: str) -> bool:
    guard_tokens = (
        "assert_only_owner",
        "assert_only_role",
        "ownable.assert_only_owner",
        "access_control.assert_",
        "roles.assert_",
    )
    if any(token in body for token in guard_tokens):
        return True

    guard_patterns = (
        r"assert!\s*\([^)]*get_caller_address\(\)\s*(==|!=)",
        r"assert!\s*\([^)]*(==|!=)\s*get_caller_address\(\)",
        r"if\s+get_caller_address\(\)\s*(==|!=)",
        r"if\s+[A-Za-z_][A-Za-z0-9_]*\s*(==|!=)\s*get_caller_address\(\)",
        r"assert!\s*\([^)]*has_role\s*\(",
        r"if\s+[^:\n]*has_role\s*\(",
    )
    return any(re.search(pattern, body) for pattern in guard_patterns)


def _build_findings(repo_root: Path, prod_files: list[Path]) -> list[dict[str, object]]:
    findings: list[dict[str, object]] = []
    seen: set[tuple[str, int, str]] = set()

    def add(rel: str, line: int, class_id: str, severity: str, title: str) -> None:
        key = (rel, line, class_id)
        if key in seen:
            return
        seen.add(key)
        findings.append(
            {
                "file": rel,
                "line": line,
                "class_id": class_id,
                "severity": severity,
                "title": title,
            }
        )

    for file_path in prod_files:
        rel = file_path.relative_to(repo_root).as_posix()
        code = file_path.read_text(encoding="utf-8", errors="ignore")
        for fn in _parse_external_functions(code):
            body = fn.body
            has_write = ".write(" in body
            guarded = _guard_present(body)

            if has_write and not guarded:
                add(
                    rel,
                    fn.line,
                    "NO_ACCESS_CONTROL_MUTATION",
                    "High",
                    "External state mutation lacks caller authorization checks",
                )

            looks_like_upgrade = "upgrade" in fn.name.lower()
            writes_class_hash = "class_hash" in body and ".write(" in body
            has_timelock_guards = any(
                token in body
                for token in (
                    "get_block_timestamp",
                    "executable_after",
                    "pending_class_hash",
                    "timelock",
                    "schedule_upgrade",
                )
            )
            if looks_like_upgrade and writes_class_hash and not has_timelock_guards:
                add(
                    rel,
                    fn.line,
                    "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK",
                    "High",
                    "Upgrade path appears immediate with no schedule/execute delay",
                )

            writes_new_class_hash = ".write(new_class_hash" in body
            has_nonzero_guard = re.search(
                r"new_class_hash\s*!=\s*0|0\s*!=\s*new_class_hash",
                body,
            )
            if writes_new_class_hash and not has_nonzero_guard:
                add(
                    rel,
                    fn.line,
                    "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD",
                    "Medium",
                    "Class hash mutation lacks explicit non-zero validation",
                )

    findings.sort(key=lambda row: (str(row["file"]), int(row["line"]), str(row["class_id"])))
    return findings


def _render_markdown(
    *,
    generated_at: str,
    repo_root: Path,
    ref: str,
    all_count: int,
    prod_count: int,
    findings: list[dict[str, object]],
) -> str:
    class_counts = Counter(str(row["class_id"]) for row in findings)
    severity_counts = Counter(str(row["severity"]) for row in findings)

    lines: list[str] = []
    lines.append("# Cairo Auditor Preflight")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Repo: `{repo_root.as_posix()}`")
    lines.append(f"Ref: `{ref}`")
    lines.append("")
    lines.append("## Coverage")
    lines.append("")
    lines.append(f"- Cairo files (all): {all_count}")
    lines.append(f"- Cairo files (prod-only): {prod_count}")
    lines.append(f"- Findings: {len(findings)}")
    lines.append("")

    lines.append("## Class Counts")
    lines.append("")
    if class_counts:
        for class_id, count in sorted(class_counts.items()):
            lines.append(f"- `{class_id}`: {count}")
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Severity Counts")
    lines.append("")
    if severity_counts:
        for severity, count in sorted(severity_counts.items()):
            lines.append(f"- `{severity}`: {count}")
    else:
        lines.append("- none")
    lines.append("")

    if findings:
        lines.append("## Findings")
        lines.append("")
        lines.append("| File | Line | Class | Severity | Title |")
        lines.append("| --- | ---: | --- | --- | --- |")
        for row in findings:
            lines.append(
                f"| `{row['file']}` | {row['line']} | `{row['class_id']}` | {row['severity']} | {row['title']} |"
            )
        lines.append("")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Deterministic local preflight for cairo-auditor.")
    parser.add_argument("--repo-root", type=_existing_dir, default=Path(".").resolve())
    parser.add_argument("--scan-id", default="preflight")
    parser.add_argument("--output-dir", default="/tmp")
    parser.add_argument(
        "--exclude",
        default="test,tests,mock,mocks,example,examples,preset,presets,fixture,fixtures,vendor,vendors",
    )
    parser.add_argument("--fail-on-findings", action="store_true")
    args = parser.parse_args()
    safe_scan_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(args.scan_id)).strip("._-")
    if not safe_scan_id:
        parser.error("--scan-id must contain at least one safe filename character")
    safe_scan_id = safe_scan_id[:64]

    repo_root = Path(args.repo_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    excluded_dirs = {token.strip().lower() for token in args.exclude.split(",") if token.strip()}
    all_files, prod_files = _iter_cairo_files(repo_root, excluded_dirs)
    findings = _build_findings(repo_root, prod_files)

    generated_at = datetime.now(UTC).replace(microsecond=0)
    ts = generated_at.strftime("%Y%m%d-%H%M%SZ")
    stem = f"{safe_scan_id}-{ts}"
    out_json = output_dir / f"{stem}.json"
    out_md = output_dir / f"{stem}.md"

    class_counts = Counter(str(row["class_id"]) for row in findings)
    severity_counts = Counter(str(row["severity"]) for row in findings)

    payload = {
        "scan_id": safe_scan_id,
        "generated_at": generated_at.isoformat(),
        "repo_root": repo_root.as_posix(),
        "ref": _git_head(repo_root),
        "all_cairo_files": len(all_files),
        "prod_cairo_files": len(prod_files),
        "findings": findings,
        "class_counts": dict(class_counts),
        "severity_counts": dict(severity_counts),
        "output_json": out_json.as_posix(),
        "output_md": out_md.as_posix(),
    }

    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(
        _render_markdown(
            generated_at=generated_at.isoformat(),
            repo_root=repo_root,
            ref=payload["ref"],
            all_count=len(all_files),
            prod_count=len(prod_files),
            findings=findings,
        ),
        encoding="utf-8",
    )

    print(
        json.dumps(
            {
                "scan_id": safe_scan_id,
                "findings": len(findings),
                "class_counts": dict(class_counts),
                "severity_counts": dict(severity_counts),
                "output_json": out_json.as_posix(),
                "output_md": out_md.as_posix(),
            },
            ensure_ascii=True,
        )
    )

    if args.fail_on_findings and findings:
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
