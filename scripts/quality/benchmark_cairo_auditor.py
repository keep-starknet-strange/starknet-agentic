#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class Case:
    case_id: str
    class_id: str
    expected_detect: bool
    source: str
    source_url: str | None
    code: str


def _strip_line_comments(text: str) -> str:
    return re.sub(r"//[^\n]*", "", text)


def load_cases(path: Path) -> list[Case]:
    cases: list[Case] = []
    seen_case_ids: set[str] = set()
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        raw = json.loads(line)
        if not isinstance(raw, dict):
            raise ValueError(f"line {i}: case must be object")
        required = {"case_id", "class_id", "expected_detect", "source", "code"}
        missing = required - set(raw.keys())
        if missing:
            raise ValueError(f"line {i}: missing keys: {sorted(missing)}")
        if not isinstance(raw["expected_detect"], bool):
            raise ValueError(f"line {i}: expected_detect must be bool")
        for key in ("case_id", "class_id", "source", "code"):
            if not isinstance(raw[key], str):
                raise ValueError(f"line {i}: {key} must be string")
        if raw["case_id"] in seen_case_ids:
            raise ValueError(f"line {i}: duplicate case_id: {raw['case_id']}")
        seen_case_ids.add(raw["case_id"])
        if raw.get("source_url") is not None and not isinstance(raw["source_url"], str):
            raise ValueError(f"line {i}: source_url must be string when present")
        cases.append(
            Case(
                case_id=raw["case_id"],
                class_id=raw["class_id"],
                expected_detect=raw["expected_detect"],
                source=raw["source"],
                source_url=raw.get("source_url"),
                code=raw["code"],
            )
        )
    return cases


def display_path(path: Path, root: Path) -> Path:
    try:
        return path.relative_to(root)
    except ValueError:
        return path


def detect_aa_self_call_session(code: str) -> bool:
    lower = code.lower()
    if "__execute__" not in lower and "session" not in lower:
        return False
    if "call_contract_syscall" not in lower:
        return False
    self_guard_patterns = [
        r"call\.to\s*!=\s*starknet::get_contract_address\(\)",
        r"call\.to\s*!=\s*self",
        r"if\s+\*?call\.to\s*==\s*starknet::get_contract_address\(\)\s*\{[\s\S]{0,120}(panic|assert|revert)",
    ]
    for pattern in self_guard_patterns:
        if re.search(pattern, lower):
            return False
    return True


def detect_unchecked_fee_bound(code: str) -> bool:
    lower = code.lower()
    if "fee" not in lower:
        return False
    if "swap_fee" not in lower and "fee_bps" not in lower:
        return False

    has_forward = bool(
        re.search(r"(swap_fee|fee_bps)\s*\.into\(\)", lower)
        or re.search(r"\.write\((swap_fee|fee_bps)\)", lower)
        or re.search(r"\blet\s+\w+\s*=\s*(swap_fee|fee_bps)\b", lower)
        or re.search(r"\b(array!|vec!\s*\[)[^\n]*(swap_fee|fee_bps)", lower)
    )
    has_bound = bool(
        re.search(r"assert!?\b[^;\n]{0,220}(swap_fee|fee_bps)[^;\n]{0,220}(<=|<)", lower)
        or re.search(r"(swap_fee|fee_bps)\s*(<=|<)\s*(max|10_?000|10000|2_?000|2000)", lower)
        or re.search(r"(swap_fee|fee_bps)\s*\.into\(\)\s*(<=|<)", lower)
    )
    return has_forward and not has_bound


def detect_shutdown_override_precedence(code: str) -> bool:
    lower = code.lower()
    if "infer_shutdown_mode" not in lower or "fixed_shutdown_mode" not in lower:
        return False

    infer_pos = lower.find("infer_shutdown_mode")
    fixed_pos = lower.find("fixed_shutdown_mode")
    infer_early_return = bool(
        re.search(r"infer_shutdown_mode[\s\S]{0,220}if[\s\S]{0,120}return", lower)
    )
    fixed_first = fixed_pos != -1 and infer_pos != -1 and fixed_pos < infer_pos
    return infer_early_return and not fixed_first


