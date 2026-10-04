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
# Signer for DEPLOYER_ACCOUNT, used by sncast (Starknet Foundry). Keystore flow: the
# account JSON for that address plus its encrypted keystore. Ledger flow: see Step 3.
export DEPLOYER_ACCOUNT_FILE="<path_to_account_json>"
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
normalize_felt() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  value="${value#0x}"
  value="$(printf '%s' "$value" | sed -E 's/^0+//')"
  [ -n "$value" ] || value="0"
  printf '0x%s\n' "$value"
}

normalized_deployer="$(normalize_felt "$DEPLOYER_ACCOUNT")"
normalized_expected_multisig="$(normalize_felt "$EXPECTED_MULTISIG")"
test "$normalized_deployer" = "$normalized_expected_multisig" \
  || { echo "DEPLOYER_ACCOUNT must equal EXPECTED_MULTISIG"; exit 1; }

# Keystore flow: the account file sncast signs with must be DEPLOYER_ACCOUNT.
if [ -n "$DEPLOYER_ACCOUNT_FILE" ]; then
  deployer_file_address="$(
    grep -oE '"address": ?"0x[0-9a-fA-F]+"' "$DEPLOYER_ACCOUNT_FILE" | grep -oE '0x[0-9a-fA-F]+'
  )"
  test "$(normalize_felt "$deployer_file_address")" = "$normalized_deployer" \
    || { echo "DEPLOYER_ACCOUNT_FILE address does not match DEPLOYER_ACCOUNT"; exit 1; }
fi

# Helpers for sncast --json output (one JSON object per line).
json_hex_field() {  # last 0x value of field $1
  grep -oE "\"$1\": ?\"0x[0-9a-fA-F]+\"" | tail -n 1 | grep -oE '0x[0-9a-fA-F]+'
}
call_felt() {  # first felt returned by view function $2 on contract $1
  sncast --json call --url "$RPC_URL" --contract-address "$1" --function "$2" \
    | grep -oE '"response_raw": ?\[[^]]*\]' | grep -oE '0x[0-9a-fA-F]+' | sed -n '1p'
}
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
(cd contracts/agent-account && scarb --release build)
COMPUTED_AGENT_ACCOUNT_CLASS_HASH="$(normalize_felt "$(
  sncast --json utils class-hash \
    --sierra-file contracts/agent-account/target/release/agent_account_AgentAccount.contract_class.json \
    | json_hex_field class_hash
)")"
COMPUTED_FACTORY_CLASS_HASH="$(normalize_felt "$(
  sncast --json utils class-hash \
    --sierra-file contracts/agent-account/target/release/agent_account_AgentAccountFactory.contract_class.json \
    | json_hex_field class_hash
)")"

echo "Expected agent-account: $EXPECTED_AGENT_ACCOUNT_CLASS_HASH"
echo "Computed agent-account: $COMPUTED_AGENT_ACCOUNT_CLASS_HASH"
test "$COMPUTED_AGENT_ACCOUNT_CLASS_HASH" = "$(normalize_felt "$EXPECTED_AGENT_ACCOUNT_CLASS_HASH")" \
  || { echo "AgentAccount class hash mismatch"; exit 1; }

echo "Expected factory: $EXPECTED_FACTORY_CLASS_HASH"
echo "Computed factory: $COMPUTED_FACTORY_CLASS_HASH"
test "$COMPUTED_FACTORY_CLASS_HASH" = "$(normalize_felt "$EXPECTED_FACTORY_CLASS_HASH")" \
  || { echo "Factory class hash mismatch"; exit 1; }
```

Expected hashes must come from auditor-attested closure evidence in `#334`.
Record comparison output and attach to issue evidence.

## Step 2: Mainnet Go/No-Go Human Sign-Off

Before Step 3, post a second approval record (mainnet target) in `#333` and
link it from `#273` with reviewer identity + timestamp + commit/PR reference.
No mainnet declaration/deploy command should execute without this record.

## Step 3: Declare Classes (Mainnet)

Use one signer flow only. `sncast declare --contract-name` builds the package
itself (release profile), so run it from `contracts/agent-account`.

- keystore (recommended):

```bash
SNCAST_SIGNER=(--account "$DEPLOYER_ACCOUNT_FILE" --keystore "$KEYSTORE_PATH")
```

- hardware wallet: register the Ledger-backed deployer in sncast's accounts file
  once (no private key leaves the device), then sign with that account name and
  confirm each transaction on the device:

```bash
sncast account import --name prod-deployer --address "$DEPLOYER_ACCOUNT" \
  --type <account-type> --ledger-account-id <ledger-account-index> --url "$RPC_URL"
SNCAST_SIGNER=(--account prod-deployer)
```

Declare both classes with the chosen signer:

