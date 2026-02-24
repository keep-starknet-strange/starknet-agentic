# Session Signature Mode Migration (v1 -> v2)

This document defines the production migration path for session signature verification in `contracts/session-account/src/account.cairo`.

## Modes

- `v1_legacy` (`mode = 1`): legacy session hash (payload Poseidon only).
- `v2_snip12` (`mode = 2`): SNIP-12 domain-separated hash (`StarkNet Message`, domain hash, account, payload hash).

## Contract behavior

- New deployments initialize with `mode = 1`.
- `set_session_signature_mode(2)` upgrades to v2.
- Downgrade is blocked (`2 -> 1` reverts with `Session: mode downgrade`).
- Invalid mode values revert with `Session: invalid sig mode`.

## Upgrade compatibility

### ⚠️ Breaking upgrade note

Accounts upgraded from pre-mode versions have `session_signature_mode` storage value `0`.
To avoid breaking existing signed sessions during class-hash upgrades, `0` is treated as
effective `v1_legacy` until owners explicitly opt into `v2_snip12`.

If you want strict v2 verification, call `set_session_signature_mode(2)` after upgrade.

To preserve behavior for contracts upgraded from older classes that did not store `session_signature_mode`:

- raw storage value `0` is treated as effective `v1_legacy` in verification logic.
- owners can explicitly migrate to `v2_snip12` via `set_session_signature_mode(2)`.

## Owner utilities

Owner-only entrypoints:

- `set_session_signature_mode(new_mode)`
- `compute_session_message_hash(...)` (active mode)
- `compute_session_message_hash_v1(...)`
- `compute_session_message_hash_v2(...)`

Public read-only entrypoint:

- `get_session_signature_mode()`

Session keys are blocked from calling mode/hash admin entrypoints by selector denylist.

## Conformance vectors

Cross-repo vectors live in:

- `spec/session-signature-v2.json`
- `spec/session-signature-v2.schema.json`

The `sessionVectors` section includes both `v1_legacy` and `v2_snip12` valid/invalid cases.

## Rollout checklist

1. Deploy class hash containing mode-gated verification.
2. Verify owner controls and denylist behavior on Sepolia.
3. Run conformance CI and contract tests.
4. Upgrade production accounts to `v2_snip12` using `set_session_signature_mode(2)`.
5. Confirm no remaining `v1_legacy` accounts before deprecating client-side v1 signing paths.