def detect_selector_fallback_assumption(code: str) -> bool:
    lower = code.lower()
    if "is_err" not in lower:
        return False
    pattern = re.compile(
        r"call_contract_syscall\([^)]*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,[^)]*\)"
        r"[\s\S]{0,260}if\s*\(?\s*result\.is_err\(\)\s*\)?\s*\{"
        r"[\s\S]{0,260}call_contract_syscall\([^)]*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*,",
        re.IGNORECASE,
    )
    for first_selector, second_selector in pattern.findall(code):
        if first_selector != second_selector and (
            first_selector.lower().startswith("selector_")
            or second_selector.lower().startswith("selector_")
        ):
            return True
    return False


def _upgrade_snippets(lower: str) -> list[str]:
    if not _is_publicly_reachable(lower, "upgrade"):
        return []

    snippets: list[str] = []
    for match in re.finditer(r"fn\s+upgrade\s*\(", lower):
        start = max(0, match.start() - 1200)
        end = min(len(lower), match.start() + 2200)
        snippets.append(lower[start:end])
    return snippets


def _iter_functions(lower: str) -> list[tuple[str, str, str]]:
    # Parse function signatures with balanced parentheses to avoid truncating nested tuple types.
    functions: list[tuple[str, str, str]] = []
    for match in re.finditer(
        r"\bfn\s+([a-z_][a-z0-9_]*)\s*(?:<[^>\n]*>)?\s*\(",
        lower,
        flags=re.IGNORECASE,
    ):
        fn_name = match.group(1)
        signature_start = match.end() - 1  # points to '('
        i = signature_start
        sig_depth = 0
        while i < len(lower):
            ch = lower[i]
            if ch == "(":
                sig_depth += 1
            elif ch == ")":
                sig_depth -= 1
                if sig_depth == 0:
                    break
            i += 1
        if sig_depth != 0:
            continue
        signature_end = i
        signature = lower[signature_start + 1 : signature_end]

        body_open = signature_end + 1
        while body_open < len(lower) and lower[body_open].isspace():
            body_open += 1
        if lower[body_open : body_open + 2] == "->":
            body_open += 2
            while body_open < len(lower) and lower[body_open] != "{":
                body_open += 1
        elif lower[body_open : body_open + 5] == "where":
            body_open += 5
            while body_open < len(lower) and lower[body_open] != "{":
                body_open += 1
        while body_open < len(lower) and lower[body_open].isspace():
            body_open += 1
        if body_open >= len(lower) or lower[body_open] != "{":
            continue

        body_start = body_open + 1
        depth = 1
        j = body_start
        while j < len(lower) and depth > 0:
            ch = lower[j]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
            j += 1
        if depth != 0:
            continue
        functions.append((fn_name, signature, lower[body_start : j - 1]))
    return functions


def _extract_fn_signature_and_body(lower: str, fn_name: str) -> tuple[str | None, str | None]:
    for name, signature, body in _iter_functions(lower):
        if name.lower() == fn_name.lower():
            return signature, body
    return None, None


def _has_nonzero_class_hash_guard(snippet: str) -> bool:
    return bool(
        re.search(r"assert!?\([^)]*new_class_hash[^)]*is_non_zero", snippet)
        or re.search(r"assert!?\([^)]*new_class_hash[^)]*!=\s*0", snippet)
        or re.search(r"assert!?\([^)]*!\s*new_class_hash\.is_zero\(\)", snippet)
        or re.search(r"assert!?\([^)]*new_class_hash\.is_zero\(\)[^)]*==\s*false", snippet)
        or re.search(r"if\s*\([^)]*new_class_hash[^)]*is_non_zero", snippet)
        or re.search(r"if\s*\([^)]*new_class_hash[^)]*!=\s*0", snippet)
        or re.search(r"if\s*\([^)]*new_class_hash\.is_zero\(\)\s*\)\s*\{[\s\S]{0,180}(panic|assert|revert)", snippet)
        or re.search(r"if\s+new_class_hash[^:\n]{0,80}is_non_zero", snippet)
        or re.search(r"if\s+new_class_hash[^:\n]{0,80}!=\s*0", snippet)
    )


def detect_immediate_upgrade_without_timelock(code: str) -> bool:
    lower = code.lower()
    snippets = _upgrade_snippets(lower)
    if not snippets:
        return False

    timelock_markers = (
        "timelock",
        "schedule_upgrade",
        "upgrade_delay",
        "pending_upgrade",
        "executable_after",
    )

    for snippet in snippets:
        has_upgrade_call = (
            "replace_class_syscall" in snippet or "upgradeable.upgrade" in snippet
        )
        if not has_upgrade_call:
            continue
        if "internalimpl" in snippet and "component!(" in snippet:
            continue
        if any(marker in snippet for marker in timelock_markers):
            continue
        return True
    return False