```bash
declare_agent_output="$(
  cd contracts/agent-account && sncast --json "${SNCAST_SIGNER[@]}" --wait \
    declare --contract-name AgentAccount --url "$RPC_URL" 2>&1
)"
printf '%s\n' "$declare_agent_output"
DECLARED_AGENT_ACCOUNT_CLASS_HASH="$(
  normalize_felt "$(printf '%s\n' "$declare_agent_output" | json_hex_field class_hash)"
)"
test "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" != "0x0" \
  || { echo "Failed to parse AgentAccount class hash from declare output"; exit 1; }

declare_factory_output="$(
  cd contracts/agent-account && sncast --json "${SNCAST_SIGNER[@]}" --wait \
    declare --contract-name AgentAccountFactory --url "$RPC_URL" 2>&1
)"
printf '%s\n' "$declare_factory_output"
DECLARED_FACTORY_CLASS_HASH="$(
  normalize_felt "$(printf '%s\n' "$declare_factory_output" | json_hex_field class_hash)"
)"
test "$DECLARED_FACTORY_CLASS_HASH" != "0x0" \
  || { echo "Failed to parse Factory class hash from declare output"; exit 1; }
```

Do not sign production operations with an sncast accounts-file entry that
holds a private key (`account create`, or `account import --private-key`): the
accounts file stores keys unencrypted. Ledger entries store only the derivation
path.

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
deploy_factory_output="$(
  sncast --json "${SNCAST_SIGNER[@]}" --wait deploy --url "$RPC_URL" \
    --class-hash "$DECLARED_FACTORY_CLASS_HASH" \
    --constructor-calldata "$DECLARED_AGENT_ACCOUNT_CLASS_HASH" "$IDENTITY_REGISTRY" 2>&1
)"
printf '%s\n' "$deploy_factory_output"
```

The same command works for both signer flows (`SNCAST_SIGNER` from Step 3).

## Step 5: Runtime Verification

First, set `FACTORY_ADDRESS` to the deployed factory address returned by the
Step 4 deployment output (`contract_address`):

```bash
export FACTORY_ADDRESS="$(printf '%s\n' "$deploy_factory_output" | json_hex_field contract_address)"
test -n "$FACTORY_ADDRESS" || { echo "Failed to parse factory address from Step 4"; exit 1; }
```

```bash
normalize_felt() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  value="${value#0x}"
  value="$(printf '%s' "$value" | sed -E 's/^0+//')"
  [ -n "$value" ] || value="0"
  printf '0x%s\n' "$value"
}

call_felt() {  # first felt returned by view function $2 on contract $1
  sncast --json call --url "$RPC_URL" --contract-address "$1" --function "$2" \
    | grep -oE '"response_raw": ?\[[^]]*\]' | grep -oE '0x[0-9a-fA-F]+' | sed -n '1p'
}

normalized_expected_multisig="$(normalize_felt "$EXPECTED_MULTISIG")"
normalized_deployer="$(normalize_felt "$DEPLOYER_ACCOUNT")"
normalized_expected_identity_registry="$(normalize_felt "$IDENTITY_REGISTRY")"
normalized_expected_agent_class_hash="$(normalize_felt "$DECLARED_AGENT_ACCOUNT_CLASS_HASH")"

factory_owner="$(
  normalize_felt "$(call_felt "$FACTORY_ADDRESS" get_owner)"
)"
factory_identity_registry="$(
  normalize_felt "$(call_felt "$FACTORY_ADDRESS" get_identity_registry)"
)"
factory_account_class_hash="$(
  normalize_felt "$(call_felt "$FACTORY_ADDRESS" get_account_class_hash)"
)"
identity_owner="$(
  normalize_felt "$(call_felt "$IDENTITY_REGISTRY" owner)"
)"
reputation_owner="$(
  normalize_felt "$(call_felt "$REPUTATION_REGISTRY" owner)"
)"
validation_owner="$(
  normalize_felt "$(call_felt "$VALIDATION_REGISTRY" owner)"
)"

echo "factory_owner=$factory_owner expected_multisig=$normalized_expected_multisig"
echo "factory_identity_registry=$factory_identity_registry expected_identity_registry=$normalized_expected_identity_registry"
echo "factory_account_class_hash=$factory_account_class_hash expected_agent_account_class_hash=$normalized_expected_agent_class_hash"
echo "identity_owner=$identity_owner"
echo "reputation_owner=$reputation_owner"
echo "validation_owner=$validation_owner"

test "$factory_owner" = "$normalized_deployer" \
  || { echo "Factory owner does not match DEPLOYER_ACCOUNT"; exit 1; }
test "$factory_owner" = "$normalized_expected_multisig" \
  || { echo "Factory owner does not match EXPECTED_MULTISIG"; exit 1; }
test "$factory_identity_registry" = "$normalized_expected_identity_registry" \
  || { echo "Factory identity registry mismatch"; exit 1; }
test "$factory_account_class_hash" = "$normalized_expected_agent_class_hash" \
  || { echo "Factory account class hash mismatch"; exit 1; }
test "$identity_owner" = "$normalized_expected_multisig" \
  || { echo "Identity registry owner mismatch"; exit 1; }
test "$reputation_owner" = "$normalized_expected_multisig" \
  || { echo "Reputation registry owner mismatch"; exit 1; }
test "$validation_owner" = "$normalized_expected_multisig" \
  || { echo "Validation registry owner mismatch"; exit 1; }

echo "Step 5 PASS: ownership and class/registry bindings verified."
```

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
