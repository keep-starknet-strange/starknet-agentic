# Dependency Exception Register

This register tracks dependency-audit exceptions, their risk treatment, and
every forced resolution in the root `pnpm.overrides` block.

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
- Owner: `@adrienlacombe`
- Linked allowlist entry: `security/audit-allowlist.json` → `id: "1240992"`

### Residual Risk

A contributor or CI job running ESLint on the website could hit excessive recursion if a deeply nested brace pattern were introduced into lint configuration or file globs. Impact is limited to a failed or slow local/CI lint run; no runtime, key material, or user data is reachable through this path.

### Mitigations

1. Only reachable from website lint tooling; nothing in `packages/*` or the deployed site depends on it.
2. Glob inputs are repository-controlled and reviewed in PRs.
3. Time-bounded exception (`expiresOn` in the allowlist): the gate fails again on expiry, forcing a re-check.
4. Exit criteria: remove the allowlist entry and close this record when a patched `braces` is published (then pin it via `pnpm.overrides`), or when the dependency path disappears (e.g. `@next/eslint-plugin-next` drops `fast-glob`/`micromatch`).

### Review Sign-off

- Exception sign-off: `@adrienlacombe` on `2026-10-04` (#607).

## pnpm override register

Every key in the root `package.json` `pnpm.overrides` block must have exactly
one row below, and every row must match a key. `pnpm deps:check-overrides`
(`scripts/check-overrides.mjs`) enforces this and runs in the daily health
check (`.github/workflows/health-check.yml`). It fails on a missing or extra
row and warns when a row is past its review-by date or its target no longer
matches `package.json`.

Why this exists: overrides are security pins that go stale silently. An
**exact** pin stops pnpm, and Dependabot, from resolving anything newer,
including a later security fix (the old `"hono": "4.13.5"` pin blocked alert #100 until #605). A **floor**
(`^x.y.z`) only raises the minimum and still lets patch/minor updates through.

How to maintain it:

- Adding or changing an override: add or update its row in the same PR. Cite
  the advisory (GHSA, CVE or npm advisory ID) only if you actually have one;
  otherwise write "not recorded" and the commit that introduced it.
- At the review-by date: check whether upstream ranges now resolve to a
  patched version on their own (`pnpm why -r <pkg>`). If so, remove the
  override and its row (see #277 for the `minimatch` case). If not, set a new
  review-by date.
- Removing an override: delete the row in the same PR.

Columns: **Pin** is `exact` (a single version) or `floor` (a `^` range).
**Added** is the first commit that introduced an override for that package
or selector; **Last changed** is the commit that set the current selector or
target. Reasons quote only what the commit message or linked PR states.
**Owner** is the maintainer who acts on the review-by date (`@adrienlacombe`,
assigned 2026-10-04). **Review by** defaults to 30 days for exact pins and
90 days for floors.

<!-- override-register:start -->
| Selector | Target | Pin | Reason (as recorded) | Added | Last changed | Owner | Review by |
|---|---|---|---|---|---|---|---|
| `ajv@^6.0.0` | `6.14.0` | exact | Patch vulnerable transitive `ajv` 6.x. Advisory ID not recorded, see 84db0bd (#288). | 2026-02-24 (84db0bd, #288) | 84db0bd (#288) | `@adrienlacombe` | 2026-11-04 |
| `ajv@^8.0.0` | `8.18.0` | exact | Patch vulnerable transitive `ajv` 8.x. Advisory ID not recorded, see 84db0bd (#288). | 2026-02-24 (84db0bd, #288) | 84db0bd (#288) | `@adrienlacombe` | 2026-11-04 |
| `browserslist@<=4.28.6` | `^4.28.7` | floor | "Newly reported high-severity audit findings". Advisory ID not recorded, see 4838a75 (#557). | 2026-09-11 (4838a75, #557) | 4838a75 (#557) | `@adrienlacombe` | 2027-01-04 |
| `express-rate-limit` | `8.3.0` | exact | "Pin patched express-rate-limit for audit gate". Advisory ID not recorded, see 071df36 (#338). | 2026-03-06 (071df36, #338) | 071df36 (#338) | `@adrienlacombe` | 2026-11-04 |
| `esbuild@>=0.17.0 <0.28.1` | `0.28.1` | exact | npm advisory 1120679 (blocked the audit gate on #459). | 2026-06-17 (329632c, #460) | 329632c (#460) | `@adrienlacombe` | 2026-11-04 |
| `fast-uri@<3.1.6` | `^3.1.6` | floor | Transitive via `@modelcontextprotocol/sdk > ajv`. Added for CVE-2026-6321 / GHSA-q3j6-qgpj-74h6 (626d12a); raised for GHSA-4c8g-83qw-93j6 and GHSA-v2hh-gcrm-f6hx (#498) and npm advisory 1130720 (#517). Reason for the 3.1.6 floor not recorded, see 4838a75 (#557). | 2026-05-08 (626d12a) | 4838a75 (#557) | `@adrienlacombe` | 2027-01-04 |
| `brace-expansion@>=4.0.0 <5.0.9` | `^5.0.9` | floor | npm advisory 1130734, via `eslint > minimatch`. | 2026-08-07 (7ae86c2, #517) | 7ae86c2 (#517) | `@adrienlacombe` | 2027-01-04 |
| `hono@<4.13.7` | `^4.13.7` | floor | Added as a patched pin in #288 (advisory ID not recorded); later targets cleared Dependabot alerts #94–#96 (GHSA-crvj-82cr-hjcx, GHSA-gqvv-2mrq-wpjv, GHSA-g6gw-c38x-mqfc, #558). Converted from the exact pin `4.13.5` to a floor in #605 to clear alert #100 (GHSA-hxh3-vqpv-xpqv), which the exact pin was blocking. | 2026-02-24 (84db0bd, #288) | ccdd4c6 (#605) | `@adrienlacombe` | 2027-01-04 |
| `@hono/node-server` | `^2.0.5` | floor | GHSA-frvp-7c67-39w9. | 2026-07-24 (747f081, #498) | 747f081 (#498) | `@adrienlacombe` | 2027-01-04 |
| `ip-address` | `^10.1.1` | floor | CVE-2026-42338 / GHSA-v2v4-37r5-5v8g, via `@modelcontextprotocol/sdk > express-rate-limit`. | 2026-05-07 (e18ea9e, #430) | e18ea9e (#430) | `@adrienlacombe` | 2027-01-04 |
| `postcss` | `^8.5.12` | floor | Dependabot alert "XSS via unescaped `</style>` in CSS stringify" (patched 8.5.10) and dedupe of a transitive 8.4.31. Advisory ID not recorded, see 7bbaef6 (#411). | 2026-04-30 (7bbaef6, #411) | 7bbaef6 (#411) | `@adrienlacombe` | 2027-01-04 |
| `qs` | `6.16.0` | exact | Added for CVE-2026-2391 (5f0008e, #237); raised for GHSA-q8mj-m7cp-5q26 (#498). Current target clears Dependabot alerts #89/#90: GHSA-4mjr-xmp4-gh2g, GHSA-x5fp-wj9c-mxmx (#558). | 2026-02-13 (5f0008e, #237) | a2215c2 (#558) | `@adrienlacombe` | 2026-11-04 |
| `minimatch` | `10.2.3` | exact | npm advisory 1113371 (see ADV-1113371-MINIMATCH below; removal tracked in #277). Unscoped, so every `minimatch` major resolves to 10.2.3. | 2026-02-21 (414d5ea, #274) | 71a2f02 (#288) | `@adrienlacombe` | 2026-11-04 |
| `rollup` | `4.59.0` | exact | "Patch transitive rollup and minimatch advisories". Advisory ID not recorded, see 71a2f02 (#288). | 2026-02-27 (71a2f02, #288) | 71a2f02 (#288) | `@adrienlacombe` | 2026-11-04 |
| `sharp` | `^0.35.0` | floor | GHSA-f88m-g3jw-g9cj (libvips CVEs). | 2026-07-24 (747f081, #498) | 747f081 (#498) | `@adrienlacombe` | 2027-01-04 |
| `flatted` | `^3.4.2` | floor | npm advisory 1115357 (prototype pollution). | 2026-04-21 (2679dd7, #393) | 2679dd7 (#393) | `@adrienlacombe` | 2027-01-04 |
| `js-yaml@>=3.0.0 <3.15.2` | `^3.15.2` | floor | Added for GHSA-52cp-r559-cp3m and GHSA-h67p-54hq-rp68 (#498); raised for npm advisories 1138114 / 1138115 (#517). Reason for the 3.15.2 floor not recorded, see 4838a75 (#557). | 2026-07-24 (747f081, #498) | 4838a75 (#557) | `@adrienlacombe` | 2027-01-04 |
| `js-yaml@>=4.0.0 <4.3.1` | `^4.3.1` | floor | npm advisories 1138114 / 1138115, via `@changesets/cli`. | 2026-08-07 (7ae86c2, #517) | 7ae86c2 (#517) | `@adrienlacombe` | 2027-01-04 |
| `postcss-selector-parser@>=6.1.0 <6.1.3` | `^6.1.3` | floor | Dependabot alert #84: GHSA-w9m9-85wc-3x92 / CVE-2026-9358. | 2026-09-11 (a2215c2, #558) | a2215c2 (#558) | `@adrienlacombe` | 2027-01-04 |
| `body-parser@>=2.0.0 <2.3.0` | `^2.3.0` | floor | GHSA-v422-hmwv-36x6. | 2026-07-24 (747f081, #498) | 747f081 (#498) | `@adrienlacombe` | 2027-01-04 |
| `picomatch@<2.3.2` | `^2.3.2` | floor | npm advisory 1115552 (ReDoS). | 2026-04-21 (2679dd7, #393) | 2679dd7 (#393) | `@adrienlacombe` | 2027-01-04 |
| `picomatch@>=4.0.0 <4.0.4` | `^4.0.4` | floor | npm advisory 1115554 (ReDoS). | 2026-04-21 (2679dd7, #393) | 2679dd7 (#393) | `@adrienlacombe` | 2027-01-04 |
| `path-to-regexp@>=8.0.0 <8.4.0` | `^8.4.0` | floor | npm advisory 1115573 (DoS). | 2026-04-21 (2679dd7, #393) | 2679dd7 (#393) | `@adrienlacombe` | 2027-01-04 |
| `vite` | `8.3.1` | exact | Replaced the scoped `vite@>=7.0.0 <7.3.2` override (npm advisories 1116232 / 1116235, #393) with an unscoped pin for "high findings for vite" (IDs not recorded, see 329632c, #460). Tracks the root `vite` devDependency; Dependabot bumps both. | 2026-06-17 (329632c, #460) | 6e47b6b (#577) | `@adrienlacombe` | 2026-11-04 |
| `ws@>=8.0.0 <8.21.0` | `8.21.0` | exact | "High findings for ws". Advisory ID not recorded, see 329632c (#460). | 2026-06-17 (329632c, #460) | 329632c (#460) | `@adrienlacombe` | 2026-11-04 |
| `yaml@>=2.0.0 <2.8.3` | `^2.8.3` | floor | GHSA-48c2-rrv3-qjmp. | 2026-04-30 (e0a32bd, #412) | e0a32bd (#412) | `@adrienlacombe` | 2027-01-04 |
<!-- override-register:end -->

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
