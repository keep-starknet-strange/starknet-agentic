#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from benchmark_cairo_auditor import DETECTORS
from scan_external_repos import RepoSpec, is_excluded
from sierra_parallel_signal import analyze_repo

# Vulnerability metadata derived from skills/cairo-auditor/references/vulnerability-db/
# and validated against 217 normalized findings from 26 real-world Cairo audits.
VULN_METADATA: dict[str, dict[str, object]] = {
    "NO_ACCESS_CONTROL_MUTATION": {
        "title": "Missing Access Control on Privileged Mutation",
        "severity": "critical",
        "priority": "P0",
        "confidence": 90,
        "description": (
            "Privileged mutation function callable without explicit access control. "
            "Any caller can alter protocol configuration or governance-critical state."
        ),
        "exploit_path": (
            "Attacker calls unprotected set_*/register_*/upgrade function "
            "-> writes privileged storage -> protocol takeover."
        ),
        "recommendation": (
            "Gate privileged mutations with explicit owner/role check. "
            "Example: `assert(get_caller_address() == self.owner.read(), 'NOT_OWNER');`"
        ),
        "minimum_tests": [
            "Unauthorized caller reverts on mutation function",
            "Authorized caller succeeds and state transitions correctly",
        ],
    },
    "CEI_VIOLATION_ERC1155": {
        "title": "Check-Effects-Interactions Violation (ERC1155)",
        "severity": "critical",
        "priority": "P0",
        "confidence": 90,
        "description": (
            "ERC1155 safe_transfer_from (callback-capable) occurs before critical "
            "state updates. Enables reentrancy exploits via malicious receiver callback."
        ),
        "exploit_path": (
            "Attacker deploys malicious ERC1155 receiver -> callback re-enters "
            "before state update -> double-processes order/claim."
        ),
        "recommendation": (
            "Move all state mutations before external calls, or add a reentrancy guard. "
            "Commit effects (status flags, balances) before safe_transfer_from."
        ),
        "minimum_tests": [
            "Malicious callback cannot re-enter and double-process",
            "State committed before interaction or lock blocks recursion",
        ],
    },
    "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK": {
        "title": "Immediate Upgrade Without Timelock",
        "severity": "critical",
        "priority": "P0",
        "confidence": 90,
        "description": (
            "Contract supports direct class-hash upgrade in a single call "
            "without a delay window. No recovery time for users to withdraw."
        ),
        "exploit_path": (
            "Compromised admin calls upgrade() -> replace_class_syscall executes "
            "immediately -> malicious logic deployed -> funds drained."
        ),
        "recommendation": (
            "Implement a timelock pattern: schedule_upgrade() sets pending hash + delay, "
            "execute_upgrade() only after delay expires. Add cancel_upgrade() path."
        ),
        "minimum_tests": [
            "Cannot execute upgrade before delay expires",
            "Can execute only after delay",
            "Cancel path clears pending upgrade",
        ],
    },
    "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD": {
        "title": "Critical Address Initialized Without Non-Zero Guard",
        "severity": "critical",
        "priority": "P0",
        "confidence": 90,
        "description": (
            "Constructor stores privileged addresses (owner, admin, registry) "
            "without non-zero validation. Deploying with zero address permanently "
            "bricks governance."
        ),
        "exploit_path": (
            "Deployer passes zero address for owner/admin -> stored in storage -> "
            "all owner-gated functions become permanently uncallable."
        ),
        "recommendation": (
            "Validate each critical constructor address: "
            "`assert(owner.is_non_zero(), 'ZERO_ADDRESS');`"
        ),
        "minimum_tests": [
            "Constructor reverts when critical address is zero",
            "Constructor succeeds with valid addresses and persists state",
        ],
    },
    "AA-SELF-CALL-SESSION": {
        "title": "Session Key Privilege Escalation via Self-Call",
        "severity": "high",
        "priority": "P1",
        "confidence": 85,
        "description": (
            "Session execution path allows self-calls back to the account contract. "
            "A compromised session key can invoke privileged selectors."
        ),
        "exploit_path": (
            "Compromised session key crafts call with target = own account address "
            "-> bypasses selector denylist -> invokes privileged function."
        ),
        "recommendation": (
            "In __execute__ session path, assert call.to != get_contract_address() "
            "or maintain an explicit denylist of privileged selectors."
        ),
        "minimum_tests": [
            "Session key cannot invoke privileged selector via self-call",
            "Owner path still functions correctly",
        ],
    },
    "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD": {
        "title": "Upgrade Accepts Zero Class Hash",
        "severity": "high",
        "priority": "P1",
        "confidence": 85,
        "description": (
            "Upgrade path accepts new_class_hash without non-zero validation. "
            "Zero hash can trigger undefined behavior or permanent lockout."
        ),
        "exploit_path": (
            "Admin (or attacker if no access control) calls upgrade(0) "
            "-> replace_class_syscall with zero -> undefined state or lockout."
        ),
        "recommendation": (
            "Add non-zero guard before upgrade: "
            "`assert(new_class_hash.is_non_zero(), 'ZERO_CLASS_HASH');`"
        ),
        "minimum_tests": [
            "Upgrade with zero hash reverts",
            "Upgrade with valid hash succeeds under authorized caller",
        ],
    },
    "SHUTDOWN_OVERRIDE_PRECEDENCE": {
        "title": "Shutdown Override Shadowed by Inferred Mode",
        "severity": "high",
        "priority": "P1",
        "confidence": 85,
        "description": (
            "Inferred shutdown mode returns early before explicit fixed override is checked. "
            "Admin override gets permanently shadowed."
        ),
        "exploit_path": (
            "Admin sets fixed shutdown override -> inferred mode triggers first "
            "-> early return bypasses override -> governance intent ignored."
        ),
        "recommendation": (
            "Check fixed_shutdown_mode before infer_shutdown_mode. "
            "Explicit override must take precedence over inferred state."
        ),
        "minimum_tests": [
            "Both inferred + fixed active returns fixed override value",
            "Inferred-only and fixed-only behaviors independently tested",
        ],
    },
    "IRREVOCABLE_ADMIN": {
        "title": "Irrevocable Admin Role",
        "severity": "high",
        "priority": "P1",
        "confidence": 85,
        "description": (
            "Privileged admin/owner initialized but no rotation, transfer, or "
            "revocation path. Key compromise or loss permanently blocks governance."
        ),
        "exploit_path": (
            "Admin key compromised or lost -> no transfer_ownership/rotate function "
            "-> protocol permanently controlled by attacker or bricked."
        ),
        "recommendation": (
            "Add a transfer_ownership or rotate_admin function gated by the current admin. "
            "Consider using OwnableComponent for standard ownership lifecycle."
        ),
        "minimum_tests": [
            "Old admin loses privileges after rotation",
            "New admin gains expected privileges",
            "Unauthorized caller cannot rotate",
        ],
    },
    "ONE_SHOT_REGISTRATION": {
        "title": "One-Shot Registration Without Recovery Path",
        "severity": "high",
        "priority": "P1",
        "confidence": 85,
        "description": (
            "Critical dependency registration is write-once without a safe recovery path. "
            "Wrong first registration permanently bricks integrations."
        ),
        "exploit_path": (
            "Deployer registers wrong address -> write-once guard blocks correction "
            "-> integration permanently broken with no recovery."
        ),
        "recommendation": (
            "Add an authorized update_* or set_* recovery function for the same field, "
            "gated with owner/admin access control."
        ),
        "minimum_tests": [
            "First registration succeeds",
            "Duplicate registration reverts",
            "Authorized recovery/update works",
            "Unauthorized recovery reverts",
        ],
    },
    "FEES_RECIPIENT_ZERO_DOS": {
        "title": "Fee Recipient Zero-Address Denial of Service",
        "severity": "high",
        "priority": "P1",
        "confidence": 85,
        "description": (
            "Fee recipient set without non-zero guard and used in payout paths. "
            "Zero recipient causes distribution functions to revert."
        ),
        "exploit_path": (
            "Admin (or attacker) sets fees_recipient to zero -> payout/report function "
            "calls transfer(zero) -> reverts -> all fee distributions blocked."
        ),
        "recommendation": (
            "Add non-zero validation when setting fees_recipient: "
            "`assert(recipient.is_non_zero(), 'ZERO_RECIPIENT');`"
        ),
        "minimum_tests": [
            "Setting zero recipient reverts",
            "Payout succeeds for valid recipient",
            "Recipient change preserves flow invariants",
        ],
    },
    "UNCHECKED_FEE_BOUND": {
        "title": "Fee Parameter Without Bounds Validation",
        "severity": "medium",
        "priority": "P2",
        "confidence": 80,
        "description": (
            "Caller-provided fee/rate parameter forwarded to storage without range "
            "validation. Out-of-bounds values break protocol economics."
        ),
        "exploit_path": (
            "Caller passes fee_bps = 10001 (>100%) -> stored without check "
            "-> subsequent operations compute impossible fees -> fund loss or revert."
        ),
        "recommendation": (
            "Add bounds assertion: `assert(fee_bps <= MAX_FEE_BPS, 'FEE_TOO_HIGH');` "
            "where MAX_FEE_BPS is the protocol ceiling (e.g. 10_000 for 100%)."
        ),
        "minimum_tests": [
            "Max allowed fee succeeds",
            "Max+1 reverts",
            "Zero-fee behavior explicitly asserted",
        ],
    },
    "SYSCALL_SELECTOR_FALLBACK_ASSUMPTION": {
        "title": "Syscall Selector Fallback Masks Compatibility Bugs",
        "severity": "medium",
        "priority": "P2",
        "confidence": 80,
        "description": (
            "Code retries call_contract_syscall with alternate selector casing on error. "
            "Masks real compatibility bugs by silently falling back."
        ),
        "exploit_path": (
            "First syscall fails -> fallback with different selector succeeds -> "
            "real integration incompatibility hidden -> breaks on registry changes."
        ),
        "recommendation": (
            "Remove fallback retry. Use the canonical selector and let failures "
            "surface deterministically."
        ),
        "minimum_tests": [
            "Failing syscall reverts deterministically (no fallback)",
            "Successful canonical selector returns expected result",
        ],
    },
    "CONSTRUCTOR_DEAD_PARAM": {
        "title": "Constructor Accepts Unused Parameter",
        "severity": "medium",
        "priority": "P2",
        "confidence": 80,
        "description": (
            "Constructor accepts a security-critical parameter that is never used. "
            "Creates misleading API surface and can hide misconfiguration."
        ),
        "exploit_path": (
            "Deployer passes address/hash parameter expecting it to be stored "
            "-> parameter silently ignored -> contract misconfigured from deployment."
        ),
        "recommendation": (
            "Remove unused constructor parameters, or wire them to storage/init. "
            "Constructor ABI should match actual required initialization."
        ),
        "minimum_tests": [
            "Constructor ABI matches actual required initialization",
            "Deployment rejects stale constructor argument formats",
        ],
    },
}

