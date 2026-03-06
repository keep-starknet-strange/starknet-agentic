# Production Deployment Runbook (AgentAccountFactory + SessionAccount)

This runbook is the canonical procedure for production deployment operations in
the no-backend launch profile.

## Scope

- AgentAccount class declaration
- AgentAccountFactory declaration/deployment
- SessionAccount production deployment path
- Post-deploy verification and rollback

## Preconditions

- `docs/DEPLOYMENT_TRUTH_SHEET.md` reviewed and current.
- Ownership policy approved in
  `docs/security/MAINNET_OWNERSHIP_SIGNER_POLICY.md`.
- Latest `main` CI is green for contracts and security workflows.
- Deployment actor has funded mainnet account + signer rights.
- `DEPLOYER_ACCOUNT` must be the target production multisig
  (`EXPECTED_MULTISIG`) for factory deployment.
- Human approval records are mandatory:
  - before Step 0 (Sepolia dry run)
  - again before any mainnet declaration/deploy action
- Approval record fields (required):
  - reviewer identity (`contracts-owner` or `security-owner`)
  - ISO 8601 timestamp
  - target network (`sepolia` or `mainnet`)
  - linked PR/issue/evidence URL
- Store approval records as signed comments in `#333` and `#273`.

## Required Inputs

```bash
export SEPOLIA_RPC_URL="<starknet-sepolia-rpc>"
export RPC_URL="<starknet-mainnet-rpc>"
export DEPLOYER_ACCOUNT="<account_address>"
export KEYSTORE_PATH="<path_to_encrypted_keystore>"

export IDENTITY_REGISTRY="<identity_registry_addr>"
export REPUTATION_REGISTRY="<reputation_registry_addr>"
export VALIDATION_REGISTRY="<validation_registry_addr>"
export EXPECTED_MULTISIG="<multisig_owner_addr>"
export EXPECTED_AGENT_ACCOUNT_CLASS_HASH="<audit_attested_agent_account_hash>"
export EXPECTED_FACTORY_CLASS_HASH="<audit_attested_factory_hash>"
```

Hard guard before any declare/deploy action:

```bash
normalized_deployer="$(printf '%s' "$DEPLOYER_ACCOUNT" | tr '[:upper:]' '[:lower:]')"
normalized_expected_multisig="$(printf '%s' "$EXPECTED_MULTISIG" | tr '[:upper:]' '[:lower:]')"
test "$normalized_deployer" = "$normalized_expected_multisig" \
  || { echo "DEPLOYER_ACCOUNT must equal EXPECTED_MULTISIG"; exit 1; }
```

## Step 0: Mandatory Sepolia Dry-Run Gate

Before any mainnet declaration/deploy action, run one full Sepolia dry run with
the same constructor argument order and verification procedure.

Minimum evidence required:

- Sepolia declaration tx hashes (AgentAccount + AgentAccountFactory)
- Sepolia deployment tx hash + factory address
- Sepolia output for:
  - `get_owner`
  - `get_identity_registry`
  - `get_account_class_hash`
  - registry `owner` checks (identity/reputation/validation)

Mainnet deployment is blocked until this evidence is attached.

## Step 1: Build and Class Hash Verification

```bash
scarb build --release
COMPUTED_AGENT_ACCOUNT_CLASS_HASH="$(
  starkli class-hash contracts/agent-account/target/release/agent_account_AgentAccount.contract_class.json
)"
COMPUTED_FACTORY_CLASS_HASH="$(
  starkli class-hash contracts/agent-account/target/release/agent_account_AgentAccountFactory.contract_class.json
)"

echo "Expected agent-account: $EXPECTED_AGENT_ACCOUNT_CLASS_HASH"
echo "Computed agent-account: $COMPUTED_AGENT_ACCOUNT_CLASS_HASH"
test "$COMPUTED_AGENT_ACCOUNT_CLASS_HASH" = "$EXPECTED_AGENT_ACCOUNT_CLASS_HASH" \
  || { echo "AgentAccount class hash mismatch"; exit 1; }

echo "Expected factory: $EXPECTED_FACTORY_CLASS_HASH"
echo "Computed factory: $COMPUTED_FACTORY_CLASS_HASH"
test "$COMPUTED_FACTORY_CLASS_HASH" = "$EXPECTED_FACTORY_CLASS_HASH" \
  || { echo "Factory class hash mismatch"; exit 1; }
```

