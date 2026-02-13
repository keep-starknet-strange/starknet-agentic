# E2E Testing Guide - Spending Policy on Sepolia

**Status**: 🟢 Ready for Execution
**Date**: 2026-02-12
**Target Network**: Starknet Sepolia Testnet

---

## Prerequisites

### 1. Environment Setup
```bash
# Required tools
- starkli (latest version)
- scarb 2.8.4
- snforge 0.33.0
- sncast (for deployments)

# Environment variables
export STARKNET_ACCOUNT=~/.starknet_accounts/deployer-account.json
export STARKNET_KEYSTORE=~/.starknet_accounts/deployer-keystore.json
export STARKNET_RPC=https://starknet-sepolia.public.blastapi.io/rpc/v0_7
```

### 2. Test Accounts Required
- **Deployer Account**: For deploying contracts (needs testnet ETH)
- **Owner Account**: Master key for SessionAccount
- **Session Key Pair**: Generated keypair for session key testing

### 3. Mock ERC-20 Tokens
Deploy or use existing Sepolia ERC-20s:
- Mock USDC (6 decimals)
- Mock WETH (18 decimals)

---

## Phase 1: Deployment

### Step 1.1: Compile Contracts
```bash
cd contracts/session-account
scarb build
```

**Expected Output:**
- `target/dev/session_account_SessionAccount.contract_class.json`
- Sierra class hash
- Compiled artifact ready for deployment

### Step 1.2: Declare SessionAccount Contract
```bash
starkli declare \
  target/dev/session_account_SessionAccount.contract_class.json \
  --account $STARKNET_ACCOUNT \
  --keystore $STARKNET_KEYSTORE \
  --rpc $STARKNET_RPC
```

**Expected Output:**
```
Class hash declared: 0x...
Transaction hash: 0x...
```

**Save class hash** to `DEPLOYED_CONTRACTS.md`

### Step 1.3: Deploy SessionAccount Instance
```bash
# Constructor: owner_pubkey (felt252)
OWNER_PUBKEY=0x123456789abcdef... # Your owner public key

starkli deploy \
  <CLASS_HASH> \
  $OWNER_PUBKEY \
  --account $STARKNET_ACCOUNT \
  --keystore $STARKNET_KEYSTORE \
  --rpc $STARKNET_RPC
```

**Expected Output:**
```
Contract deployed: 0x...
Transaction hash: 0x...
```

**Save contract address** to `DEPLOYED_CONTRACTS.md`

### Step 1.4: Deploy Mock ERC-20 Tokens (Optional)
If needed, deploy test tokens with generous supply:

```bash
# Mock USDC (6 decimals, 1M supply)
starkli deploy <ERC20_CLASS_HASH> \
  str:MockUSDC \
  str:MUSDC \
  u256:1000000000000 \
  <YOUR_ADDRESS> \
  --account $STARKNET_ACCOUNT

# Mock WETH (18 decimals, 1K supply)
starkli deploy <ERC20_CLASS_HASH> \
  str:MockWETH \
  str:MWETH \
  u256:1000000000000000000000 \
  <YOUR_ADDRESS> \
  --account $STARKNET_ACCOUNT
```

**Save token addresses** to `DEPLOYED_CONTRACTS.md`

---

## Phase 2: Happy Path Testing

### Test 2.1: Add Session Key
```bash
# Generate session keypair
starkli signer gen-keypair

# Save private key securely
# PUBLIC_KEY: 0x...

# Add session key to account
starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  add_or_update_session_key \
  <SESSION_PUBLIC_KEY> \
  u64:$(date -d '+7 days' +%s) \
  u32:100 \
  array:1:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e \
  --account $STARKNET_ACCOUNT
```

**Expected Result:** ✅ Transaction succeeds
**Verify:** Call `get_session_key_status(<SESSION_PUBLIC_KEY>)`

