# Dependency Exception Register

This register tracks temporary dependency-audit exceptions and their risk treatment.

## ADV-1113371-MINIMATCH

- Advisory ID: `1113371`
- Package: `minimatch`
- Severity: `high`
- Advisory URL: `https://npmjs.com/advisories/1113371`
- Threat model entry ID: `ADV-1113371-MINIMATCH`
- Scope: Transitive dev-tooling dependency (not a production runtime dependency path).
- Justification: Accepted for dev tooling only (not shipped in production runtime), with CI controls and time-bounded expiry while upstream transitive dependency is pending patch uptake.
- Allowlist expiry: `2026-04-30`
- Owner: Security maintainers (`@omarespejel`)
- Linked allowlist entry: `security/audit-allowlist.json` (advisory `1113371`)

### Residual Risk

Risk remains that CI/dev tooling invoking vulnerable glob evaluation could be coerced into high CPU usage if attacker-controlled wildcard patterns are processed.

### Mitigations

1. No production runtime path accepts user-controlled glob patterns through this dependency.
2. The allowlist entry is temporary and date-bounded.
3. CI audit gate remains enabled in `.github/workflows/ci.yml` (`Test` job, steps `Audit dependencies (report)` and `Enforce audit allowlist (high+)`) via `scripts/security/audit-gate.mjs`, and only this advisory ID is excepted through `security/audit-allowlist.json`.
4. Security owner (`@omarespejel`) tracks upstream patch availability weekly and on scanner alerts; once a patch is available, update lockfile, remove allowlist entry, and close this exception before expiry.

### Review Sign-off

- Initial exception sign-off: `@omarespejel` on `2026-02-23`.