Expected hashes must come from auditor-attested closure evidence in `#334`.
Record comparison output and attach to issue evidence.

## Step 2: Mainnet Go/No-Go Human Sign-Off

Before Step 3, post a second approval record (mainnet target) in `#333` and
link it from `#273` with reviewer identity + timestamp + commit/PR reference.
No mainnet declaration/deploy command should execute without this record.

## Step 3: Declare Classes (Mainnet)

Use one signer flow only:

- keystore (recommended):

```bash
declare_agent_output="$(
  starkli declare contracts/agent-account/target/release/agent_account_AgentAccount.contract_class.json \
    --rpc "$RPC_URL" --account "$DEPLOYER_ACCOUNT" --keystore "$KEYSTORE_PATH" \
    2>&1
)"
printf '%s\n' "$declare_agent_output"
DECLARED_AGENT_ACCOUNT_CLASS_HASH="$(
  printf '%s\n' "$declare_agent_output" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -nE 's/.*class hash[^0-9a-f]*(0x[0-9a-f]+).*/\1/p' \
    | tail -n 1
)"
test -n "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" \
  || { echo "Failed to parse AgentAccount class hash from declare output"; exit 1; }

declare_factory_output="$(
  starkli declare contracts/agent-account/target/release/agent_account_AgentAccountFactory.contract_class.json \
    --rpc "$RPC_URL" --account "$DEPLOYER_ACCOUNT" --keystore "$KEYSTORE_PATH" \
    2>&1
)"
printf '%s\n' "$declare_factory_output"
DECLARED_FACTORY_CLASS_HASH="$(
  printf '%s\n' "$declare_factory_output" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -nE 's/.*class hash[^0-9a-f]*(0x[0-9a-f]+).*/\1/p' \
    | tail -n 1
)"
test -n "$DECLARED_FACTORY_CLASS_HASH" \
  || { echo "Failed to parse Factory class hash from declare output"; exit 1; }
```

- hardware wallet:

```bash
starkli declare contracts/agent-account/target/release/agent_account_AgentAccount.contract_class.json \
  --rpc "$RPC_URL" --account "$DEPLOYER_ACCOUNT" --ledger
# Confirm on Ledger device, then copy the printed class hash:
export DECLARED_AGENT_ACCOUNT_CLASS_HASH="<class_hash_from_output>"
test -n "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" \
  || { echo "Missing DECLARED_AGENT_ACCOUNT_CLASS_HASH"; exit 1; }

starkli declare contracts/agent-account/target/release/agent_account_AgentAccountFactory.contract_class.json \
  --rpc "$RPC_URL" --account "$DEPLOYER_ACCOUNT" --ledger
# Confirm on Ledger device, then copy the printed class hash:
export DECLARED_FACTORY_CLASS_HASH="<class_hash_from_output>"
test -n "$DECLARED_FACTORY_CLASS_HASH" \
  || { echo "Missing DECLARED_FACTORY_CLASS_HASH"; exit 1; }
```

Do not use `--private-key` for production operations.

Assert declared class hashes match Step 1 computed hashes:

```bash
test "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" = "$COMPUTED_AGENT_ACCOUNT_CLASS_HASH" \
  || { echo "Declared AgentAccount hash mismatch"; exit 1; }
test "$DECLARED_FACTORY_CLASS_HASH" = "$COMPUTED_FACTORY_CLASS_HASH" \
  || { echo "Declared Factory hash mismatch"; exit 1; }
```

Record resulting class hashes and tx hashes.

## Step 4: Deploy AgentAccountFactory

Constructor parameters (in order):

- `account_class_hash = <declared_agent_account_class_hash>`
- `identity_registry = IDENTITY_REGISTRY`

Owner is set automatically to the deployer (`get_caller_address()`), so deploy
the factory from `EXPECTED_MULTISIG`.