def detect_upgrade_class_hash_without_nonzero_guard(code: str) -> bool:
    lower = code.lower()
    snippets = _upgrade_snippets(lower)
    if not snippets:
        return False

    for snippet in snippets:
        has_direct_syscall = "replace_class_syscall" in snippet
        has_component_upgrade = "upgradeable.upgrade" in snippet
        if not has_direct_syscall and not has_component_upgrade:
            continue
        if "new_class_hash" not in snippet:
            continue
        has_nonzero_guard = _has_nonzero_class_hash_guard(snippet)
        uses_oz_upgradeable_component = (
            "upgradeablecomponent" in snippet
            or "openzeppelin_upgrades" in snippet
            or "openzeppelin::upgrades" in snippet
        )

        if has_direct_syscall and not has_nonzero_guard:
            return True
        if has_component_upgrade and not has_nonzero_guard and not uses_oz_upgradeable_component:
            return True
    return False


def detect_critical_address_init_without_nonzero_guard(code: str) -> bool:
    lower = code.lower()
    lower_no_comments = _strip_line_comments(lower)
    constructor_sig, body = _extract_fn_signature_and_body(lower, "constructor")
    if constructor_sig is None or body is None:
        return False

    params = re.findall(r"([a-z_][a-z0-9_]*)\s*:\s*contractaddress", constructor_sig)
    if not params:
        return False

    privileged_markers = (
        "owner",
        "admin",
        "manager",
        "coordinator",
        "governor",
        "operator",
        "pauser",
        "upgrade",
    )
    high_impact_dependency_markers = (
        "reclaim",
        "vault",
        "token",
        "oracle",
        "router",
        "dispatcher",
    )
    critical_markers = privileged_markers + high_impact_dependency_markers
    critical_params = [p for p in params if any(marker in p for marker in critical_markers)]
    if not critical_params:
        return False

    # Known component initializers that enforce non-zero checks internally.
    safe_initializer_surfaces = {
        "baseaumprovidercomponent",
        "ownablecomponent",
    }

    for param in critical_params:
        has_guard = bool(
            re.search(
                rf"(assert|is_non_zero|is_zero|!=\s*0)[^\n]{{0,100}}\b{param}\b"
                rf"|\b{param}\b[^\n]{{0,100}}(assert|is_non_zero|is_zero|!=\s*0)",
                body,
            )
        )
        if has_guard:
            continue
        direct_write = bool(re.search(rf"\b\w+\.write\(\s*{param}\b", body))
        role_seed = bool(re.search(rf"\b_grant_role\([^)]*\b{param}\b", body))
        init_calls = list(re.finditer(rf"\b([a-z_][a-z0-9_]*)\.initializer\([^)]*\b{param}\b", body))
        if direct_write or role_seed:
            return True
        if not init_calls:
            continue
        safe_initializer = False
        for init_match in init_calls:
            receiver = init_match.group(1)
            if receiver.startswith("base_aum_provider") and "baseaumprovidercomponent" in lower_no_comments:
                safe_initializer = True
                break
            if any(surface in lower_no_comments for surface in safe_initializer_surfaces):
                safe_initializer = True
                break
        if not safe_initializer:
            return True
    return False


def detect_constructor_dead_param(code: str) -> bool:
    lower = code.lower()
    constructor_sig, body = _extract_fn_signature_and_body(lower, "constructor")
    if constructor_sig is None or body is None:
        return False

    params = re.findall(
        r"([a-z_][a-z0-9_]*)\s*:\s*(contractaddress|felt252|u256|classhash)",
        constructor_sig,
    )
    if not params:
        return False

    stripped_body = _strip_line_comments(body)
    for param, _param_type in params:
        if param.startswith("_"):
            continue
        if not re.search(rf"\b{param}\b", stripped_body):
            return True
    return False


