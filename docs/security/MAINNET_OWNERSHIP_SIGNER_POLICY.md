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
export RPC_URL="<starknet-mainnet-rpc>"
export EXPECTED_MULTISIG="<multisig_address_felt>"
```

Verify registry owners:

```bash
starkli call <identity_registry_addr> owner --rpc "$RPC_URL"
starkli call <reputation_registry_addr> owner --rpc "$RPC_URL"
starkli call <validation_registry_addr> owner --rpc "$RPC_URL"
```

Verify factory owner:

```bash
starkli call <agent_account_factory_addr> get_owner --rpc "$RPC_URL"
```

Acceptance check:

- every returned owner MUST equal `EXPECTED_MULTISIG`
- output links/screenshots MUST be attached to the relevant issue/PR

## Rotation Procedure

1. Prepare new multisig (if changing multisig address) and validate threshold.
2. Submit owner transfer txs for every in-scope contract.
3. Wait finality, then run canonical verification commands above.
4. Attach transaction hashes + verification output to issue tracker.
5. Update `docs/DEPLOYMENT_TRUTH_SHEET.md` and launch tracker links.

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
