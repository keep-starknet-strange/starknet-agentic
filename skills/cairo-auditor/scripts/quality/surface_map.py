#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

try:
    from component_resolution import format_markdown as _format_components
    from component_resolution import resolve_components
except ImportError:  # pragma: no cover - supports package-style execution
    from .component_resolution import format_markdown as _format_components
    from .component_resolution import resolve_components


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
    return {"file": rel, "functions": entries, "components": resolve_components(code)}


def _render_md(payload: dict[str, object]) -> str:
    lines = ["# Cairo Audit Surface Map", ""]
    files = payload.get("files", [])
    if not isinstance(files, list):
        return "\n".join(lines)
    components_by_file = {
        str(file_row.get("file")): file_row.get("components", {})
        for file_row in files
        if isinstance(file_row, dict) and isinstance(file_row.get("components"), dict)
    }
    if components_by_file:
        lines.append(_format_components(components_by_file))
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


# Vector-scan partitions, mirroring references/attack-vectors/attack-vectors-{1..4}.md.
PARTITION_LABELS = {
    1: "Access Control + Upgradeability",
    2: "External Calls + Reentrancy",
    3: "Math + Pricing + Economics",
    4: "Storage + Components + Trust",
}

_ECONOMIC_TOKENS = (
    "fee",
    "price",
    "swap",
    "rate",
    "amount",
    "reward",
    "interest",
    "oracle",
    "mint",
    "burn",
    "collateral",
    "liquidat",
    "debt",
)


def _file_signals(file_row: dict[str, object]) -> dict[str, object]:
    functions = file_row.get("functions", [])
    functions = functions if isinstance(functions, list) else []
    components = file_row.get("components", {})
    components = components if isinstance(components, dict) else {}

    session = any(fn.get("session_hook") for fn in functions if isinstance(fn, dict))
    upgrade = any(fn.get("upgrade_path") for fn in functions if isinstance(fn, dict))
    has_guards = any(fn.get("auth_guards") for fn in functions if isinstance(fn, dict))
    writes = any(fn.get("storage_writes") for fn in functions if isinstance(fn, dict))
    ext_markers: set[str] = set()
    fan_out = 0
    for fn in functions:
        if not isinstance(fn, dict):
            continue
        ext_markers.update(str(m) for m in fn.get("external_calls", []))
        fan_out = max(fan_out, len(fn.get("calls", []) or []))
    names = " ".join(str(fn.get("name", "")) for fn in functions if isinstance(fn, dict)).lower()
    write_fields = " ".join(
        str(w) for fn in functions if isinstance(fn, dict) for w in fn.get("storage_writes", [])
    ).lower()
    economic = any(tok in names or tok in write_fields for tok in _ECONOMIC_TOKENS)
    external_call = bool(
        ext_markers & {"call_contract_syscall", "library_call", "safe_transfer_from", "transfer", "replace_class_syscall"}
    )

    return {
        "session": session,
        "upgrade": upgrade,
        "has_guards": has_guards,
        "writes": writes,
        "external_call": external_call,
        "ext_markers": sorted(ext_markers),
        "economic": economic,
        "fan_out": fan_out,
        "ownable": bool(components.get("ownable")),
        "access_control": bool(components.get("access_control")),
        "upgradeable": bool(components.get("upgradeable")),
    }


def _partition_relevance(signals: dict[str, object]) -> list[int]:
    partitions: set[int] = set()
    if signals["upgrade"] or signals["has_guards"] or signals["ownable"] or signals["access_control"] or signals["upgradeable"]:
        partitions.add(1)
    if signals["external_call"] or signals["session"]:
        partitions.add(2)
    if signals["economic"]:
        partitions.add(3)
    if signals["writes"] or signals["ownable"] or signals["access_control"]:
        partitions.add(4)
    # A file with no resolved signal stays reviewable under every lens rather
    # than being silently orphaned.
    if not partitions:
        partitions = {1, 2, 3, 4}
    return sorted(partitions)


