# Mainnet Ownership and Signer Policy (No-Backend Launch)

This policy defines who can execute privileged on-chain actions for production
contracts in the no-backend, self-custodial launch profile.

## Scope

Contracts in scope:

- ERC-8004 registries (Identity, Reputation, Validation)
- AgentAccountFactory
- SessionAccount class deployment/upgrade path

## Policy

1. Production owner role MUST be a multisig account, not a single EOA.
2. Minimum threshold: `2-of-3` signers.
3. Each signer key MUST be hardware-backed and controlled by different humans.
4. Temporary single-signer ownership is only allowed during controlled migration
   windows and must be less than 24h with explicit incident note.
5. Any owner rotation requires:
   - pre-announced maintenance window
   - post-rotation verification output attached to the tracking issue
6. Emergency actions (ownership transfer, upgrade, or freeze-equivalent action)
   require explicit postmortem notes within 24h.

## Current State / Migration Requirement

Current owner value recorded in `docs/DEPLOYMENT_TRUTH_SHEET.md` for all three
mainnet registries:

- `0x023ad71d10539a910f291472c3dfad913bb6306218ffd65ac97e79d13aad4aaf`

Before closing `#332`, one of the following must be attached as evidence:

1. Attestation that this address is already a policy-compliant `2-of-3`
   multisig with hardware-backed, split custody signers.
2. Ownership migration evidence (tx hashes + verification output) proving all
   in-scope contracts now resolve to a policy-compliant multisig.

## Roles

- `contracts-owner`: executes deploy/upgrade transactions
- `security-owner`: validates signer policy and verifies resulting on-chain owner
- `coordinator`: records evidence links in launch-gate issue threads

## Canonical Verification Procedure

Use deployment addresses from `docs/DEPLOYMENT_TRUTH_SHEET.md`.

Environment:

```bash
# set addresses using the same input model from
# docs/security/PRODUCTION_DEPLOYMENT_RUNBOOK.md
export RPC_URL="<starknet-mainnet-rpc>"
export EXPECTED_MULTISIG="<multisig_address_felt>"
export IDENTITY_REGISTRY="<identity_registry_addr>"
export REPUTATION_REGISTRY="<reputation_registry_addr>"
export VALIDATION_REGISTRY="<validation_registry_addr>"
export AGENT_ACCOUNT_FACTORY="<agent_account_factory_addr>"
export SESSION_ACCOUNT_ADDR="<session_account_addr>"
export EXPECTED_SESSION_PUBLIC_KEY="<expected_session_account_public_key>"
export EXPECTED_SESSION_TIMELOCK_FLOOR="<minimum_timelock_seconds>"
```

Verify registry owners:

```bash
starkli call "$IDENTITY_REGISTRY" owner --rpc "$RPC_URL"
starkli call "$REPUTATION_REGISTRY" owner --rpc "$RPC_URL"
starkli call "$VALIDATION_REGISTRY" owner --rpc "$RPC_URL"
```

Verify factory owner:

```bash
starkli call "$AGENT_ACCOUNT_FACTORY" get_owner --rpc "$RPC_URL"
```

Verify SessionAccount authority/upgrade path (sample at least one production
instance):

```bash
starkli call "$SESSION_ACCOUNT_ADDR" get_public_key --rpc "$RPC_URL"
starkli call "$SESSION_ACCOUNT_ADDR" get_upgrade_info --rpc "$RPC_URL"
```

Validate SessionAccount checks against expected values:

```bash
SESSION_PUBLIC_KEY="$(starkli call "$SESSION_ACCOUNT_ADDR" get_public_key --rpc "$RPC_URL")"
echo "Expected session public key: $EXPECTED_SESSION_PUBLIC_KEY"
echo "Observed session public key: $SESSION_PUBLIC_KEY"
# assert SESSION_PUBLIC_KEY equals EXPECTED_SESSION_PUBLIC_KEY

UPGRADE_INFO="$(starkli call "$SESSION_ACCOUNT_ADDR" get_upgrade_info --rpc "$RPC_URL")"
echo "Observed upgrade info tuple: $UPGRADE_INFO"
# tuple order (0-based): [0]=pending_upgrade, [1]=upgrade_scheduled_at,
# [2]=upgrade_delay, [3]=current_block_timestamp
# assert UPGRADE_INFO[2] (upgrade_delay) >= EXPECTED_SESSION_TIMELOCK_FLOOR
# assert UPGRADE_INFO[0] (pending_upgrade) == 0x0 outside approved maintenance window
```

Acceptance check:

- every returned owner MUST equal `EXPECTED_MULTISIG`
- SessionAccount authority MUST resolve to `EXPECTED_SESSION_PUBLIC_KEY`
- SessionAccount `get_upgrade_info` MUST show:
  - no pending upgrade outside approved maintenance window
  - timelock delay at or above `EXPECTED_SESSION_TIMELOCK_FLOOR`
- output links/screenshots MUST be attached to the relevant issue/PR

Note: SessionAccount uses account-key/self-call authority rather than a
separate Ownable admin slot. Execution evidence should be linked with
`docs/security/PRODUCTION_DEPLOYMENT_RUNBOOK.md` and
`docs/security/SPENDING_POLICY_AUDIT.md`.

## Rotation Procedure

1. Prepare new multisig (if changing multisig address) and validate threshold.
2. Submit owner transfer txs for every in-scope contract.
3. Wait finality, then run canonical verification commands above.
4. Attach transaction hashes + verification output to issue tracker.
5. Update `docs/DEPLOYMENT_TRUTH_SHEET.md` and launch tracker links.
6. Update the `Current State / Migration Requirement` section in this document
   with the new multisig address and evidence links.

## Incident / Rollback

- If unexpected owner value is detected:
  1. stop further privileged operations
  2. re-run verification from a second RPC provider
  3. execute emergency owner recovery transaction
  4. post incident note with tx hash + timeline

## Tracking

This document is evidence for:

- `#332` mainnet ownership/signer policy
- `#273` no-backend launch gate