_SEVERITY_ORDER = ("critical", "high", "medium", "low", "info")
_SEVERITY_LABELS = {
    "critical": "Critical",
    "high": "High",
    "medium": "Medium",
    "low": "Low",
    "info": "Info",
}


def _find_relevant_line(code: str, class_id: str) -> int | None:
    """Return a best-effort 1-based line number for the vulnerable construct.

    The matcher is intentionally heuristic and may return the first matching
    construct in the file rather than the exact vulnerable call-site.
    """
    line_patterns: dict[str, list[str]] = {
        "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD": [r"\bfn\s+constructor\b"],
        "CONSTRUCTOR_DEAD_PARAM": [r"\bfn\s+constructor\b"],
        "IRREVOCABLE_ADMIN": [r"\bfn\s+constructor\b"],
        "NO_ACCESS_CONTROL_MUTATION": [
            r"\bfn\s+(?:set_|register_|upgrade|pause|unpause|configure_|grant_|revoke_)",
        ],
        "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK": [r"\bfn\s+upgrade\s*\("],
        "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD": [r"\bfn\s+upgrade\s*\("],
        "CEI_VIOLATION_ERC1155": [r"\bsafe_transfer_from\b"],
        "AA-SELF-CALL-SESSION": [r"\bfn\s+__execute__\b"],
        "UNCHECKED_FEE_BOUND": [r"\b(?:swap_fee|fee_bps)\b"],
        "SHUTDOWN_OVERRIDE_PRECEDENCE": [r"\binfer_shutdown_mode\b"],
        "SYSCALL_SELECTOR_FALLBACK_ASSUMPTION": [r"\bcall_contract_syscall\b"],
        "ONE_SHOT_REGISTRATION": [r"\bfn\s+register_"],
        "FEES_RECIPIENT_ZERO_DOS": [r"\bfees_recipient\b"],
    }
    lines = code.splitlines()
    for pattern in line_patterns.get(class_id, []):
        for i, line in enumerate(lines, 1):
            if re.search(pattern, line, re.IGNORECASE):
                return i
    return None