### Test 2.2: Set Spending Policy
```bash
# Policy: 1000 USDC per call, 5000 USDC per 24h window
# USDC has 6 decimals: 1000 = 1000000000

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  set_spending_policy \
  <SESSION_PUBLIC_KEY> \
  <MOCK_USDC_ADDRESS> \
  u256:1000000000 \
  u256:5000000000 \
  u64:86400 \
  --account $STARKNET_ACCOUNT
```

**Expected Result:** ✅ Transaction succeeds, `SpendingPolicySet` event emitted
**Verify:** Call `get_spending_policy(<SESSION_PUBLIC_KEY>, <USDC_ADDRESS>)`

### Test 2.3: Execute Transfer Within Limits
```bash
# Transfer 500 USDC (within 1000 per-call limit)
# Recipient: any address
RECIPIENT=0x...

# Sign with SESSION_KEY using session key signature format
# Signature: [session_pubkey, r_low, r_high, valid_until]

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  __execute__ \
  array:1 \
    struct:<MOCK_USDC_ADDRESS>:0x83afd...12e:array:3:<RECIPIENT>:500000000:0 \
  --account <SESSION_KEY_ACCOUNT> \
  --keystore <SESSION_KEY_KEYSTORE>
```

**Expected Result:** ✅ Transfer succeeds
**Verify:**
- USDC balance decreased by 500000000
- `get_spending_policy()` shows `spent_in_window = 500000000`

### Test 2.4: Multiple Transfers in Same Window
```bash
# Transfer 1: 500 USDC
# Transfer 2: 1000 USDC
# Transfer 3: 2000 USDC
# Total: 3500 USDC < 5000 window limit ✅

# Execute transfers sequentially (use script for automation)
```

**Expected Result:** ✅ All 3 transfers succeed
**Verify:** `spent_in_window = 3500000000`

### Test 2.5: Wait for Window Reset
```bash
# Advance time by 24h + 1 second
# In testnet, either wait or use block timestamp tricks

# After 24h+1s, execute transfer
# Transfer 4: 1000 USDC

starkli invoke <SESSION_ACCOUNT_ADDRESS> __execute__ ...
```

**Expected Result:** ✅ Transfer succeeds after window reset
**Verify:** `spent_in_window = 1000000000` (reset to only this transfer)

---

## Phase 3: Failure Path Testing

### Test 3.1: Exceed Per-Call Limit
```bash
# Try to transfer 1500 USDC (> 1000 limit)

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  __execute__ \
  array:1 \
    struct:<USDC>:0x83afd...:array:3:<RECIPIENT>:1500000000:0 \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ❌ Transaction fails with "Spending: exceeds per-call"
**Verify:** Balance unchanged, `spent_in_window` unchanged

### Test 3.2: Exceed Window Limit
```bash
# After Test 2.4 (spent = 3500), try to transfer 2000 more
# 3500 + 2000 = 5500 > 5000 window limit

starkli invoke <SESSION_ACCOUNT_ADDRESS> __execute__ ...
```

**Expected Result:** ❌ Transaction fails with "Spending: exceeds window limit"
**Verify:** `spent_in_window` still 3500000000

### Test 3.3: Session Key Tries to Modify Policy (Blocklist)
```bash
# Try to call set_spending_policy from session key

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  set_spending_policy \
  <SESSION_PUBLIC_KEY> \
  <USDC> \
  u256:9999999 \
  u256:9999999 \
  u64:1 \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ❌ Transaction fails (blocklist rejection)
**Verify:** Policy unchanged

### Test 3.4: Session Key Tries to Remove Policy
```bash
starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  remove_spending_policy \
  <SESSION_PUBLIC_KEY> \
  <USDC> \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ❌ Transaction fails (blocklist rejection)
**Verify:** Policy still active

---

## Phase 4: Edge Case Testing

### Test 4.1: Window Boundary Spending
```bash
# Scenario: Spend at exact window_start + 86400 seconds
# 1. Note current window_start from get_spending_policy
# 2. Wait until exactly window_start + 86400
# 3. Transfer max_per_window (5000 USDC)
# 4. Try to transfer again at same timestamp

