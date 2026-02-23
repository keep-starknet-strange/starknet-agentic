# Dependency Exception Register

This register tracks temporary dependency-audit exceptions and their risk treatment.

## ADV-1113371-MINIMATCH

- Advisory ID: `1113371`
- Package: `minimatch`
- Severity: `high`
- Threat model entry ID: `ADV-1113371-MINIMATCH`
- Scope: Transitive dev-tooling dependency (not a production runtime dependency path).
- Justification: Temporary dev-only exception while upstream transitive dependency is pending patch uptake.
- Allowlist expiry: `2026-04-30`
- Owner: Security maintainers (`@omarespejel`)
- Linked allowlist entry: `security/audit-allowlist.json` (advisory `1113371`)

### Residual Risk

Risk remains that CI/dev tooling invoking vulnerable glob evaluation could be coerced into high CPU usage if attacker-controlled wildcard patterns are processed.

### Mitigations

1. No production runtime path accepts user-controlled glob patterns through this dependency.
2. The allowlist entry is temporary and date-bounded.
3. CI audit gate remains enabled; only this explicit advisory ID is excepted.
4. Entry is reviewed/removed once upstream patched version is available and lockfile is updated.

### Review Sign-off

- Initial exception sign-off: `@omarespejel` on `2026-02-23`.