def _md_escape_path(path: str) -> str:
    """Escape file paths for markdown table/code contexts."""
    return path.replace("|", "&#124;").replace("`", "'").replace("\n", " ").replace("\r", " ")


def _md_escape_cell(value: str) -> str:
    """Escape generic markdown table cell content."""
    return (
        value.replace("|", "&#124;")
        .replace("`", "'")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\n", " ")
        .replace("\r", " ")
    )


def _md_escape_text(value: str) -> str:
    """Escape markdown control chars in paragraph/list text.

    Preserves inline code spans wrapped in backticks so code formatting is not
    corrupted by escaping characters like `_` inside `` `...` `` blocks.
    """

    def _escape_plain(segment: str) -> str:
        return (
            segment.replace("\\", "\\\\")
            .replace("`", "\\`")
            .replace("*", "\\*")
            .replace("_", "\\_")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("[", "\\[")
            .replace("]", "\\]")
            .replace("\n", " ")
            .replace("\r", " ")
        )

    if "`" not in value:
        return _escape_plain(value)

    escaped_parts: list[str] = []
    idx = 0
    while idx < len(value):
        if value[idx] != "`":
            next_tick = value.find("`", idx)
            if next_tick == -1:
                next_tick = len(value)
            escaped_parts.append(_escape_plain(value[idx:next_tick]))
            idx = next_tick
            continue

        # Preserve only paired inline-code spans; treat dangling backticks as plain text.
        end_tick = value.find("`", idx + 1)
        if end_tick == -1:
            escaped_parts.append(_escape_plain(value[idx]))
            idx += 1
            continue

        code = value[idx + 1 : end_tick].replace("\n", " ").replace("\r", " ")
        escaped_parts.append(f"`{code}`")
        idx = end_tick + 1

    return "".join(escaped_parts)


