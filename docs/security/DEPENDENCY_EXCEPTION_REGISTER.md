# Dependency Exception Register

This register tracks temporary dependency-audit exceptions and their risk treatment.

**Active exceptions: 1** (`ADV-1240992-BRACES`, below). Everything else has been
resolved by pinning patched versions through `pnpm.overrides` (root) and
`overrides` (`tools/ajv-cli`). The CI audit gate (`scripts/security/audit-gate.mjs`,
`--failLevel high`) enforces zero unaddressed high/critical advisories; the only
excepted advisory ID is listed in `security/audit-allowlist.json` with an expiry.

## ADV-1240992-BRACES (Active)

- Status: **Active** from `2026-10-04`, expires `2026-11-04`.
- Advisory ID: `1240992` (`GHSA-vfj7-8cjw-p6xm`, "braces vulnerable to stack-exhaustion denial of service through deeply nested patterns")
- Package: `braces` (vulnerable `<= 3.0.3`; **no patched release exists**, 3.0.3 is the latest)
- Severity: `high`
- Advisory URL: `https://github.com/advisories/GHSA-vfj7-8cjw-p6xm`
- Threat model entry ID: `ADV-1240992-BRACES`
- Dependency path (only one): `website > eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces`
- Scope: Transitive dependency of `eslint-config-next`, a `website` **devDependency** used only for linting. Not part of any published package or the deployed website runtime.
- Justification: No upstream fix is available, so an override cannot resolve it. The vulnerable code expands glob patterns; on this path the patterns come from the repository's own lint configuration, not from untrusted input.
- Allowlist expiry: `2026-11-04` (the gate blocks again after this date; re-assess then)
- Owner: Security maintainers (to be confirmed in review)
- Linked allowlist entry: `security/audit-allowlist.json` → `id: "1240992"`

### Residual Risk

A contributor or CI job running ESLint on the website could hit excessive recursion if a deeply nested brace pattern were introduced into lint configuration or file globs. Impact is limited to a failed or slow local/CI lint run; no runtime, key material, or user data is reachable through this path.

### Mitigations

1. Only reachable from website lint tooling; nothing in `packages/*` or the deployed site depends on it.
2. Glob inputs are repository-controlled and reviewed in PRs.
3. Time-bounded exception (`expiresOn` in the allowlist): the gate fails again on expiry, forcing a re-check.
4. Exit criteria: remove the allowlist entry and close this record when a patched `braces` is published (then pin it via `pnpm.overrides`), or when the dependency path disappears (e.g. `@next/eslint-plugin-next` drops `fast-glob`/`micromatch`).

### Review Sign-off

- Exception sign-off: pending maintainer sign-off on this PR.

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
