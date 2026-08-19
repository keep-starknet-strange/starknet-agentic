# Dependency Exception Register

This register tracks temporary dependency-audit exceptions and their risk treatment.

**Active exceptions: none.** `security/audit-allowlist.json` is currently empty
— every previously excepted advisory has been resolved by pinning patched
versions through `pnpm.overrides` (root) and `overrides` (`tools/ajv-cli`). The
CI audit gate (`scripts/security/audit-gate.mjs`, `--failLevel high`) therefore
enforces zero unaddressed high/critical advisories with no exceptions applied.

## ADV-1113371-MINIMATCH (Closed)

- Status: **Closed** on `2026-07-24` — `minimatch` is pinned to a patched
  release via the root `pnpm.overrides` entry `"minimatch": "10.2.3"`; the
  advisory no longer appears in `pnpm audit`, and the allowlist entry has been
  removed.
- Advisory ID: `1113371`
- Package: `minimatch`
- Severity: `high`
- Advisory URL: `https://npmjs.com/advisories/1113371`
- Threat model entry ID: `ADV-1113371-MINIMATCH`
- Scope: Transitive dev-tooling dependency (not a production runtime dependency path).
- Justification: Accepted for dev tooling only (not shipped in production runtime), with CI controls and time-bounded expiry while upstream transitive dependency was pending patch uptake.
- Allowlist expiry: `2026-04-30` (superseded by resolution above)
- Owner: Security maintainers (`@omarespejel`)
- Linked allowlist entry: removed (resolved via `pnpm.overrides`, not an exception)

### Residual Risk

Resolved. While the exception was active, the risk was that CI/dev tooling invoking vulnerable glob evaluation could be coerced into high CPU usage if attacker-controlled wildcard patterns were processed. The pinned patched `minimatch` removes this path.

### Mitigations

1. No production runtime path accepts user-controlled glob patterns through this dependency.
2. `minimatch` is pinned to a patched version (`10.2.3`) via root `pnpm.overrides`.
3. CI audit gate remains enabled in `.github/workflows/ci.yml` (`Test` job, steps `Audit dependencies (report)` and `Enforce audit allowlist (high+)`) via `scripts/security/audit-gate.mjs`; the allowlist is now empty, so no advisory IDs are excepted.
4. Security owner (`@omarespejel`) tracks upstream patch availability on scanner alerts; new exceptions, if ever needed, are added to `security/audit-allowlist.json` and documented here before use.

### Review Sign-off

- Initial exception sign-off: `@omarespejel` on `2026-02-23`.
- Closure: pending maintainer sign-off (`@omarespejel`) on this PR.
