#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import logging
import os
import re
import sys
from collections.abc import Callable
from pathlib import Path
from types import ModuleType

Detector = Callable[[str], bool]

_log = logging.getLogger(__name__)

ENABLE_BENCHMARK_BRIDGE_ENV = "CAUD_ENABLE_BENCHMARK_BRIDGE"

NOISY_BRIDGE_CLASSES = {
    # This class is valuable in benchmark scoring, but in local preflight it
    # needs project-specific governance lifecycle context to avoid overfitting
    # small fixtures and minimal examples.
    "IRREVOCABLE_ADMIN",
}


DETECTOR_METADATA: dict[str, dict[str, object]] = {
    "AA-SELF-CALL-SESSION": {
        "severity": "High",
        "title": "Session Key Privilege Escalation via Self-Call",
    },
    "UNCHECKED_FEE_BOUND": {
        "severity": "Medium",
        "title": "Fee Parameter Without Bounds Validation",
    },
    "SHUTDOWN_OVERRIDE_PRECEDENCE": {
        "severity": "High",
        "title": "Shutdown Override Shadowed by Inferred Mode",
    },
    "SYSCALL_SELECTOR_FALLBACK_ASSUMPTION": {
        "severity": "Medium",
        "title": "Syscall Selector Fallback Masks Compatibility Bugs",
    },
    "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK": {
        "severity": "Critical",
        "title": "Immediate Upgrade Without Timelock",
    },
    "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD": {
        "severity": "High",
        "title": "Upgrade Accepts Zero Class Hash",
    },
    "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD": {
        "severity": "Critical",
        "title": "Critical Address Initialized Without Non-Zero Guard",
    },
    "CONSTRUCTOR_DEAD_PARAM": {
        "severity": "Medium",
        "title": "Constructor Accepts Unused Parameter",
    },
    "IRREVOCABLE_ADMIN": {
        "severity": "High",
        "title": "Irrevocable Admin Role",
    },
    "ONE_SHOT_REGISTRATION": {
        "severity": "High",
        "title": "One-Shot Registration Without Recovery Path",
    },
    "FEES_RECIPIENT_ZERO_DOS": {
        "severity": "High",
        "title": "Fee Recipient Zero-Address Denial of Service",
    },
    "NO_ACCESS_CONTROL_MUTATION": {
        "severity": "Critical",
        "title": "Missing Access Control on Privileged Mutation",
    },
    "CEI_VIOLATION_ERC1155": {
        "severity": "Critical",
        "title": "Check-Effects-Interactions Violation (ERC1155)",
    },
}

LINE_PATTERNS: dict[str, list[str]] = {
    "AA-SELF-CALL-SESSION": [r"\bfn\s+__execute__\b", r"\bsession\b"],
    "UNCHECKED_FEE_BOUND": [r"\b(?:swap_fee|fee_bps)\b"],
    "SHUTDOWN_OVERRIDE_PRECEDENCE": [r"\binfer_shutdown_mode\b"],
    "SYSCALL_SELECTOR_FALLBACK_ASSUMPTION": [r"\bcall_contract_syscall\b"],
    "IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK": [r"\bfn\s+upgrade\s*\("],
    "UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD": [r"\bfn\s+upgrade\s*\("],
    "CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD": [r"\bfn\s+constructor\b"],
    "CONSTRUCTOR_DEAD_PARAM": [r"\bfn\s+constructor\b"],
    "IRREVOCABLE_ADMIN": [r"\bfn\s+constructor\b"],
    "ONE_SHOT_REGISTRATION": [r"\bfn\s+register_"],
    "FEES_RECIPIENT_ZERO_DOS": [r"\bfees_recipient\b"],
    "NO_ACCESS_CONTROL_MUTATION": [
        r"\bfn\s+(?:set_|register_|upgrade|pause|unpause|configure_|grant_|revoke_)",
    ],
    "CEI_VIOLATION_ERC1155": [r"\bsafe_transfer_from\b", r"\b_transfer_item\b"],
}


def _load_module(path: Path) -> ModuleType | None:
    spec = importlib.util.spec_from_file_location("benchmark_cairo_auditor_bridge", path)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        sys.modules.pop(spec.name, None)
        raise
    return module


def _env_enabled(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def _repo_benchmark_path() -> Path | None:
    here = Path(__file__).resolve()
    skill_root = here.parents[2]
    if skill_root.name != "cairo-auditor" or skill_root.parent.name != "skills":
        return None
    repo_root = skill_root.parents[1]
    candidate = repo_root / "scripts" / "quality" / "benchmark_cairo_auditor.py"
    if not candidate.is_file():
        return None
    resolved = candidate.resolve()
    if resolved == here:
        return None
    if resolved != candidate:
        return None
    return resolved


def load_benchmark_detectors(*, enabled: bool = False) -> tuple[dict[str, Detector], str]:
    """Load the canonical benchmark detector suite when this skill lives in-repo.

    Public skill installs may only contain the `skills/cairo-auditor` directory.
    In that case, callers keep their local parser detectors and this bridge
    simply reports that benchmark detectors were unavailable.
    """
    if not enabled and not _env_enabled(os.environ.get(ENABLE_BENCHMARK_BRIDGE_ENV)):
        return {}, "unavailable"

    path = _repo_benchmark_path()
    if path is None:
        return {}, "unavailable"

    try:
        module = _load_module(path)
    except Exception as exc:
        _log.debug("benchmark bridge load failed for %s: %s", path, exc)
        return {}, "unavailable"
    if module is None:
        return {}, "unavailable"
    detectors = getattr(module, "DETECTORS", None)
    if isinstance(detectors, dict) and detectors:
        normalized: dict[str, Detector] = {}
        for class_id, detector in detectors.items():
            if str(class_id) in NOISY_BRIDGE_CLASSES:
                continue
            if callable(detector):
                normalized[str(class_id)] = detector
        if normalized:
            return normalized, path.as_posix()
    return {}, "unavailable"


def relevant_line(code: str, class_id: str) -> int | None:
    lines = code.splitlines()
    for pattern in LINE_PATTERNS.get(class_id, []):
        for idx, line in enumerate(lines, 1):
            if re.search(pattern, line, re.IGNORECASE):
                return idx
    return None
