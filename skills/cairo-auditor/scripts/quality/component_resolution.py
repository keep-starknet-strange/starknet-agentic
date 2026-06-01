#!/usr/bin/env python3
"""Resolve embedded OpenZeppelin components and the security surfaces they expose.

A recurring false-positive family in external triage was reporting
`IRREVOCABLE_ADMIN` or `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` against
contracts that embed OZ `OwnableComponent` / `AccessControlComponent`. Those
components expose rotation surfaces (`transfer_ownership`, `renounce_ownership`,
`grant_role`/`revoke_role`) and enforce non-zero owners inside `initializer`,
so the "missing rotation" / "missing non-zero guard" claims are wrong.

This module is the single source of truth for that resolution. It is pure
Python with no third-party dependencies so it works both at runtime inside a
public skill install (via `surface_map.py`) and in-repo from the deterministic
benchmark detectors. Detection is intentionally conservative: a surface is only
reported when the OZ construct is clearly present, so real bugs are not masked.
"""

from __future__ import annotations

import re

# Markers that indicate an embedded component (matched against a lowercased,
# comment-stripped copy of the source).
_OWNABLE_MARKERS = (
    "ownablecomponent",
    "ownabletwostepcomponent",
    "openzeppelin_access::ownable",
    "openzeppelin::access::ownable",
)
_ACCESS_CONTROL_MARKERS = (
    "accesscontrolcomponent",
    "openzeppelin_access::accesscontrol",
    "openzeppelin::access::accesscontrol",
)
_UPGRADEABLE_MARKERS = (
    "upgradeablecomponent",
    "openzeppelin_upgrades",
    "openzeppelin::upgrades",
)

# Rotation/handover surfaces. Presence of any means the privileged role is not
# irrevocable.
_OWNABLE_ROTATION_SURFACES = (
    "transfer_ownership",
    "renounce_ownership",
    "ownablemixinimpl",
    "ownabletwostepmixinimpl",
    "ownableimpl",
)
_ACCESS_CONTROL_ROTATION_SURFACES = (
    "grant_role",
    "revoke_role",
    "renounce_role",
    "accesscontrolmixinimpl",
    "accesscontrolimpl",
)


def _strip_comments(text: str) -> str:
    text = re.sub(r"//[^\n]*", "", text)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return text


def resolve_components(code: str) -> dict[str, object]:
    """Return the embedded-component security surfaces present in ``code``.

    The returned mapping is JSON-serialisable and stable, so callers can embed
    it directly into the surface map or model-facing context.
    """
    lower = _strip_comments(code).lower()

    ownable = any(marker in lower for marker in _OWNABLE_MARKERS)
    access_control = any(marker in lower for marker in _ACCESS_CONTROL_MARKERS)
    upgradeable = any(marker in lower for marker in _UPGRADEABLE_MARKERS)

    rotation_surfaces: list[str] = []
    if ownable:
        rotation_surfaces += [s for s in _OWNABLE_ROTATION_SURFACES if s in lower]
    if access_control:
        rotation_surfaces += [s for s in _ACCESS_CONTROL_ROTATION_SURFACES if s in lower]
    # De-duplicate while preserving order.
    rotation_surfaces = list(dict.fromkeys(rotation_surfaces))

    # OZ Ownable/AccessControl initializers reject the zero address internally,
    # so an address routed through `<component>.initializer(...)` is guarded even
    # without a local `!= 0` assert.
    nonzero_initializers = sorted(
        {
            match.group(1)
            for match in re.finditer(r"\b([a-z_][a-z0-9_]*)\.initializer\s*\(", lower)
        }
    )
    enforces_nonzero_on_init = bool(nonzero_initializers) and (ownable or access_control)

    # Upgradeable component performs its own non-zero class-hash check.
    upgrade_nonzero_guard = upgradeable and "upgradeable.upgrade" in lower

    provides_admin_rotation = bool(rotation_surfaces)

    facts: dict[str, object] = {
        "ownable": ownable,
        "access_control": access_control,
        "upgradeable": upgradeable,
        "rotation_surfaces": rotation_surfaces,
        "nonzero_enforcing_initializers": nonzero_initializers if enforces_nonzero_on_init else [],
        "provides_admin_rotation": provides_admin_rotation,
        "enforces_nonzero_on_init": enforces_nonzero_on_init,
        "upgrade_component_nonzero_guard": upgrade_nonzero_guard,
    }
    facts["summary"] = _summarize(facts)
    return facts


def initializer_guards_param(code: str, param: str) -> bool:
    """True when ``param`` is seeded through an OZ component initializer.

    Used by the critical-address detector to treat
    ``ownable.initializer(owner)`` as a valid non-zero guard.
    """
    facts = resolve_components(code)
    if not facts["enforces_nonzero_on_init"]:
        return False
    lower = _strip_comments(code).lower()
    return bool(
        re.search(rf"\b[a-z_][a-z0-9_]*\.initializer\([^)]*\b{re.escape(param.lower())}\b", lower)
    )


def _summarize(facts: dict[str, object]) -> str:
    parts: list[str] = []
    if facts["ownable"]:
        parts.append("OZ Ownable embedded")
    if facts["access_control"]:
        parts.append("OZ AccessControl embedded")
    if facts["upgradeable"]:
        parts.append("OZ Upgradeable embedded")
    if facts["provides_admin_rotation"]:
        parts.append("rotation surface: " + ", ".join(facts["rotation_surfaces"]))  # type: ignore[arg-type]
    if facts["enforces_nonzero_on_init"]:
        parts.append("initializer enforces non-zero")
    if not parts:
        return "no OZ access/upgrade components detected"
    return "; ".join(parts)


def format_markdown(facts_by_file: dict[str, dict[str, object]]) -> str:
    """Render a compact Component Resolution section for the surface map."""
    lines = ["## Component Resolution", ""]
    any_component = False
    lines += [
        "| File | Ownable | AccessControl | Upgradeable | Rotation surfaces | Non-zero init |",
        "|---|---|---|---|---|---|",
    ]
    for file_path in sorted(facts_by_file):
        facts = facts_by_file[file_path]
        if facts.get("ownable") or facts.get("access_control") or facts.get("upgradeable"):
            any_component = True
        rotation = ", ".join(f"`{s}`" for s in facts.get("rotation_surfaces", [])) or "-"  # type: ignore[arg-type]
        lines.append(
            f"| `{file_path}` "
            f"| {'yes' if facts.get('ownable') else 'no'} "
            f"| {'yes' if facts.get('access_control') else 'no'} "
            f"| {'yes' if facts.get('upgradeable') else 'no'} "
            f"| {rotation} "
            f"| {'yes' if facts.get('enforces_nonzero_on_init') else 'no'} |"
        )
    lines.append("")
    if not any_component:
        lines.append(
            "_No OZ Ownable/AccessControl/Upgradeable components detected in scope. "
            "Resolve rotation/guard surfaces from raw code instead._"
        )
        lines.append("")
    else:
        lines.append(
            "> FP gate: do not report IRREVOCABLE_ADMIN, missing-rotation, or "
            "missing non-zero address/class-hash guards when the embedded "
            "component above already exposes the relevant rotation surface or "
            "enforces the guard internally. See `references/judging.md`."
        )
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":  # pragma: no cover - manual smoke aid
    import json
    import sys

    src = sys.stdin.read()
    print(json.dumps(resolve_components(src), indent=2))