def detect_irrevocable_admin(code: str) -> bool:
    lower = code.lower()
    lower_no_comments = _strip_line_comments(lower)
    constructor_sig, body = _extract_fn_signature_and_body(lower, "constructor")
    if constructor_sig is None or body is None:
        return False

    params = re.findall(r"([a-z_][a-z0-9_]*)\s*:\s*contractaddress", constructor_sig)
    if not params:
        return False
    admin_params = [p for p in params if any(k in p for k in ("admin", "owner", "governor", "upgrade"))]
    if not admin_params:
        return False

    seeded_admin = False
    seeded_via_role = False
    seeded_via_direct_write = False
    body_no_comments = _strip_line_comments(body)
    for param in admin_params:
        direct_seed = bool(re.search(rf"\b\w+\.write\(\s*{param}\b", body_no_comments))
        role_seed = bool(re.search(rf"\b_grant_role\([^)]*\b{param}\b", body_no_comments))
        init_seed = bool(re.search(rf"\binitializer\([^)]*\b{param}\b", body_no_comments))
        if direct_seed or role_seed or init_seed:
            seeded_admin = True
        if role_seed:
            seeded_via_role = True
        if direct_seed:
            seeded_via_direct_write = True
        if direct_seed or role_seed or init_seed:
            break
    if not seeded_admin:
        return False

    owner_only_params = all("owner" in p for p in admin_params)
    has_ownable_rotation_surface = (
        "ownablemixinimpl" in lower_no_comments
        or "transfer_ownership" in lower_no_comments
        or "renounce_ownership" in lower_no_comments
    )
    # Treat canonical owner-only ownable setups as revocable, but do not suppress
    # contracts that also seed dedicated admin/governor/upgrade roles.
    if owner_only_params and has_ownable_rotation_surface:
        return False

    has_accesscontrol_rotation_surface = (
        "accesscontrolcomponent" in lower_no_comments
        and (
            "impl accesscontrolimpl" in lower_no_comments
            or "accesscontrolcomponent::accesscontrolimpl" in lower_no_comments
        )
    )
    if seeded_via_role and not seeded_via_direct_write and has_accesscontrol_rotation_surface:
        return False

    rotation_name_tokens = ("admin", "owner", "governor", "upgrade")
    rotation_prefixes = (
        "set_",
        "update_",
        "change_",
        "rotate_",
        "transfer_",
        "renounce_",
        "register_",
        "remove_",
    )
    for fn_name, _sig, fn_body in _iter_functions(lower):
        if fn_name == "constructor":
            continue
        fn_body = _strip_line_comments(fn_body)
        if fn_name.startswith(rotation_prefixes) and any(token in fn_name for token in rotation_name_tokens):
            return False
        if any(
            marker in fn_body
            for marker in (
                "transfer_ownership",
                "renounce_ownership",
                "set_upgrade_admin",
                "set_admin",
                "change_admin",
                "rotate_admin",
            )
        ):
            return False
    return True


def _fields_written(body: str) -> set[str]:
    return set(re.findall(r"self\.([a-z_][a-z0-9_]*)\.write\(", body))


def detect_one_shot_registration(code: str) -> bool:
    lower = code.lower()
    functions = _iter_functions(lower)
    if not functions:
        return False

    field_writers: dict[str, set[str]] = defaultdict(set)
    for fn_name, _sig, fn_body in functions:
        for field in _fields_written(fn_body):
            field_writers[field].add(fn_name)

    for fn_name, _sig, fn_body in functions:
        if not fn_name.startswith("register_"):
            continue
        written_fields = _fields_written(fn_body)
        if not written_fields:
            continue

        for field in written_fields:
            has_write_once_guard = bool(
                re.search(rf"assert!?\([^)]*self\.{field}\.read\(\)\.is_zero\(\)", fn_body)
                or re.search(rf"assert!?\([^)]*!\s*self\.{field}\.read\(\)\.is_non_zero\(\)", fn_body)
                or re.search(
                    rf"if\s*\([^)]*self\.{field}\.read\(\)\.is_non_zero\(\)\s*\)\s*\{{[\s\S]{{0,180}}(panic|assert|revert)",
                    fn_body,
                )
                or re.search(
                    rf"if\s*\([^)]*self\.{field}\.read\(\)\s*!=\s*0\s*\)\s*\{{[\s\S]{{0,180}}(panic|assert|revert)",
                    fn_body,
                )
            )
            if not has_write_once_guard:
                continue
            writers = field_writers.get(field, set())
            if all(w in {fn_name, "constructor"} for w in writers):
                return True
    return False


