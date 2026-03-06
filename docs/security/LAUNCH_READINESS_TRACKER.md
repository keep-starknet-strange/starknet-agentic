# Launch Readiness Tracker (P0)

Last updated: 2026-03-05

This tracker is the operational checklist to close the release gate in
[#273](https://github.com/keep-starknet-strange/starknet-agentic/issues/273)
without ambiguous "done" claims.

## Scope

- Session-signature parity and conformance (`#256`)
- SNIP-12 v2 tracker hygiene and closure evidence (`#255`)
- Signer proxy auth hardening evidence linkage (`#219`)
- Spending-policy E2E/load/sign-off closure evidence (`#335`)

## P0 Closure Rules

1. CI parity evidence must come from green workflows on default branches.
2. Docs/runbook references must point to versioned files in git.
3. Any unresolved delta must remain as an open issue with explicit acceptance criteria.

## Evidence Map

### `#255` SNIP-12 v2 verification path

- Contract implementation landed in merged PRs:
  - [#258](https://github.com/keep-starknet-strange/starknet-agentic/pull/258)
  - [#283](https://github.com/keep-starknet-strange/starknet-agentic/pull/283)
- Migration notes:
  - `docs/security/SESSION_SIGNATURE_MODE_MIGRATION.md`

### `#256` shared vectors + parity

- Source vectors and schema:
  - `spec/session-signature-v2.json`
  - `spec/session-signature-v2.schema.json`
- Local runtime conformance test:
  - `packages/starknet-mcp-server/__tests__/helpers/sessionSignatureVectors.test.ts`
- Cross-repo parity workflow:
  - `.github/workflows/session-signature-v2-conformance.yml`

### `#219` signer proxy auth + replay

- Runtime guardrails:
  - `packages/starknet-mcp-server/src/index.ts`
  - `packages/starknet-mcp-server/src/helpers/keyringProxySigner.ts`
- Auth conformance workflows:
  - `.github/workflows/signer-auth-conformance.yml`
  - `.github/workflows/session-signature-v2-conformance.yml`
- Rotation and incident runbook:
  - `docs/security/SIGNER_PROXY_ROTATION_RUNBOOK.md`

### `#335` spending policy E2E/load/sign-off closure

- Checklist and owner mapping:
  - `docs/security/SPENDING_POLICY_AUDIT.md`
- Evidence schema + verifier:
  - `scripts/security/spending-policy-evidence.mjs`
  - `docs/security/evidence/spending-policy/README.md`
  - `docs/security/evidence/spending-policy/execution-report.template.json`

## Required Sign-off Comment Format

Post this in each issue before closing:

- What changed (code + workflow + docs)
- Evidence links (workflow runs, merged PRs, test output)
- Residual risk (if any)
- Explicit statement: "No open acceptance criteria remain" or list remaining deltas