def _md_escape_heading(value: str) -> str:
    """Escape markdown heading text for predictable rendering."""
    return (
        value.replace("\\", "\\\\")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("\n", " ")
        .replace("\r", " ")
    )


def _safe_int(value: object, default: int = 0) -> int:
    """Best-effort integer conversion for optional/partial payloads."""
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default


def _existing_dir(value: str) -> Path:
    path = Path(value).resolve()
    if not path.exists() or not path.is_dir():
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


def _slug(value: str) -> str:
    lowered = value.strip().lower()
    safe = []
    for ch in lowered:
        if ch.isalnum() or ch in ("-", "_"):
            safe.append(ch)
        else:
            safe.append("-")
    normalized = "".join(safe).strip("-")
    normalized = re.sub(r"-{2,}", "-", normalized)
    return normalized or "local-cairo-audit"


def _resolve_path(raw: str, base: Path) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate.resolve()
    return (base / candidate).resolve()


def _next_available_stem(
    output_dir: Path,
    base_stem: str,
    fallback_suffixes: list[str],
    *,
    max_attempts: int = 10_000,
) -> tuple[str, Path]:
    idx = 0
    while idx < max_attempts:
        candidate = base_stem if idx == 0 else f"{base_stem}-{idx}"
        lock_path = output_dir / f".{candidate}.lock"
        try:
            lock_path.touch(exist_ok=False)
        except FileExistsError:
            idx += 1
            continue
        if all(not (output_dir / f"{candidate}{suffix}").exists() for suffix in fallback_suffixes):
            return candidate, lock_path
        lock_path.unlink(missing_ok=True)
        idx += 1
    raise RuntimeError(
        f"could not allocate unique output stem after {max_attempts} attempts: {base_stem}"
    )


def _write_text_output(path: Path, content: str, *, overwrite: bool) -> None:
    mode = "w" if overwrite else "x"
    with path.open(mode, encoding="utf-8") as handle:
        handle.write(content)


def _render_findings_jsonl(findings: list[dict[str, object]]) -> str:
    if not findings:
        return ""
    return "".join(json.dumps(row, ensure_ascii=True) + "\n" for row in findings)


def _scan_local(repo_root: Path, repo_slug: str, ref: str, excluded_markers: tuple[str, ...]) -> tuple[dict[str, object], list[dict[str, object]]]:
    repo_resolved = repo_root.resolve()
    all_files: list[Path] = []
    for path in sorted(repo_root.rglob("*.cairo")):
        if path.is_symlink():
            continue
        resolved = path.resolve()
        try:
            resolved.relative_to(repo_resolved)
        except ValueError:
            continue
        all_files.append(path)
    prod_files = [p for p in all_files if not is_excluded(p, excluded_markers)]

    findings: list[dict[str, object]] = []
    for file_path in prod_files:
        rel = file_path.relative_to(repo_root).as_posix()
        try:
            code = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            print(
                f"WARNING: utf-8 decode fallback for {rel}; using errors='ignore' ({exc})",
                file=sys.stderr,
            )
            code = file_path.read_text(encoding="utf-8", errors="ignore")

        for class_id, detector in DETECTORS.items():
            if detector(code):
                meta = VULN_METADATA.get(class_id)
                if not meta:
                    print(
                        "WARNING: missing VULN_METADATA for "
                        + f"class_id={class_id} repo={repo_slug} ref={ref} file={rel}",
                        file=sys.stderr,
                    )
                    meta = {}
                line_number = _find_relevant_line(code, class_id)
                findings.append(
                    {
                        "repo": repo_slug,
                        "ref": ref,
                        "file": rel,
                        "class_id": class_id,
                        "scope": "prod_scan",
                        "severity": meta.get("severity", "info"),
                        "priority": meta.get("priority", "P3"),
                        "confidence": meta.get("confidence", 75),
                        "title": meta.get("title", class_id),
                        "description": meta.get("description", ""),
                        "exploit_path": meta.get("exploit_path", ""),
                        "recommendation": meta.get("recommendation", ""),
                        "minimum_tests": meta.get("minimum_tests", []),
                        "line": line_number,
                    }
                )

    summary = {
        "repo": repo_slug,
        "ref": ref,
        "repo_root": repo_root.as_posix(),
        "all_cairo_files": len(all_files),
        "prod_cairo_files": len(prod_files),
        "prod_hits": len(findings),
    }
    return summary, findings