def detect_fees_recipient_zero_dos(code: str) -> bool:
    lower = code.lower()
    if "fees_recipient" not in lower:
        return False

    functions = _iter_functions(lower)
    if not functions:
        return False

    def has_nonzero_guard(fn_body: str) -> bool:
        return bool(
            re.search(r"assert!?\([^)]*fees_recipient[^)]*is_non_zero", fn_body)
            or re.search(r"assert!?\([^)]*fees_recipient[^)]*!=\s*0", fn_body)
            or re.search(r"assert!?\([^)]*fees_recipient\.is_zero\(\)[^)]*==\s*false", fn_body)
            or re.search(r"if\s*\([^)]*fees_recipient\.is_zero\(\)\s*\)\s*\{[\s\S]{0,120}(panic|assert|revert|return)", fn_body)
            or re.search(r"if\s+fees_recipient\.is_zero\(\)\s*\{[\s\S]{0,120}(panic|assert|revert|return)", fn_body)
        )

    has_unguarded_write = False
    has_downstream_sink = False
    for _fn_name, _sig, fn_body in functions:
        writes_fees_recipient = bool(re.search(r"\b\w+\.write\(\s*fees_recipient\b", fn_body))
        if writes_fees_recipient and not has_nonzero_guard(fn_body):
            has_unguarded_write = True
        if re.search(r"(transfer|send|call_contract_syscall)\([^)]*fees_recipient", fn_body):
            has_downstream_sink = True
        if re.search(r"\bself\.\w*fees_recipient\w*\.read\(\)", fn_body) and re.search(
            r"(transfer|send|call_contract_syscall)\(",
            fn_body,
        ):
            has_downstream_sink = True

    return has_unguarded_write and has_downstream_sink


CALL_KEYWORDS = {
    "if",
    "match",
    "assert",
    "panic",
    "return",
    "loop",
    "while",
    "for",
}


def _called_functions(body: str, known_functions: set[str]) -> list[tuple[str, int]]:
    calls: list[tuple[str, int]] = []
    for m in re.finditer(r"\b([a-z_][a-z0-9_]*)\s*\(", body):
        name = m.group(1)
        if name in CALL_KEYWORDS:
            continue
        if name in known_functions:
            calls.append((name, m.start()))
    return calls


