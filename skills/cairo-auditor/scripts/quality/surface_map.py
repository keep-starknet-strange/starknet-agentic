#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


EXCLUDED_DIRS = {
    "test",
    "tests",
    "mock",
    "mocks",
    "example",
    "examples",
    "fixture",
    "fixtures",
    "vendor",
    "vendors",
    "preset",
    "presets",
}


def _skip_string(text: str, idx: int) -> int:
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
            while idx < len(text) and text[idx] != "\n":
                idx += 1
            continue
        if ch == "/" and nxt == "*":
            idx += 2
            while idx + 1 < len(text) and not (text[idx] == "*" and text[idx + 1] == "/"):
                idx += 1
            idx += 2
            continue
        if ch in {"'", '"'}:
            idx = _skip_string(text, idx)
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return idx
        idx += 1
    return -1


def _iter_functions(code: str) -> list[dict[str, object]]:
    functions: list[dict[str, object]] = []
    pattern = re.compile(r"\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>\n]*>)?\s*\(")
    for match in pattern.finditer(code):
        brace_idx = code.find("{", match.end())
        if brace_idx == -1:
            continue
        close_idx = _find_matching_brace(code, brace_idx)
        if close_idx == -1:
            continue
        functions.append(
            {
                "name": match.group(1),
                "line": code.count("\n", 0, match.start()) + 1,
                "body": code[brace_idx + 1 : close_idx],
                "prefix": code[max(0, match.start() - 220) : match.start()],
            }
        )
    return functions


def _is_exposed(fn: dict[str, object], code: str) -> bool:
    name = re.escape(str(fn["name"]))
    prefix = str(fn.get("prefix", "")).lower()
    if "#[external" in prefix:
        return True
    for match in re.finditer(r"#\[\s*abi\s*\(\s*(?:embed_v0|per_item)\s*\)\s*\]\s*impl\b[^{]*\{", code, re.IGNORECASE):
        open_idx = code.find("{", match.start(), match.end())
        if open_idx == -1:
            continue
        close_idx = _find_matching_brace(code, open_idx)
        if close_idx == -1:
            continue
        block = code[open_idx + 1 : close_idx]
        if re.search(rf"\bfn\s+{name}\s*\(", block):
            return True
    return str(fn["name"]) in {"__execute__", "__validate__", "__validate_declare__"}


def _discover_files(repo_root: Path, scope_file: Path | None) -> list[Path]:
    if scope_file and scope_file.exists():
        repo_root_resolved = repo_root.resolve()
        files: list[Path] = []
        for line in scope_file.read_text(encoding="utf-8").splitlines():
            raw = line.strip()
            if not raw:
                continue
            path = Path(raw)
            if not path.is_absolute():
                path = repo_root / path
            try:
                resolved = path.resolve()
            except OSError:
                continue
            try:
                resolved.relative_to(repo_root_resolved)
            except ValueError:
                # paths outside repo_root are skipped to prevent leaking out-of-scope content
                continue
            if resolved.exists() and resolved.suffix == ".cairo":
                files.append(resolved)
        return sorted(set(files))

    files = []
    for path in repo_root.rglob("*.cairo"):
        rel = path.relative_to(repo_root)
        parts = {part.lower() for part in rel.parts}
        if parts & EXCLUDED_DIRS:
            continue
        if path.name.endswith("_test.cairo") or "Test" in path.name:
            continue
        files.append(path.resolve())
    return sorted(files)


def _analyze_file(repo_root: Path, path: Path) -> dict[str, object]:
    code = path.read_text(encoding="utf-8", errors="ignore")
    functions = _iter_functions(code)
    known = {str(fn["name"]) for fn in functions}
    rel = path.relative_to(repo_root).as_posix()
    entries: list[dict[str, object]] = []
    for fn in functions:
        body = str(fn["body"])
        lower = body.lower()
        calls = sorted(
            {
                match.group(1)
                for match in re.finditer(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(", body)
                if match.group(1) in known and match.group(1) != fn["name"]
            }
        )
        writes = sorted(set(re.findall(r"\bself\.([A-Za-z_][A-Za-z0-9_]*)\.write\s*\(", body)))
        external_calls = sorted(
            marker
            for marker in (
                "call_contract_syscall",
                "library_call",
                "safe_transfer_from",
                "transfer",
                "replace_class_syscall",
                "upgradeable.upgrade",
            )
            if marker in lower
        )
        guards = sorted(
            marker
            for marker in (
                "assert_only_owner",
                "assert_only_role",
                "has_role",
                "get_caller_address",
                "non_reentrant",
            )
            if marker in lower
        )
        name = str(fn["name"])
        entries.append(
            {
                "file": rel,
                "name": name,
                "line": fn["line"],
                "external": _is_exposed(fn, code),
                "session_hook": name in {"__execute__", "__validate__", "__validate_declare__"},
                "upgrade_path": "upgrade" in name.lower() or "replace_class_syscall" in lower or "upgradeable.upgrade" in lower,
                "storage_writes": writes,
                "external_calls": external_calls,
                "auth_guards": guards,
                "calls": calls,
            }
        )
    return {"file": rel, "functions": entries}


def _render_md(payload: dict[str, object]) -> str:
    lines = ["# Cairo Audit Surface Map", ""]
    files = payload.get("files", [])
    if not isinstance(files, list):
        return "\n".join(lines)
    for file_row in files:
        if not isinstance(file_row, dict):
            continue
        lines += [f"## `{file_row.get('file')}`", ""]
        lines += ["| Function | Line | Exposed | Writes | External Calls | Guards | Calls |", "|---|---:|---|---|---|---|---|"]
        functions = file_row.get("functions", [])
        if not isinstance(functions, list):
            continue
        for fn in functions:
            if not isinstance(fn, dict):
                continue
            writes = ", ".join(f"`{item}`" for item in fn.get("storage_writes", [])) or "-"
            ext = ", ".join(f"`{item}`" for item in fn.get("external_calls", [])) or "-"
            guards = ", ".join(f"`{item}`" for item in fn.get("auth_guards", [])) or "-"
            calls = ", ".join(f"`{item}`" for item in fn.get("calls", [])) or "-"
            exposed = "yes" if fn.get("external") else "no"
            lines.append(
                f"| `{fn.get('name')}` | {fn.get('line')} | {exposed} | {writes} | {ext} | {guards} | {calls} |"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a compact Cairo audit surface map.")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--scope-file", default="")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-md", required=True)
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    scope_file = Path(args.scope_file).resolve() if args.scope_file else None
    files = _discover_files(repo_root, scope_file)
    payload = {
        "repo_root": repo_root.as_posix(),
        "files": [_analyze_file(repo_root, path) for path in files],
    }
    out_json = Path(args.output_json).resolve()
    out_md = Path(args.output_md).resolve()
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(_render_md(payload), encoding="utf-8")
    print(json.dumps({"files": len(files), "output_json": out_json.as_posix(), "output_md": out_md.as_posix()}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
