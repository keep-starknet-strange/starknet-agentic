#!/usr/bin/env python3
"""Unit checks for the shared component-resolution helper (#3 FP fix).

Run standalone: `python3 skills/cairo-auditor/tests/validate_component_resolution.py`.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "quality"))

from component_resolution import (  # noqa: E402
    format_markdown,
    initializer_guards_param,
    resolve_components,
)

OWNABLE_ROTATION = """
#[starknet::contract]
mod V {
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }
}
"""

ACCESS_CONTROL_ROTATION = """
#[starknet::contract]
mod V {
    component!(path: AccessControlComponent, storage: access_control, event: ACEvent);
    #[abi(embed_v0)]
    impl AccessControlMixinImpl = AccessControlComponent::AccessControlMixinImpl<ContractState>;
    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        self.access_control._grant_role(DEFAULT_ADMIN_ROLE, admin);
    }
}
"""

RAW_NO_COMPONENT = """
#[starknet::contract]
mod V {
    #[constructor]
    fn constructor(ref self: ContractState, admin: ContractAddress) {
        self.admin.write(admin);
    }
}
"""


def check(name: str, condition: bool, detail: str = "") -> tuple[bool, str]:
    return condition, f"{name}: {'ok' if condition else 'FAILED'}{(' — ' + detail) if detail and not condition else ''}"


def main() -> int:
    results: list[tuple[bool, str]] = []

    own = resolve_components(OWNABLE_ROTATION)
    results.append(check("ownable detected", bool(own["ownable"])))
    results.append(check("ownable rotation surface", own["provides_admin_rotation"] is True, str(own)))
    results.append(check("ownable initializer non-zero", own["enforces_nonzero_on_init"] is True))
    results.append(check("ownable guards owner param", initializer_guards_param(OWNABLE_ROTATION, "owner")))

    ac = resolve_components(ACCESS_CONTROL_ROTATION)
    results.append(check("access_control detected", bool(ac["access_control"])))
    results.append(
        check(
            "access_control rotation surface",
            "grant_role" in ac["rotation_surfaces"] or "accesscontrolmixinimpl" in ac["rotation_surfaces"],
            str(ac["rotation_surfaces"]),
        )
    )

    raw = resolve_components(RAW_NO_COMPONENT)
    results.append(check("raw has no components", not (raw["ownable"] or raw["access_control"] or raw["upgradeable"])))
    results.append(check("raw provides no rotation", raw["provides_admin_rotation"] is False))
    results.append(check("raw initializer guard is false", not initializer_guards_param(RAW_NO_COMPONENT, "admin")))

    md = format_markdown({"a.cairo": own, "b.cairo": raw})
    results.append(check("markdown has FP-gate note", "FP gate" in md))
    results.append(check("markdown has Component Resolution header", "## Component Resolution" in md))

    failures = [msg for ok, msg in results if not ok]
    for _ok, msg in results:
        print(msg)
    if failures:
        print("\ncomponent resolution validation failed", file=sys.stderr)
        return 1
    print("\ncomponent resolution validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