def _render_sierra_md(sierra: dict[str, object]) -> list[str]:
    """Render Sierra confirmation section as markdown lines."""
    projects_built = _safe_int(sierra.get("projects_built", 0), default=0)
    projects_total = _safe_int(sierra.get("projects_total", 0), default=0)
    artifacts = _safe_int(sierra.get("artifacts", 0), default=0)
    lines: list[str] = [
        "## Sierra Confirmation",
        "",
        "Sierra IR used as auxiliary confirmation for selected source-level classes.",
        "",
        f"- Projects built/total: {projects_built}/{projects_total}",
        f"- Artifacts parsed: {artifacts}",
    ]
    rc = sierra.get("marker_counts", {})
    fn = sierra.get("function_signals", {})
    lines.append(f"- Replace-class markers: {rc.get('replace_class_syscall', 0) if isinstance(rc, dict) else 0}")
    lines.append(f"- External->write ordering: {fn.get('functions_external_then_write', 0) if isinstance(fn, dict) else 0}")
    conf = sierra.get("confirmation", {})
    if isinstance(conf, dict):
        u = "confirm" if conf.get("upgrade_ir_confirmed") else ("missing" if conf.get("upgrade_findings") else "—")
        c = "confirm" if conf.get("cei_ir_confirmed") else ("missing" if conf.get("cei_findings") else "—")
        lines += [f"- Upgrade oracle: {u}", f"- CEI oracle: {c}"]
        cei_examples = conf.get("cei_example_functions")
        if isinstance(cei_examples, (list, tuple)) and cei_examples:
            fns = ", ".join(f"`{_md_escape_path(str(f))}`" for f in cei_examples)
            lines.append(f"- CEI candidate functions: {fns}")
    errors_raw = sierra.get("errors")
    errors = errors_raw if isinstance(errors_raw, (list, tuple)) else []
    for err in errors:
        escaped_err = _md_escape_text(str(err))
        lines.append(f"- Error: {escaped_err}")
    lines.append("")
    return lines