Example:

keystore:

```bash
starkli deploy "$DECLARED_FACTORY_CLASS_HASH" \
  "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" \
  "$IDENTITY_REGISTRY" \
  --rpc "$RPC_URL" --account "$DEPLOYER_ACCOUNT" --keystore "$KEYSTORE_PATH"
```

hardware wallet:

```bash
starkli deploy "$DECLARED_FACTORY_CLASS_HASH" \
  "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" \
  "$IDENTITY_REGISTRY" \
  --rpc "$RPC_URL" --account "$DEPLOYER_ACCOUNT" --ledger
```

## Step 5: Runtime Verification

First, set `FACTORY_ADDRESS` to the deployed factory address returned by the
Step 4 deployment output/receipt:

```bash
export FACTORY_ADDRESS="<deployed_factory_address_from_step4>"
```

```bash
starkli call "$FACTORY_ADDRESS" get_owner --rpc "$RPC_URL"
starkli call "$FACTORY_ADDRESS" get_identity_registry --rpc "$RPC_URL"
starkli call "$FACTORY_ADDRESS" get_account_class_hash --rpc "$RPC_URL"
starkli call "$IDENTITY_REGISTRY" owner --rpc "$RPC_URL"
starkli call "$REPUTATION_REGISTRY" owner --rpc "$RPC_URL"
starkli call "$VALIDATION_REGISTRY" owner --rpc "$RPC_URL"
```

Acceptance checks:

- `get_owner(FACTORY_ADDRESS) == DEPLOYER_ACCOUNT == EXPECTED_MULTISIG`
- `get_identity_registry == IDENTITY_REGISTRY` (must not point to legacy set)
- `get_account_class_hash` matches declared AgentAccount class hash
- `owner(IDENTITY_REGISTRY) == EXPECTED_MULTISIG`
- `owner(REPUTATION_REGISTRY) == EXPECTED_MULTISIG`
- `owner(VALIDATION_REGISTRY) == EXPECTED_MULTISIG`

## Step 6: SessionAccount Production Path

SessionAccount rollout options:

1. Factory-based account creation in production flows (preferred)
2. Direct SessionAccount deploy only for controlled migrations

Required controls:

- record tx hashes, constructor args, and owner verification output
- verify spending policy enforcement paths before broad traffic
- enforce the following invariants with explicit pass/fail evidence:
  - time bounds (`valid_after` / `valid_until` / slot constraints)
  - per-call and per-window spend limits
  - allowlist and blocklist behavior
  - revocation and kill-switch semantics
  - expected allowed path and expected denied path for spending-policy checks

Required artifacts for SessionAccount changes:

- unit + integration test output links for each invariant above
- replayable commands/scripts used for checks
- tx hashes + constructor args + ownership/authority verification output
- monitoring/alert runbook link tied to failure modes
- explicit security reasoning note in PR/issue evidence

No SessionAccount changes merge without documented security reasoning and the
artifact set above.

## Step 7: Post-Deploy Smoke Checks

- [ ] create one test account via factory path
- [ ] validate session-key registration and revocation flow
- [ ] run one allowed transfer and one policy-denied transfer
- [ ] confirm audit logs/evidence links in issue tracker

## Rollback

Trigger rollback if:

- wrong owner or wrong registry binding detected
- declared/deployed class hash mismatch
- critical verification checks fail

Rollback actions:

1. halt new account creation flow
2. transfer owner to recovery multisig if needed
3. redeploy factory with correct constructor bindings
4. update canonical truth sheet and incident notes

## Evidence Package (Mandatory)

Attach the following to the tracking issue:

- declaration tx hashes
- deployment tx hash + deployed address
- Sepolia dry-run tx hashes + verification outputs
- class-hash comparison output vs `#334` audited manifest
- command outputs for `get_owner/get_identity_registry/get_account_class_hash`
- command outputs for registry `owner` checks (identity/reputation/validation)
- smoke-test output links
- residual risk note

## Tracking

This runbook is evidence for:

- `#333` production deployment runbook
- `#273` no-backend launch gate