# Expected: First succeeds, second fails (window NOT reset yet)
```

**Expected Result:**
- ✅ First transfer at boundary succeeds
- ❌ Second transfer at boundary fails (window not reset)
- ✅ Third transfer at boundary+1s succeeds (window resets)

**Verifies:** Critical fix V1 (>= changed to >)

### Test 4.2: Multicall Cumulative Enforcement
```bash
# Execute multicall with 5 transfers of 500 each
# Total: 2500 USDC in single transaction

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  __execute__ \
  array:5 \
    struct:<USDC>:0x83afd...:array:3:<ADDR1>:500000000:0 \
    struct:<USDC>:0x83afd...:array:3:<ADDR2>:500000000:0 \
    struct:<USDC>:0x83afd...:array:3:<ADDR3>:500000000:0 \
    struct:<USDC>:0x83afd...:array:3:<ADDR4>:500000000:0 \
    struct:<USDC>:0x83afd...:array:3:<ADDR5>:500000000:0 \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ✅ All 5 transfers succeed, `spent_in_window = 2500000000`
**Verifies:** Multicall cumulative tracking works

### Test 4.3: Transfer Exactly at Limit
```bash
# Transfer exactly 1000 USDC (max_per_call)
# Transfer exactly 5000 USDC total (max_per_window)

starkli invoke <SESSION_ACCOUNT_ADDRESS> __execute__ ...
```

**Expected Result:** ✅ Succeeds (boundary inclusive: amount <= limit)
**Verifies:** Exact limit transfers allowed

### Test 4.4: Non-Spending Selector (balanceOf)
```bash
# Call balanceOf on USDC (non-spending selector)

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  __execute__ \
  array:1 \
    struct:<USDC>:0x2e4263afad...8dc:array:1:<SESSION_ACCOUNT> \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ✅ Succeeds without affecting `spent_in_window`
**Verifies:** Non-spending selectors ignored

### Test 4.5: Approve Tracked as Spending
```bash
# Call approve(spender, amount) on USDC
# approve selector: 0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  __execute__ \
  array:1 \
    struct:<USDC>:0x219209e...:array:3:<SPENDER>:1000000000:0 \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ✅ Succeeds, `spent_in_window` increases by 1000000000
**Verifies:** Approve tracked as spending

---

## Phase 5: Policy Management

### Test 5.1: Remove Policy
```bash
# Owner removes spending policy

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  remove_spending_policy \
  <SESSION_PUBLIC_KEY> \
  <USDC> \
  --account $STARKNET_ACCOUNT
```

**Expected Result:** ✅ Policy removed, `SpendingPolicyRemoved` event
**Verify:** `get_spending_policy()` returns all zeros

### Test 5.2: Unrestricted Spending After Removal
```bash
# Transfer large amount (>5000 USDC) after policy removed

starkli invoke <SESSION_ACCOUNT_ADDRESS> __execute__ \
  array:1 \
    struct:<USDC>:0x83afd...:array:3:<RECIPIENT>:10000000000:0 \
  --account <SESSION_KEY_ACCOUNT>
```

**Expected Result:** ✅ Large transfer succeeds (no policy enforcement)
**Verifies:** Policy removal works correctly

### Test 5.3: Update Policy (Increase Limits)
```bash
# Owner updates policy with higher limits
# New: 2000 per call, 10000 per window

starkli invoke \
  <SESSION_ACCOUNT_ADDRESS> \
  set_spending_policy \
  <SESSION_PUBLIC_KEY> \
  <USDC> \
  u256:2000000000 \
  u256:10000000000 \
  u64:86400 \
  --account $STARKNET_ACCOUNT
```

**Expected Result:** ✅ Policy updated
**Verify:** `get_spending_policy()` reflects new limits