def _is_abi_exposed(lower: str, fn_name: str) -> bool:
    escaped = re.escape(fn_name)
    if re.search(
        rf"#\[\s*external(?:\([^\]]*\))?\s*\]\s*(?:(?://[^\n]*\n)|\s)*\bfn\s+{escaped}\s*\(",
        lower,
        flags=re.IGNORECASE,
    ):
        return True
    for match in re.finditer(
        r"#\[\s*abi\s*\(\s*embed_v0\s*\)\s*\]\s*impl\b[^{]*\{",
        lower,
        flags=re.IGNORECASE,
    ):
        block_start = match.end() - 1
        depth = 0
        i = block_start
        while i < len(lower):
            ch = lower[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    block = lower[block_start + 1 : i]
                    if re.search(rf"\bfn\s+{escaped}\s*\(", block, flags=re.IGNORECASE):
                        return True
                    break
            i += 1
    return False


def _is_publicly_reachable(lower: str, fn_name: str) -> bool:
    contract_markers = (
        "#[starknet::contract]",
        "#[starknet::component]",
        "#[abi(",
        "#[external(",
        "#[constructor]",
        "#[l1_handler]",
    )
    if not any(marker in lower for marker in contract_markers):
        return True
    return _is_abi_exposed(lower, fn_name)


def _has_interaction_path(
    fn_name: str,
    fn_bodies: dict[str, str],
    cache: dict[str, bool],
    visiting: set[str],
) -> bool:
    if fn_name in cache:
        return cache[fn_name]
    if fn_name in visiting:
        return False
    body = fn_bodies.get(fn_name, "")
    direct = "safe_transfer_from" in body or "_transfer_item(" in body
    if direct:
        cache[fn_name] = True
        return True

    visiting.add(fn_name)
    known = set(fn_bodies)
    for callee, _ in _called_functions(body, known):
        if _has_interaction_path(callee, fn_bodies, cache, visiting):
            visiting.remove(fn_name)
            cache[fn_name] = True
            return True
    visiting.remove(fn_name)
    cache[fn_name] = False
    return False


def _has_explicit_reentrancy_guard(body: str) -> bool:
    if re.search(r"\bnon_reentrant\s*\(", body):
        return True
    if re.search(r"\bassert_no_reentrancy\s*\(", body):
        return True
    if re.search(r"if\s+[^\n{;]*\bentered\b[^\n{;]*\{[\s\S]{0,120}(panic|assert|revert|return)", body):
        return True
    if re.search(r"\bentered\b\s*[:=]{1,2}\s*(true|1)", body):
        return True
    if re.search(r"assert!?\([^)]*\bentered\b[^)]*(==\s*false|==\s*0|!=\s*true)", body):
        return True
    return False


def detect_no_access_control_mutation(code: str) -> bool:
    lower = code.lower()
    if "#[starknet::contract]" not in lower:
        return False
    risky_prefixes = (
        "set_",
        "register_",
        "upgrade",
        "pause",
        "unpause",
        "configure_",
        "grant_",
        "revoke_",
    )
    privileged_markers = (
        "admin",
        "owner",
        "role",
        "manager",
        "governor",
        "pauser",
        "upgrade",
        "class_hash",
        "token",
        "bridge",
        "fee",
        "config",
        "allowlist",
        "whitelist",
        "permission",
    )
    access_markers = (
        "assert_only_",
        "assert_only_owner",
        "assert_only_role",
        "assert_admin(",
        "_assert_admin(",
        "self.assert_admin(",
        "self._assert_admin(",
        "ownable.assert_only_owner",
        "accesscontrol.assert_only_role",
        "access_control.assert_only_role",
        "has_role(",
        "get_caller_address() ==",
        "get_caller_address() !=",
        "get_caller_address()!=",
        "assert!(get_caller_address() ==",
        "assert!(get_caller_address() !=",
        "assert!(get_caller_address()!=",
        "caller == self.",
        "caller != self.",
    )
    mutation_markers = (
        ".write(",
        "_grant_role(",
        "_revoke_role(",
        "replace_class_syscall(",
        "upgradeable.upgrade(",
        "initializer(",
    )

    for fn_name, signature, body in _iter_functions(lower):
        if fn_name in {"constructor", "__validate__", "__execute__", "__validate_declare__"}:
            continue
        if not fn_name.startswith(risky_prefixes):
            continue
        body_no_comments = _strip_line_comments(body)
        if fn_name.startswith("register_"):
            contextual_high_risk = any(marker in fn_name for marker in privileged_markers) or any(
                marker in body_no_comments for marker in privileged_markers
            )
            if not contextual_high_risk:
                continue
        if "ref self" not in signature:
            continue
        if not _is_publicly_reachable(lower, fn_name):
            continue
        if not any(marker in body_no_comments for marker in mutation_markers):
            continue
        has_access_guard = any(marker in body_no_comments for marker in access_markers) or bool(
            re.search(r"assert!?\([^)]*get_caller_address\(\)\s*(==|!=)", body_no_comments)
            or re.search(
                r"let\s+[a-z_][a-z0-9_]*\s*=\s*(?:starknet::)?get_caller_address\(\)[\s\S]{0,220}assert!?\([^)]*(==|!=)\s*self\.",
                body_no_comments,
            )
            or re.search(r"\bself\.(?:_)?assert_(?:admin|owner|role|caller|auth)[a-z0-9_]*\s*\(", body_no_comments)
            or re.search(r"\b(?:_)?assert_(?:admin|owner|role|caller|auth)[a-z0-9_]*\s*\(", body_no_comments)
        )
        if has_access_guard:
            continue
        return True
    return False


def detect_cei_violation_erc1155(code: str) -> bool:
    lower = code.lower()
    if "safe_transfer_from" not in lower and "_transfer_item(" not in lower:
        return False

    functions = _iter_functions(lower)
    if not functions:
        return False
    fn_bodies = {name: body for name, _sig, body in functions}
    known = set(fn_bodies)
    interaction_cache: dict[str, bool] = {}

    for fn_name, _signature, body in functions:
        if not _is_publicly_reachable(lower, fn_name):
            continue
        interaction_positions = [pos for pos in (body.find("safe_transfer_from"), body.find("_transfer_item(")) if pos != -1]
        for callee, call_pos in _called_functions(body, known):
            if _has_interaction_path(callee, fn_bodies, interaction_cache, set()):
                interaction_positions.append(call_pos)
        if not interaction_positions:
            continue
        if _has_explicit_reentrancy_guard(body):
            continue

        transfer_pos = min(interaction_positions)
        after = body[transfer_pos:]
        state_markers = (
            "status =",
            "is_fulfilled",
            "is_claimed",
            "fulfilled =",
            "order_status",
            "state =",
        )
        has_state_update_after = any(marker in after for marker in state_markers)
        # Any state mutation after the interaction is a CEI hazard, even when
        # earlier state writes are present.
        if has_state_update_after:
            return True
    return False


DETECTORS = {
    "AA-SELF-CALL-SESSION": detect_aa_self_call_session,
    "UNCHECKED_FEE_BOUND": detect_unchecked_fee_bound,
    "SHUTDOWN_OVERRIDE_PRECEDENCE": detect_shutdown_override_precedence,
    "SYSCALL_SELECTOR_FALLBACK_ASSUMPTION": detect_selector_fallback_assumption,
    "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK": detect_immediate_upgrade_without_timelock,
    "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD": detect_upgrade_class_hash_without_nonzero_guard,
    "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD": detect_critical_address_init_without_nonzero_guard,
    "CONSTRUCTOR_DEAD_PARAM": detect_constructor_dead_param,
    "IRREVOCABLE_ADMIN": detect_irrevocable_admin,
    "ONE_SHOT_REGISTRATION": detect_one_shot_registration,
    "FEES_RECIPIENT_ZERO_DOS": detect_fees_recipient_zero_dos,
    "NO_ACCESS_CONTROL_MUTATION": detect_no_access_control_mutation,
    "CEI_VIOLATION_ERC1155": detect_cei_violation_erc1155,
}


def precision(tp: int, fp: int) -> float:
    denom = tp + fp
    if denom == 0:
        return 1.0
    return tp / denom


def recall(tp: int, fn: int) -> float:
    denom = tp + fn
    if denom == 0:
        return 1.0
    return tp / denom


def run_benchmark(cases: list[Case]) -> tuple[list[dict[str, object]], dict[str, int]]:
    results: list[dict[str, object]] = []
    totals = {"tp": 0, "tn": 0, "fp": 0, "fn": 0}
    for case in cases:
        detector = DETECTORS.get(case.class_id)
        if detector is None:
            raise ValueError(f"unsupported class_id: {case.class_id}")
        predicted = detector(case.code)
        expected = case.expected_detect
        if predicted and expected:
            outcome = "tp"
        elif predicted and not expected:
            outcome = "fp"
        elif not predicted and expected:
            outcome = "fn"
        else:
            outcome = "tn"
        totals[outcome] += 1
        results.append(
            {
                "case_id": case.case_id,
                "class_id": case.class_id,
                "expected_detect": expected,
                "predicted_detect": predicted,
                "outcome": outcome,
                "source": case.source,
                "source_url": case.source_url,
            }
        )
    return results, totals


def render_markdown(
    *,
    cases_path: Path,
    version: str,
    title: str,
    results: list[dict[str, object]],
    totals: dict[str, int],
    generated_at: str,
) -> str:
    tp = totals["tp"]
    tn = totals["tn"]
    fp = totals["fp"]
    fn = totals["fn"]
    total = tp + tn + fp + fn

    overall_precision = precision(tp, fp)
    overall_recall = recall(tp, fn)
    overall_accuracy = (tp + tn) / total if total else 1.0

    per_class: dict[str, dict[str, int]] = defaultdict(
        lambda: {"tp": 0, "tn": 0, "fp": 0, "fn": 0}
    )
    for row in results:
        class_row = per_class[str(row["class_id"])]
        class_row[str(row["outcome"])] += 1

    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"Generated: {generated_at}")
    lines.append(f"Version: {version}")
    lines.append(f"Case pack: `{cases_path.as_posix()}`")
    lines.append("")
    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Cases: {total}")
    lines.append(f"- Precision: {overall_precision:.3f}")
    lines.append(f"- Recall: {overall_recall:.3f}")
    lines.append(f"- Accuracy: {overall_accuracy:.3f}")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("| --- | ---: |")
    lines.append(f"| TP | {tp} |")
    lines.append(f"| FP | {fp} |")
    lines.append(f"| FN | {fn} |")
    lines.append(f"| TN | {tn} |")
    lines.append("")
    lines.append("## Per Class")
    lines.append("")
    lines.append("| Class | TP | FP | FN | TN | Precision | Recall |")
    lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
    for class_id in sorted(per_class):
        row = per_class[class_id]
        p = precision(row["tp"], row["fp"])
        r = recall(row["tp"], row["fn"])
        lines.append(
            f"| {class_id} | {row['tp']} | {row['fp']} | {row['fn']} | {row['tn']} | {p:.3f} | {r:.3f} |"
        )
    lines.append("")
    lines.append("## Case Outcomes")
    lines.append("")
    lines.append("| Case | Class | Expected | Predicted | Outcome | Source |")
    lines.append("| --- | --- | ---: | ---: | --- | --- |")
    for row in results:
        source = str(row["source"])
        if row.get("source_url"):
            source = f"[{source}]({row['source_url']})"
        lines.append(
            f"| {row['case_id']} | {row['class_id']} | {str(row['expected_detect']).lower()} | {str(row['predicted_detect']).lower()} | {row['outcome']} | {source} |"
        )
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    lines.append(
        "- This benchmark is a deterministic preflight gate for known Cairo vulnerability classes."
    )
    lines.append(
        "- It complements (not replaces) prompt-based held-out evaluation for full agent behavior."
    )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run deterministic cairo-auditor benchmark and emit markdown scorecard."
    )
    parser.add_argument("--cases", required=True, help="JSONL benchmark cases path")
    parser.add_argument("--output", required=True, help="Output markdown scorecard path")
    parser.add_argument("--version", default="v0.2.0", help="Version label for scorecard")
    parser.add_argument("--title", default="", help="Optional markdown H1 title override")
    parser.add_argument("--min-precision", type=float, default=0.9)
    parser.add_argument("--min-recall", type=float, default=0.9)
    parser.add_argument("--min-class-recall", type=float, default=0.0)
    parser.add_argument(
        "--save",
        action="store_true",
        help="Copy output markdown to evals/scorecards/<basename(output)>.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    cases_path = Path(args.cases)
    output_path = Path(args.output)
    if not cases_path.is_absolute():
        cases_path = (repo_root / cases_path).resolve()
    else:
        cases_path = cases_path.resolve()
    if not output_path.is_absolute():
        output_path = (repo_root / output_path).resolve()
    else:
        output_path = output_path.resolve()

    cases = load_cases(cases_path)
    results, totals = run_benchmark(cases)

    tp = totals["tp"]
    fp = totals["fp"]
    fn = totals["fn"]
    overall_precision = precision(tp, fp)
    overall_recall = recall(tp, fn)

    generated_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    title = args.title.strip() or (
        f"{args.version} {cases_path.stem.replace('_', ' ').replace('-', ' ').title()}"
    )
    markdown = render_markdown(
        cases_path=display_path(cases_path, repo_root),
        version=args.version,
        title=title,
        results=results,
        totals=totals,
        generated_at=generated_at,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(markdown + "\n", encoding="utf-8")
    saved_output: str | None = None
    if args.save:
        scorecards_dir = repo_root / "evals" / "scorecards"
        scorecards_dir.mkdir(parents=True, exist_ok=True)
        target = scorecards_dir / output_path.name
        if output_path.resolve() != target.resolve():
            shutil.copy2(output_path, target)
        saved_output = target.as_posix()

    print(
        json.dumps(
            {
                "cases": len(cases),
                "precision": round(overall_precision, 6),
                "recall": round(overall_recall, 6),
                "output": output_path.as_posix(),
                "saved_output": saved_output,
            },
            ensure_ascii=True,
        )
    )

    per_class: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "tn": 0})
    for row in results:
        class_id = str(row["class_id"])
        per_class[class_id][str(row["outcome"])] += 1
    class_recall_violations: list[tuple[str, float]] = []
    if args.min_class_recall > 0.0:
        for class_id in sorted(per_class):
            tp_c = per_class[class_id]["tp"]
            fn_c = per_class[class_id]["fn"]
            has_positive_cases = tp_c + fn_c > 0
            if not has_positive_cases:
                continue
            class_recall = recall(tp_c, fn_c)
            if class_recall < args.min_class_recall:
                class_recall_violations.append((class_id, class_recall))

    if overall_precision < args.min_precision or overall_recall < args.min_recall:
        print(
            f"FAILED: precision={overall_precision:.3f} recall={overall_recall:.3f} "
            f"thresholds=({args.min_precision:.3f}, {args.min_recall:.3f})"
        )
        return 1
    if class_recall_violations:
        viol = ", ".join(f"{cid}={val:.3f}" for cid, val in class_recall_violations)
        print(
            f"FAILED: class recall below threshold {args.min_class_recall:.3f}: {viol}"
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