def _render_markdown(
    *,
    scan_id: str,
    generated_at: str,
    summary: dict[str, object],
    findings: list[dict[str, object]],
    sierra: dict[str, object] | None,
) -> str:
    lines: list[str] = []
    max_findings_rows = 250
    repo_name = _md_escape_heading(str(summary.get("repo", "unknown")))

    # Header
    lines.append(f"# Security Review — {repo_name}")
    lines.append("")

    # Scope table
    hit_files = sorted({str(f.get("file", "")) for f in findings})
    max_scope_files = 25
    shown_hit_files = hit_files[:max_scope_files]
    files_str = " · ".join(f"`{_md_escape_path(f)}`" for f in shown_hit_files) if shown_hit_files else "—"
    if len(hit_files) > max_scope_files:
        files_str += f" · ... (+{len(hit_files) - max_scope_files} more)"
    lines += [
        "## Scope", "",
        "| Aspect | Value |",
        "|--------|-------|",
        f"| **Scan ID** | `{_md_escape_cell(scan_id)}` |",
        "| **Mode** | deterministic (regex-based detectors) |",
        f"| **Files reviewed** | {summary.get('prod_cairo_files', 0)} prod ({summary.get('all_cairo_files', 0)} total) |",
        f"| **Files with findings** | {files_str} |",
        "| **Line mapping** | best-effort (first regex match per class) |",
        "| **Confidence threshold** | 75 |",
        f"| **Generated** | {generated_at} |",
        f"| **Commit** | `{_md_escape_cell(str(summary.get('ref', 'unknown')))}` |",
        "",
    ]

    # Severity summary
    sev_counts: dict[str, int] = {}
    for f in findings:
        sev = str(f.get("severity", "info")).lower()
        sev_counts[sev] = sev_counts.get(sev, 0) + 1
    known_severity_set = set(_SEVERITY_ORDER)
    unknown_count = sum(count for sev, count in sev_counts.items() if sev not in known_severity_set)
    total = sum(sev_counts.values())
    lines += ["## Summary", "", "| Severity | Count |", "|----------|------:|"]
    for sev in _SEVERITY_ORDER:
        count = sev_counts.get(sev, 0)
        if count > 0:
            lines.append(f"| {_SEVERITY_LABELS.get(sev, sev)} | {count} |")
    if unknown_count > 0:
        lines.append(f"| Other/Unknown | {unknown_count} |")
    lines += [f"| **Total** | **{total}** |", ""]

    sorted_findings: list[dict[str, object]] = []

    # Findings grouped by severity
    if findings:
        lines += ["## Findings", ""]
        finding_num = 0
        severity_rank = {sev: i for i, sev in enumerate(_SEVERITY_ORDER)}
        sorted_findings = sorted(
            findings,
            key=lambda x: (
                severity_rank.get(str(x.get("severity", "info")).lower(), len(_SEVERITY_ORDER)),
                str(x.get("title", x.get("class_id", "Unknown"))),
            ),
        )
        detailed_findings = sorted_findings[:max_findings_rows]
        if len(sorted_findings) > max_findings_rows:
            remaining = len(sorted_findings) - max_findings_rows
            lines.append(f"_Showing first {max_findings_rows} findings ({remaining} omitted)._")
            lines.append("")

        def _append_finding_entry(finding: dict[str, object], idx: int) -> int:
            idx += 1
            priority = _md_escape_heading(str(finding.get("priority", "P3")))
            title = _md_escape_heading(str(finding.get("title", finding.get("class_id", "Unknown"))))
            confidence = _safe_int(finding.get("confidence", 75), default=75)
            file_path = finding.get("file", "")
            line_num = finding.get("line")
            safe_path = _md_escape_path(str(file_path))
            location = f"`{safe_path}:{line_num}`" if line_num else f"`{safe_path}`"
            cid = _md_escape_path(str(finding.get("class_id", "")))

            lines.extend(
                [
                    f"#### [{priority}] {idx}. {title}",
                    "",
                    f"`{cid}` · {location} · Confidence: {confidence}",
                    "",
                ]
            )
            desc = _md_escape_text(str(finding.get("description", "")))
            if desc:
                lines.extend(["**Description**", desc, ""])
            exploit = _md_escape_text(str(finding.get("exploit_path", "")))
            if exploit:
                lines.extend(["**Exploit Path**", exploit, ""])
            rec = _md_escape_text(str(finding.get("recommendation", "")))
            if rec and confidence >= 75:
                lines.extend(["**Recommendation**", rec, ""])
            tests_raw = finding.get("minimum_tests", [])
            tests = tests_raw if isinstance(tests_raw, (list, tuple)) else []
            if tests and confidence >= 75:
                lines.append("**Required Tests**")
                for t in tests:
                    lines.append(f"- {_md_escape_text(str(t))}")
                lines.append("")
            lines.extend(["---", ""])
            return idx

        for sev in _SEVERITY_ORDER:
            sev_findings = [f for f in detailed_findings if str(f.get("severity", "info")).lower() == sev]
            if not sev_findings:
                continue
            lines += [f"### {_SEVERITY_LABELS.get(sev, sev)}", ""]
            for f in sev_findings:
                finding_num = _append_finding_entry(f, finding_num)

        unknown_findings = [f for f in detailed_findings if str(f.get("severity", "info")).lower() not in known_severity_set]
        if unknown_findings:
            lines += ["### Other/Unknown", ""]
            for f in unknown_findings:
                finding_num = _append_finding_entry(f, finding_num)

    # Sierra confirmation
    if sierra:
        lines += _render_sierra_md(sierra)

    # Findings index
    if findings:
        lines += ["## Findings Index", "", "| # | Severity | Confidence | Title |",
                  "|--:|----------|----------:|------|"]
        idx = 0
        for f in sorted_findings[:max_findings_rows]:
            idx += 1
            sev_key = str(f.get("severity", "info")).lower()
            sev = _SEVERITY_LABELS.get(sev_key, "Other/Unknown")
            conf = _safe_int(f.get("confidence", 75), default=75)
            title = _md_escape_cell(str(f.get("title", f.get("class_id", "Unknown"))))
            lines.append(f"| {idx} | {sev} | {conf} | {title} |")
        if len(sorted_findings) > max_findings_rows:
            remaining = len(sorted_findings) - max_findings_rows
            lines.append(f"| ... | ... | ... | ... ({remaining} more findings omitted) |")
        lines.append("")

    # Disclaimer
    lines += [
        "---", "",
        (
            "> **Disclaimer:** This review was performed by deterministic regex-based "
            "detectors. Deterministic scanning catches known vulnerability patterns "
            "reliably but cannot reason about novel logic bugs, cross-contract "
            "composability, or economic exploits. For comprehensive coverage, combine "
            "with the full `cairo-auditor` skill (4-vector parallel analysis + "
            "adversarial reasoning) and manual expert review. "
            "Works best on codebases under 5,000 lines of Cairo."
        ),
        "",
    ]

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Scan a local Cairo repo with deterministic detectors and optional Sierra confirmation. "
            "Exit codes: 0 for success, 2 when findings exist and --fail-on-findings is set."
        )
    )
    parser.add_argument("--repo-root", type=_existing_dir, default=Path(".").resolve())
    parser.add_argument("--scan-id", default="local-cairo-audit")
    parser.add_argument("--exclude", default="test,tests,mock,mocks,example,examples,preset,presets,fixture,fixtures,vendor,vendors")
    parser.add_argument(
        "--output-dir",
        default="evals/reports/local",
        help="Directory for generated reports when explicit output files are not provided (relative paths resolve from --repo-root).",
    )
    parser.add_argument(
        "--output-json",
        default="",
        help="Write JSON report to this path (relative paths resolve from --repo-root). Defaults to output-dir.",
    )
    parser.add_argument(
        "--output-md",
        default="",
        help="Write Markdown report to this path (relative paths resolve from --repo-root). Defaults to output-dir.",
    )
    parser.add_argument(
        "--output-findings-jsonl",
        default="",
        help="Write findings JSONL to this path (relative paths resolve from --repo-root).",
    )
    parser.add_argument(
        "--write-findings-jsonl",
        action="store_true",
        help="Write findings JSONL to output-dir when --output-findings-jsonl is not set.",
    )
    parser.add_argument("--sierra-confirm", action="store_true", help="Run Sierra confirmation layer on this repo.")
    parser.add_argument(
        "--allow-build",
        action="store_true",
        help="Allow scarb build in Sierra confirmation mode.",
    )
    parser.add_argument(
        "--scarb-timeout-seconds",
        type=float,
        default=240,
        help="Timeout budget for each scarb metadata/build command in Sierra confirmation mode.",
    )
    parser.add_argument(
        "--fail-on-findings",
        action="store_true",
        help="Exit with code 2 when findings are present.",
    )
    args = parser.parse_args()

    repo_root = args.repo_root

    repo_slug = repo_root.name
    ref = _git_head(repo_root)
    excluded_markers = tuple(s.strip().lower() for s in args.exclude.split(",") if s.strip())
    generated_at = datetime.now(UTC).replace(microsecond=0)
    stamp = generated_at.strftime("%Y%m%dT%H%M%SZ")
    safe_scan_id = _slug(args.scan_id)
    default_stem = f"{safe_scan_id}-{stamp}"

    output_dir = _resolve_path(args.output_dir, repo_root)
    # Setting --output-findings-jsonl implies --write-findings-jsonl.
    write_findings_jsonl = bool(args.output_findings_jsonl) or args.write_findings_jsonl
    # Only create output_dir when at least one output path falls back to it.
    uses_output_dir = (not args.output_json) or (not args.output_md) or (write_findings_jsonl and not args.output_findings_jsonl)
    if uses_output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)

    fallback_suffixes: list[str] = []
    if not args.output_json:
        fallback_suffixes.append(".json")
    if not args.output_md:
        fallback_suffixes.append(".md")
    if write_findings_jsonl and not args.output_findings_jsonl:
        fallback_suffixes.append(".findings.jsonl")
    lock_path: Path | None = None
    if fallback_suffixes:
        stem, lock_path = _next_available_stem(output_dir, default_stem, fallback_suffixes)
    else:
        stem = default_stem

    out_json = _resolve_path(args.output_json, repo_root) if args.output_json else (output_dir / f"{stem}.json")
    out_md = _resolve_path(args.output_md, repo_root) if args.output_md else (output_dir / f"{stem}.md")
    json_explicit = bool(args.output_json)
    md_explicit = bool(args.output_md)
    jsonl_explicit = bool(args.output_findings_jsonl)
    out_jsonl: Path | None = None
    if write_findings_jsonl:
        out_jsonl = (
            _resolve_path(args.output_findings_jsonl, repo_root)
            if jsonl_explicit
            else (output_dir / f"{stem}.findings.jsonl")
        )

    resolved_outputs: list[tuple[str, Path]] = [("json", out_json), ("md", out_md)]
    if out_jsonl is not None:
        resolved_outputs.append(("findings_jsonl", out_jsonl))
    by_path: dict[Path, list[str]] = {}
    for label, path in resolved_outputs:
        by_path.setdefault(path, []).append(label)
    duplicates = {path: labels for path, labels in by_path.items() if len(labels) > 1}
    if duplicates:
        detail = "; ".join(
            f"{path.as_posix()}: {', '.join(labels)}" for path, labels in duplicates.items()
        )
        if lock_path:
            lock_path.unlink(missing_ok=True)
            lock_path = None
        parser.error(f"output paths must be distinct ({detail})")
    if json_explicit and out_json.exists():
        if lock_path:
            lock_path.unlink(missing_ok=True)
            lock_path = None
        parser.error(f"explicit JSON output path already exists: {out_json.as_posix()}")
    if md_explicit and out_md.exists():
        if lock_path:
            lock_path.unlink(missing_ok=True)
            lock_path = None
        parser.error(f"explicit Markdown output path already exists: {out_md.as_posix()}")
    if out_jsonl is not None and jsonl_explicit and out_jsonl.exists():
        if lock_path:
            lock_path.unlink(missing_ok=True)
            lock_path = None
        parser.error(f"explicit findings JSONL path already exists: {out_jsonl.as_posix()}")

    try:
        summary, findings = _scan_local(repo_root, repo_slug, ref, excluded_markers)
        class_counts = Counter(str(row["class_id"]) for row in findings)

        sierra_payload: dict[str, object] | None = None
        if args.sierra_confirm:
            signal = analyze_repo(
                spec=RepoSpec(slug=repo_slug, ref=None),
                repo_dir=repo_root,
                ref=ref,
                allow_build=args.allow_build,
                detector_class_counts={repo_slug: class_counts},
                scarb_timeout_s=args.scarb_timeout_seconds,
            )
            sierra_payload = {
                "projects_total": signal.projects_total,
                "projects_built": signal.projects_built,
                "projects_failed": signal.projects_failed,
                "artifacts": signal.artifacts,
                "artifact_breakdown": signal.artifact_breakdown,
                "marker_counts": signal.marker_counts,
                "function_signals": signal.function_signals,
                "signal_flags": signal.signal_flags,
                "confirmation": signal.confirmation,
                "errors": signal.errors,
            }

        generated_at_iso = generated_at.isoformat()
        severity_counts = Counter(str(row.get("severity", "info")).lower() for row in findings)
        payload: dict[str, object] = {
            "scan_id": args.scan_id,
            "generated_at": generated_at_iso,
            "summary": summary,
            "class_counts": dict(class_counts),
            "severity_counts": dict(severity_counts),
            "findings": findings,
            "sierra_confirmation": sierra_payload,
        }
        sierra_gate_findings = 0
        sierra_gate_reasons: list[str] = []
        if sierra_payload:
            confirmation = sierra_payload.get("confirmation", {})
            if isinstance(confirmation, dict):
                if bool(confirmation.get("upgrade_ir_missing")):
                    sierra_gate_findings += 1
                    sierra_gate_reasons.append("upgrade_ir_missing")
                if bool(confirmation.get("cei_ir_missing")):
                    sierra_gate_findings += 1
                    sierra_gate_reasons.append("cei_ir_missing")

        out_json.parent.mkdir(parents=True, exist_ok=True)
        out_md.parent.mkdir(parents=True, exist_ok=True)

        _write_text_output(
            out_json,
            json.dumps(payload, indent=2, ensure_ascii=True) + "\n",
            overwrite=json_explicit,
        )
        _write_text_output(
            out_md,
            _render_markdown(
                scan_id=args.scan_id,
                generated_at=generated_at_iso,
                summary=summary,
                findings=findings,
                sierra=sierra_payload,
            ),
            overwrite=md_explicit,
        )

        if out_jsonl:
            out_jsonl.parent.mkdir(parents=True, exist_ok=True)
            _write_text_output(
                out_jsonl,
                _render_findings_jsonl(findings),
                overwrite=False,
            )

        print(
            json.dumps(
                {
                    "scan_id": args.scan_id,
                    "repo_root": repo_root.as_posix(),
                    "findings": len(findings),
                    "class_counts": dict(class_counts),
                    "severity_counts": dict(severity_counts),
                    "output_json": out_json.as_posix(),
                    "output_md": out_md.as_posix(),
                    "output_findings_jsonl": out_jsonl.as_posix() if out_jsonl else None,
                    "sierra_gate_findings": sierra_gate_findings,
                    "sierra_gate_reasons": sierra_gate_reasons,
                },
                ensure_ascii=True,
            )
        )

        if args.fail_on_findings and (findings or sierra_gate_findings):
            print(
                "audit gate: "
                + f"{len(findings)} source finding(s), {sierra_gate_findings} Sierra gap finding(s) "
                + f"detected - exit 2 (see {out_json.as_posix()})",
                file=sys.stderr,
            )
            return 2
        return 0
    except FileExistsError as exc:
        parser.error(f"output path already exists: {Path(exc.filename or '').as_posix()}")
    finally:
        if lock_path:
            lock_path.unlink(missing_ok=True)


if __name__ == "__main__":
    raise SystemExit(main())