### Test 5.4: Multi-Token Policies
```bash
# Set separate policies for USDC and WETH
# USDC: 1000/5000/24h
# WETH: 0.5/2/24h

starkli invoke <SESSION_ACCOUNT_ADDRESS> \
  set_spending_policy <SESSION_KEY> <USDC> ...

starkli invoke <SESSION_ACCOUNT_ADDRESS> \
  set_spending_policy <SESSION_KEY> <WETH> ...
```

**Expected Result:** ✅ Both policies set independently
**Verify:** Transfers of each token tracked separately

---

## Phase 6: Load Testing

### Test 6.1: Sustained Transaction Volume
```bash
# Execute 100 transactions over 1 hour
# Each transfer: 50 USDC (well within limits)
# Target: ~1.67 tx/minute sustained

# Use automation script
./scripts/load_test.sh \
  --account <SESSION_ACCOUNT> \
  --token <USDC> \
  --amount 50000000 \
  --count 100 \
  --duration 3600
```

**Expected Results:**
- ✅ All 100 transactions succeed
- ✅ Cumulative tracking accurate (5000000000 total)
- ✅ No state corruption
- ✅ Gas costs consistent

**Metrics to Track:**
- Transaction success rate
- Average confirmation time
- Gas usage per transaction
- Policy state consistency

---

## Phase 7: Monitoring & Observability

### Metrics to Monitor

**On-Chain State:**
```bash
# Query spending state every 5 minutes
watch -n 300 'starkli call <SESSION_ACCOUNT> get_spending_policy <SESSION_KEY> <USDC>'
```

**Event Monitoring:**
```bash
# Monitor SpendingPolicySet and SpendingPolicyRemoved events
starkli events <SESSION_ACCOUNT> --from-block <START_BLOCK>
```

**Balance Tracking:**
```bash
# Track USDC balance changes
starkli call <USDC> balanceOf <SESSION_ACCOUNT>
```

### Dashboard Metrics (Optional)
- Total spending per token
- Spending rate (tokens/hour)
- Time until window reset
- Policy update history

---

## Phase 8: Security Validation

### 8.1: Attack Simulation Results
- [x] Window boundary double-spend → **BLOCKED** ✅
- [x] Same-block spending bypass → **BLOCKED** ✅
- [x] Reentrancy attack → **PROTECTED** ✅
- [x] Overflow attack → **PREVENTED** ✅
- [x] Admin function bypass → **BLOCKED** ✅

### 8.2: Known Limitations Verified
- [x] `transferFrom` not tracked (requires approval first) → **DOCUMENTED** ✅
- [x] Failed calls count against limit → **FAIL-CLOSED** ✅
- [x] Zero policy disables enforcement → **BY DESIGN** ✅

### 8.3: Incident Response Plan
If issues found during E2E:
1. **Stop all testing** immediately
2. **Document** exact reproduction steps
3. **Analyze** root cause in code
4. **Fix** and re-run unit tests
5. **Re-deploy** and re-test affected scenarios
6. **Update** security audit with findings

---

## Success Criteria

### ✅ All Tests Must Pass:
- [ ] All 18 happy path tests succeed
- [ ] All 4 failure path tests correctly reject
- [ ] All 5 edge case tests behave as expected
- [ ] All 4 policy management tests work
- [ ] Load test completes with 100% success rate

### ✅ Security Validation:
- [ ] No bypasses found in attack simulations
- [ ] Known limitations verified and documented
- [ ] State consistency maintained under load

### ✅ Documentation Complete:
- [ ] All test results documented in `E2E_TEST_RESULTS.md`
- [ ] Deployment addresses saved in `DEPLOYED_CONTRACTS.md`
- [ ] Gas usage metrics recorded
- [ ] Known issues (if any) documented with mitigations

---

## Next Steps After E2E

1. **Review Results** with security team
2. **Final Security Sign-Off** from all stakeholders
3. **Mainnet Deployment Planning**
4. **User Documentation** (guides, examples, best practices)
5. **MCP Tools Integration** (spending policy management via MCP)

---

**Document Version:** 1.0
**Last Updated:** 2026-02-12
**Status:** Ready for Execution