def _complexity_signal(payload: dict[str, object]) -> dict[str, object]:
    files = payload.get("files", [])
    files = files if isinstance(files, list) else []
    score = 0
    reasons: list[str] = []

    def bump(points: int, reason: str) -> None:
        nonlocal score
        score += points
        reasons.append(f"+{points} {reason}")

    sig = [_file_signals(f) for f in files if isinstance(f, dict)]
    if any(s["session"] for s in sig):
        bump(3, "account-abstraction validate/execute hooks present")
    if any(s["external_call"] for s in sig):
        bump(2, "external/cross-contract calls present")
    # Interaction followed by state mutation in the same file is the classic
    # cross-function / CEI surface that pattern scanners miss — this is exactly
    # what the adversarial pass exists to catch.
    if any(s["external_call"] and s["writes"] for s in sig):
        bump(2, "external interaction combined with state mutation")
    if any(s["upgrade"] for s in sig):
        bump(2, "upgrade/replace-class path present")
    if any(s["economic"] for s in sig):
        bump(1, "economic/pricing surface present")
    if any(s["fan_out"] >= 2 for s in sig):
        bump(1, "multi-hop internal call chains present")
    if any(s["access_control"] for s in sig):
        bump(1, "role-based access control present")

    threshold = 3
    return {
        "score": score,
        "threshold": threshold,
        "adversarial_recommended": score >= threshold,
        # Truly trivial scopes (no interaction/auth/upgrade surface at all) are
        # safe to skip; in-between scopes should downgrade the model, not skip.
        "adversarial_action": "full" if score >= threshold else ("skip" if score == 0 else "downgrade"),
        "reasons": reasons or ["no high-complexity signals detected"],
    }


def _build_routing(payload: dict[str, object]) -> dict[str, object]:
    files = payload.get("files", [])
    files = files if isinstance(files, list) else []
    partitions: dict[str, list[int]] = {}
    partition_files: dict[str, list[str]] = {str(i): [] for i in PARTITION_LABELS}
    for file_row in files:
        if not isinstance(file_row, dict):
            continue
        name = str(file_row.get("file"))
        ids = _partition_relevance(_file_signals(file_row))
        partitions[name] = ids
        for i in ids:
            partition_files[str(i)].append(name)
    return {
        "partition_labels": {str(k): v for k, v in PARTITION_LABELS.items()},
        "partitions": partitions,
        "partition_files": partition_files,
        "complexity": _complexity_signal(payload),
    }


def _render_routing_md(routing: dict[str, object]) -> str:
    lines = ["## Routing & Complexity", ""]
    complexity = routing.get("complexity", {})
    if isinstance(complexity, dict):
        rec = "YES" if complexity.get("adversarial_recommended") else "NO"
        lines.append(
            f"- Adversarial pass recommended: **{rec}** "
            f"(score {complexity.get('score')} / threshold {complexity.get('threshold')})"
        )
        for reason in complexity.get("reasons", []):  # type: ignore[union-attr]
            lines.append(f"  - {reason}")
        lines.append("")
    partition_files = routing.get("partition_files", {})
    labels = routing.get("partition_labels", {})
    if isinstance(partition_files, dict):
        lines += ["| Partition | Lens | Relevant files |", "|---|---|---|"]
        for idx in sorted(partition_files, key=lambda x: int(x)):
            files = partition_files[idx]
            shown = ", ".join(f"`{f}`" for f in files[:6]) or "-"
            if isinstance(files, list) and len(files) > 6:
                shown += f" (+{len(files) - 6} more)"
            lines.append(f"| {idx} | {labels.get(idx, '')} | {shown} |")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a compact Cairo audit surface map.")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--scope-file", default="")
    parser.add_argument("--output-json", required=True)
    parser.add_argument("--output-md", required=True)
    parser.add_argument(
        "--output-routing",
        default="",
        help="Optional path to write the partition-routing + complexity JSON (#6/#7).",
    )
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    scope_file = Path(args.scope_file).resolve() if args.scope_file else None
    files = _discover_files(repo_root, scope_file)
    payload: dict[str, object] = {
        "repo_root": repo_root.as_posix(),
        "files": [_analyze_file(repo_root, path) for path in files],
    }
    routing = _build_routing(payload)
    payload["routing"] = routing
    out_json = Path(args.output_json).resolve()
    out_md = Path(args.output_md).resolve()
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    out_md.write_text(_render_md(payload) + "\n" + _render_routing_md(routing), encoding="utf-8")
    if args.output_routing:
        out_routing = Path(args.output_routing).resolve()
        out_routing.parent.mkdir(parents=True, exist_ok=True)
        out_routing.write_text(json.dumps(routing, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "files": len(files),
                "output_json": out_json.as_posix(),
                "output_md": out_md.as_posix(),
                "adversarial_recommended": routing["complexity"]["adversarial_recommended"],
                "complexity_score": routing["complexity"]["score"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
