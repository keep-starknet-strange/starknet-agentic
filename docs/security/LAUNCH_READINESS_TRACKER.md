# Launch Readiness Tracker (No-Backend Profile)

Last updated: 2026-03-06

This tracker is the operational checklist to close the no-backend launch gate in
[#273](https://github.com/keep-starknet-strange/starknet-agentic/issues/273)
with reproducible evidence.

## Scope

- Launch gate: `#273` (no-backend / self-custodial profile)
- Completed blockers:
  - `#256` cross-repo session-signature parity
  - `#316` provenance + attestation verification
  - `#335` spending-policy E2E/load/sign-off closure
- Remaining blockers:
  - `#332` mainnet ownership/signer policy
  - `#333` production deployment runbook
  - `#334` external audit scope and closure policy
- Deferred (out of scope for `#273`, gated before any managed-backend launch):
  - `#219`, `#222`, `#223`, `#224`, `#225`, `#317`
  - tracking anchor: this tracker + `docs/security/EXTERNAL_AUDIT_SCOPE.md`
  - owner: runtime-owner
  - closure gate: no managed-backend release may proceed until all deferred items are closed with evidence

## P0 Closure Rules

1. Evidence must come from immutable links (merged PRs, workflow runs, releases, docs paths in git).
2. Any unresolved control must stay open as an issue with explicit acceptance criteria.
3. Launch claims must match this tracker and `#273` checkboxes.

## Evidence Map

### Completed

- `#256` parity:
  - source vectors/schema in `spec/session-signature-v2.{json,schema.json}`
  - parity workflow: `.github/workflows/session-signature-v2-conformance.yml`
- `#316` provenance:
  - verifier docs: `docs/security/PROVENANCE_VERIFICATION.md`
  - staging provenance release/tag links are posted in `#316`

### Remaining

- `#332` ownership/signer policy:
  - `docs/security/MAINNET_OWNERSHIP_SIGNER_POLICY.md`
  - `docs/DEPLOYMENT_TRUTH_SHEET.md`
- `#333` deployment runbook:
  - `docs/security/PRODUCTION_DEPLOYMENT_RUNBOOK.md`
  - `docs/DEPLOYMENT_TRUTH_SHEET.md`
- `#334` audit scope/closure:
  - `docs/security/EXTERNAL_AUDIT_SCOPE.md`
  - issue body + sign-off links
- `#335` E2E/load/sign-off:
  - `docs/security/SPENDING_POLICY_AUDIT.md`
  - `docs/security/SPENDING_POLICY_SIGNOFF_MATRIX.md`

### `#335` spending policy E2E/load/sign-off closure

- Checklist and owner mapping:
  - `docs/security/SPENDING_POLICY_AUDIT.md`
- Evidence schema + verifier:
  - `scripts/security/spending-policy-evidence.mjs`
  - `docs/security/evidence/spending-policy/README.md`
  - `docs/security/evidence/spending-policy/execution-report.template.json`

## Required Sign-off Comment Format

Post this in each child issue before closing:

- What changed (docs/code/workflow)
- Evidence links (runs, commits, release tags, command output)
- Residual risk and explicit owner
- Explicit statement: "No open acceptance criteria remain"
