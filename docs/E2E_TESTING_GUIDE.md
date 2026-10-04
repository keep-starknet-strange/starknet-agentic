# E2E Testing Guide (Starknet Sepolia)

End-to-end runs against Starknet Sepolia. Two suites live in this repo:

| Suite | What it covers | Where |
|---|---|---|
| ERC-8004 registries | Identity, Reputation, Validation registries (Node test runner) | [Part A](#part-a-erc-8004-registries) |
| SessionAccount spending policy | Session keys + per-token spending limits on `contracts/session-account` (starkli + session-key helper) | [Part B](#part-b-sessionaccount-spending-policy) |

Contract deployments, including Sepolia, require human review (see `CLAUDE.md` boundaries).
Never commit keys, keystores, or `.env` files.

---

## Part A: ERC-8004 Registries

Full details: [`contracts/erc8004-cairo/e2e-tests/README.md`](../contracts/erc8004-cairo/e2e-tests/README.md).

1. Put credentials in `contracts/erc8004-cairo/.env` (read by both the deploy script and the tests):
   - `STARKNET_RPC_URL`: Sepolia RPC endpoint
   - `DEPLOYER_ADDRESS`, `DEPLOYER_PRIVATE_KEY`: funded deployer / contract owner
   - `TEST_ACCOUNT_ADDRESS`, `TEST_ACCOUNT_PRIVATE_KEY`: second funded account (client/validator)
2. Deploy the registries (writes `deployed_addresses.json`). The script reads the variables from your shell, so export them first:

   ```bash
   cd contracts/erc8004-cairo
   set -a; source .env; set +a
   bash scripts/deploy_sepolia.sh
   ```

3. Run the suite:

   ```bash
   cd e2e-tests
   npm install
   npm test            # or: npm run test:identity | test:reputation | test:validation
   ```

---

## Part B: SessionAccount Spending Policy

### Prerequisites

Tools:
- `starkli` (the deploy and runner scripts call it). Flags change between releases; check `starkli --help` if a command is rejected.
- Node.js 24+ and `pnpm install` at the repo root, for the session-key helper in `packages/session-account-e2e` (see [Session-key transactions](#session-key-transactions)).
- Scarb and Starknet Foundry at the versions CI installs (`.github/workflows/ci.yml`). `contracts/session-account/Scarb.toml` declares the matching `starknet` and `snforge_std` dependencies.
- GNU grep. `scripts/deploy_sepolia.sh` uses `grep -P`, which macOS's BSD grep does not support. On macOS, install GNU grep (`brew install grep`) and put its `gnubin` directory first on `PATH`.

Accounts:
- **Deployer account**: deploys contracts, needs Sepolia STRK for fees ([faucet](https://starknet-faucet.vercel.app/)).
- **Owner key**: master key for the SessionAccount (constructor argument `public_key`). Owner-only entrypoints (`add_or_update_session_key`, `set_spending_policy`, ...) require the SessionAccount to call itself, so owner steps are sent *from the SessionAccount* with this key, not from the deployer.
- **Session keypair**: generated below.

Environment:

```bash
export STARKNET_RPC=<your Sepolia RPC URL>
export STARKNET_KEYSTORE=~/.starknet_accounts/deployer-keystore.json
export STARKNET_ACCOUNT=~/.starknet_accounts/deployer-account.json

# One-time, if you don't have a deployer account yet:
starkli signer keystore new $STARKNET_KEYSTORE   # create the signer first
starkli account oz init $STARKNET_ACCOUNT        # uses $STARKNET_KEYSTORE
# Fund the printed address with Sepolia STRK, then:
starkli account deploy $STARKNET_ACCOUNT
```

Tokens: use an existing Sepolia ERC-20 or deploy mock tokens (for example 6-decimal MockUSDC, 18-decimal MockWETH). Amounts below assume 6 decimals.

### Quick path (scripted)

**1. Deploy SessionAccount** (from the repo root):

```bash
bash scripts/deploy_sepolia.sh
# Prompts for the owner public key, then builds, declares and deploys.
```

The script prints `export` lines for `SESSION_ACCOUNT_ADDRESS` and `CLASS_HASH`; run them. It also writes a local `docs/DEPLOYED_CONTRACTS.md`. The canonical deployment record is [`DEPLOYMENT_TRUTH_SHEET.md`](./DEPLOYMENT_TRUTH_SHEET.md).

**2. Create the owner and session-key credentials, and fund the SessionAccount:**

```bash
# Owner: a starkli account file whose address is the SessionAccount itself (open_zeppelin
# variant: SessionAccount validates 2-felt owner signatures like an OZ account).
export OWNER_PUBKEY=0x...     # the key passed to the deploy script
cat > ~/.starknet_accounts/session-owner.json << EOF
{
  "version": 1,
  "variant": { "type": "open_zeppelin", "version": 1, "public_key": "$OWNER_PUBKEY" },
  "deployment": { "status": "deployed", "class_hash": "$CLASS_HASH", "address": "$SESSION_ACCOUNT_ADDRESS" }
}
EOF
starkli signer keystore from-key ~/.starknet_accounts/session-owner-keystore.json
# Enter the owner private key and a password when prompted
export SESSION_OWNER_ACCOUNT=~/.starknet_accounts/session-owner.json
export SESSION_OWNER_KEYSTORE=~/.starknet_accounts/session-owner-keystore.json

# Session key: the helper reads the private key from the environment only.
starkli signer gen-keypair
export SESSION_PUBKEY=0x...           # from output
export SESSION_PRIVATE_KEY=0x...      # from output; testnet only, keep it secret

export TOKEN_ADDRESS=0x...            # Sepolia ERC-20 under test
```

Fund `$SESSION_ACCOUNT_ADDRESS` with Sepolia STRK (owner and session-key transactions are both sent from it and pay their own fees) and at least 3400 tokens of `$TOKEN_ADDRESS` (3400000000 base units at 6 decimals), which the happy-path rows transfer to `0xDEADBEEF` and `0xBEEF1..3`.

**3. Run the scripted suite:**

```bash
bash scripts/e2e_test_runner.sh \
  --account "$SESSION_ACCOUNT_ADDRESS" \
  --session-key "$SESSION_PUBKEY" \
  --token "$TOKEN_ADDRESS"
# --skip-setup skips adding the session key and policy
```

Setup adds the session key (7 days, 100 calls, `transfer`-only whitelist) and sets a 1000/5000/24h policy with starkli as the owner. Every session-key row then runs through the helper, which asserts the row's outcome itself:

| Row | Helper expectation | Passes only if |
|---|---|---|
| Transfer 500, transfer 1000 (cumulative 1500) | success | the transaction is submitted, `SUCCEEDED`, and SessionAccount emitted no `CallFailed` event |
| Transfer 1500 | `revert` `Spending: exceeds per-call` | `__execute__` reverts with that reason |
| Multicall 4 x 1000 (1500 + 4000 > 5000) | `revert` `Spending: exceeds window limit` | `__execute__` reverts with that reason; each transfer stays within the per-call cap, which is checked first |
| Session key calls `set_spending_policy` / `remove_spending_policy` | `reject` | a control call (0-token `transfer`) validates with the same key and nonce, then `__validate__` rejects the target call |
| Transfer exactly 1000; multicall 3 x 300 (cumulative 3400) | success | as above |

Revert and reject rows run as fee estimates with validation enabled: the node runs `__validate__` and `__execute__` against current state with the real session signature, and nothing is submitted (no fee, no session call used, counters unchanged). A spending-policy reason can only appear after `__validate__` accepted the signature. A `__validate__` rejection has no reason string, and a bad signature produces the same node error, so the control call is what rules out a signature problem. `--skip-setup` continues from the current `spent_in_window`; re-run setup (setting the policy resets the counter) before repeating the suite inside one window.

### Session-key transactions

SessionAccount accepts a session key only when the signature has four elements, `[session_pubkey, r, s, valid_until]`, signed over the session message hash for the account's session signature mode (`get_session_signature_mode()`: v1 legacy or v2 SNIP-12, see [`SESSION_SIGNATURE_MODE_MIGRATION.md`](./security/SESSION_SIGNATURE_MODE_MIGRATION.md)). starkli only produces the two-element owner signature `[r, s]`, so it cannot send session-key transactions. Use the helper instead:

```bash
# Run from the repo root; STARKNET_RPC and SESSION_PRIVATE_KEY must be exported.
export RECIPIENT=0x...   # any address
node packages/session-account-e2e/src/cli.ts \
  --account "$SESSION_ACCOUNT_ADDRESS" --session-key "$SESSION_PUBKEY" \
  --call "${TOKEN_ADDRESS}:transfer:${RECIPIENT},500000000,0"
```

- `--call <to>:<entrypoint>[:<felt>,...]` takes the function name, not a selector, and repeats for a multicall. u256 amounts are two felts (low, high). Write `${VAR}:` with braces: in zsh, `$VAR:t...` is a history modifier.
- `--expect revert --reason "<panic string>"` and `--expect reject --control-call <spec>` check failure rows as described above. Exit code 0 means the expectation held, 1 that it did not, 2 a usage or precondition error (unregistered or expired key, wrong private key, mainnet RPC).
- The helper reads the signature mode and the session's `valid_until` from the account, refuses a private key that does not match `--session-key`, and signs the exact `__execute__` calldata it submits. Its hashes are tested against `spec/session-signature-v2.json`, and the session-account snforge suite pins the contract to the same vectors.

### Manual test matrix

Selectors used below: `transfer` = `0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e`, `approve` = `0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c`. Owner calls use `--account $SESSION_OWNER_ACCOUNT --keystore $SESSION_OWNER_KEYSTORE`. Session-key rows go through the helper ([Session-key transactions](#session-key-transactions)); starkli cannot produce that signature.

#### Setup

Add the session key (owner):

```bash
starkli invoke $SESSION_ACCOUNT_ADDRESS add_or_update_session_key \
  $SESSION_PUBKEY \
  u64:$(($(date +%s) + 604800)) \
  u32:100 \
  array:1:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e \
  --account $SESSION_OWNER_ACCOUNT --keystore $SESSION_OWNER_KEYSTORE
```

Verify with `get_session_data($SESSION_PUBKEY)`.

Set the spending policy, 1000 per call / 5000 per 24h window (owner):

```bash
starkli invoke $SESSION_ACCOUNT_ADDRESS set_spending_policy \
  $SESSION_PUBKEY $TOKEN_ADDRESS \
  u256:1000000000 u256:5000000000 u64:86400 \
  --account $SESSION_OWNER_ACCOUNT --keystore $SESSION_OWNER_KEYSTORE
```

Expect a `SpendingPolicySet` event. Query state at any time:

```bash
starkli call $SESSION_ACCOUNT_ADDRESS get_spending_policy $SESSION_PUBKEY $TOKEN_ADDRESS
# -> max_per_call, max_per_window, window_seconds, spent_in_window, window_start
```

Transfer with the session key (500 tokens to `RECIPIENT`):

```bash
node packages/session-account-e2e/src/cli.ts \
  --account "$SESSION_ACCOUNT_ADDRESS" --session-key "$SESSION_PUBKEY" \
  --call "${TOKEN_ADDRESS}:transfer:${RECIPIENT},500000000,0"   # u256 amount = (low, high)
```

The policy checks the per-call limit before the window limit, so a transfer above 1000 always fails with `Spending: exceeds per-call`. Window-limit rows below use transfers of at most 1000.

#### Happy path

| # | Scenario | Expected |
|---|---|---|
| 2.1 | Add session key | Succeeds; visible via `get_session_data` |
| 2.2 | Set policy 1000/5000/24h | Succeeds; `SpendingPolicySet` emitted |
| 2.3 | Transfer 500 | Succeeds; `spent_in_window = 500000000` |
| 2.4 | Transfers of 500, 1000, 1000, 1000 in one window (3500 < 5000) | All succeed; `spent_in_window = 3500000000` |
| 2.5 | After 24h + 1s, transfer 1000 | Succeeds; `spent_in_window` resets to `1000000000` |

#### Failure path

| # | Scenario | Expected |
|---|---|---|
| 3.1 | Transfer 1500 (> per-call 1000) | Reverts with `Spending: exceeds per-call`; state unchanged |
| 3.2 | After 3500 spent, one multicall of two 1000 transfers (3500 + 2000 = 5500 > 5000) | Reverts with `Spending: exceeds window limit`; `spent_in_window` stays 3500000000 |
| 3.3 | Session key calls `set_spending_policy` | Rejected by `__validate__`; policy unchanged |
| 3.4 | Session key calls `remove_spending_policy` | Rejected by `__validate__`; policy still active |

For 3.3 and 3.4, `__validate__` applies three session call checks in order: the admin-selector blocklist, the self-call guard (no session call may target the account), and the entrypoint whitelist. With the runner's setup all three reject these calls. The snforge suite (`test_blocklist_*`) covers each check on its own.

#### Edge cases

| # | Scenario | Expected |
|---|---|---|
| 4.1 | Seed `spent_in_window = 4500000000` (e.g. 1000 x 4 + 500). At exactly `window_start + 86400`, transfer 1000; then transfer 1000 at +1s | At the boundary it reverts (window not reset; 5500 > 5000); at +1s it succeeds and `spent_in_window` resets to `1000000000`. This separates strict `>` from `>=`; exact timestamps are only practical in snforge tests |
| 4.2 | Multicall of 5 x 500 transfers in one tx | All succeed; `spent_in_window = 2500000000` (cumulative tracking) |
| 4.3 | Transfer exactly 1000 (per-call) and exactly 5000 total (window) | Succeeds (limits are inclusive) |
| 4.4 | Non-spending selector (`balanceOf`) via `__execute__` | Succeeds; `spent_in_window` unchanged |
| 4.5 | `approve(spender, 1000)` via `__execute__` | Succeeds; counted as spending (+1000000000) |

Rows 4.4 and 4.5 call selectors outside the runner's `transfer`-only whitelist. Re-add the session key with those selectors in `allowed_entrypoints` (or an empty whitelist, which allows any non-admin selector) first, otherwise `__validate__` rejects them.

#### Policy management (owner)

| # | Scenario | Expected |
|---|---|---|
| 5.1 | `remove_spending_policy(session_key, token)` | Succeeds; `SpendingPolicyRemoved`; `get_spending_policy` returns zeros |
| 5.2 | Large transfer (> 5000) after removal | Succeeds (no enforcement) |
| 5.3 | Raise limits to 2000/10000/24h | `get_spending_policy` reflects new limits |
| 5.4 | Separate policies for two tokens (e.g. USDC 1000/5000, WETH 0.5/2) | Tracked independently per token |

#### Load (optional)

No load-test script is checked in. A reasonable target is 100 transfers of 50 tokens over one hour; track success rate, confirmation time, fee per transaction, and that cumulative `spent_in_window` stays consistent.

#### Monitoring

```bash
watch -n 300 'starkli call $SESSION_ACCOUNT_ADDRESS get_spending_policy $SESSION_PUBKEY $TOKEN_ADDRESS'
starkli events $SESSION_ACCOUNT_ADDRESS --from-block <START_BLOCK>   # SpendingPolicySet / SpendingPolicyRemoved
starkli call $TOKEN_ADDRESS balanceOf $SESSION_ACCOUNT_ADDRESS
```

### Security expectations

Threat model, attack simulations, and known limitations are in [`security/SPENDING_POLICY_AUDIT.md`](./security/SPENDING_POLICY_AUDIT.md). E2E runs should confirm on-chain what that audit claims:

- Window-boundary double-spend, same-block bypass, reentrancy, overflow, and admin-function bypass are blocked.
- `transferFrom` is not tracked (it needs a prior tracked `approve`).
- Failed calls still count against the limit (fail-closed).
- A zero `max_per_window` disables window enforcement (by design).

If a run contradicts the audit: stop, record exact reproduction steps and transaction hashes, fix and re-run unit tests, then redeploy and re-test the affected scenarios.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `Transaction reverted` | Check the SessionAccount's STRK balance (it pays fees for owner and session-key transactions) and the contract address |
| `Account: unauthorized` during setup | Owner steps were sent from another account. `SESSION_OWNER_ACCOUNT` must point at the SessionAccount address with the owner key |
| `Spending: exceeds per-call` / `exceeds window limit` | Expected in failure-path tests; otherwise lower the amount or raise the policy |
| Helper: `not registered`, `expired` or `call budget exhausted` | Re-run setup (`add_or_update_session_key`) for `$SESSION_PUBKEY` |
| Helper: `Session private key does not match` | `SESSION_PRIVATE_KEY` is not the key for `--session-key` |
| Helper: `control call did not validate` | The session signature itself is rejected: wrong key, key not whitelisted for `transfer`, or a client/contract signature-mode mismatch. Check `get_session_signature_mode` and `get_session_data` |
| Helper: `succeeded but SessionAccount emitted CallFailed` | The inner call failed (for example insufficient token balance); SessionAccount does not revert on failed inner calls, so the spend still counts |
| `Failed to extract class hash` from the deploy script | `grep -P` unsupported; use GNU grep (see prerequisites) |

### Exit criteria

- All happy-path, failure-path, edge-case, and policy-management scenarios behave as expected.
- No bypass contradicts the audit; state stays consistent.
- Results (transaction hashes, fees, any issues and mitigations) are recorded in the PR or issue tracking the run before any mainnet planning.
