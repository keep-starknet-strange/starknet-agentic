# Quick Start Guide - E2E Testing

**Ready to deploy and test in 5 minutes** ⚡

---

## Prerequisites (One-Time Setup)

```bash
# 1. Install tools (if not already installed)
curl https://get.starkli.sh | sh
starkliup

# 2. Create testnet account (if needed)
starkli account oz init ~/.starknet_accounts/deployer-account.json

# 3. Get testnet ETH from faucet
# Visit: https://faucet.goerli.starknet.io/ (for Sepolia testnet)

# 4. Set environment variables
export STARKNET_ACCOUNT=~/.starknet_accounts/deployer-account.json
export STARKNET_KEYSTORE=~/.starknet_accounts/deployer-keystore.json
export STARKNET_RPC=https://starknet-sepolia.public.blastapi.io/rpc/v0_7
```

---

## Step 1: Deploy Contract (2 minutes)

```bash
cd starknet-agentic-sec-guardrails

# Run deployment script
./scripts/deploy_sepolia.sh

# When prompted, enter your owner public key
# Example: 0x123456789abcdef...

# Script will:
# ✅ Compile contracts
# ✅ Declare SessionAccount class
# ✅ Deploy instance
# ✅ Save deployment info to docs/DEPLOYED_CONTRACTS.md
```

**Output:**
```
========================================
Deployment Complete!
========================================

Class Hash:       0x...
Contract Address: 0x...
Owner Pubkey:     0x...

Export environment variables:
export SESSION_ACCOUNT_ADDRESS=0x...
export CLASS_HASH=0x...
```

**Copy the export commands and run them!**

---

## Step 2: Generate Session Key (30 seconds)

```bash
# Generate new keypair for session key
starkli signer gen-keypair

# Output:
# Private key: 0x...
# Public key:  0x...

# IMPORTANT: Save both keys securely!
export SESSION_PUBKEY=0x...  # From output above
export SESSION_PRIVKEY=0x... # From output above

# Create session key account file (for signing)
cat > ~/.starknet_accounts/session-key.json << EOF
{
  "version": 1,
  "variant": {
    "type": "open_zeppelin",
    "version": 1,
    "public_key": "$SESSION_PUBKEY"
  },
  "deployment": {
    "status": "deployed",
    "class_hash": "$CLASS_HASH",
    "address": "$SESSION_ACCOUNT_ADDRESS"
  }
}
EOF

# Create keystore for session key
starkli signer keystore from-key ~/.starknet_accounts/session-keystore.json
# When prompted, enter SESSION_PRIVKEY and set a password
```

---

## Step 3: Setup Test Token (1 minute)

**Option A: Use Existing Sepolia ERC-20**
```bash
# Use a known testnet USDC/ETH contract
export TOKEN_ADDRESS=0x...  # Sepolia USDC address
```

**Option B: Deploy Mock Token**
```bash
# Deploy simple ERC-20 for testing
# (Requires ERC-20 contract class - see deploy_mock_tokens.sh)
```

**For this guide, we'll use a mock address:**
```bash
export TOKEN_ADDRESS=0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
```

---

## Step 4: Run E2E Tests (2 minutes)

```bash
# Set session key account for testing
export SESSION_KEY_ACCOUNT=~/.starknet_accounts/session-key.json
export SESSION_KEY_KEYSTORE=~/.starknet_accounts/session-keystore.json

# Run automated E2E test suite
./scripts/e2e_test_runner.sh \
  --account $SESSION_ACCOUNT_ADDRESS \
  --session-key $SESSION_PUBKEY \
  --token $TOKEN_ADDRESS
```

**Expected Output:**
```
========================================
E2E Test Runner - Spending Policy
========================================

Account: 0x...
Session Key: 0x...
Token: 0x...

========================================
Phase 1: Setup
========================================

Test 1: Add session key (7 days, 100 calls)
✓ PASSED

Test 2: Set spending policy (1000/5000/24h)
✓ PASSED

========================================
Phase 2: Happy Path Tests
========================================

Test 3: Transfer 500 tokens (within limits)
✓ PASSED

Test 4: Transfer 1000 tokens (cumulative 1500)
✓ PASSED

========================================
Phase 3: Failure Path Tests
========================================

Test 5: Transfer 1500 tokens (exceeds per-call limit)
✓ PASSED (correctly failed)

Test 6: Transfer 3600 tokens (exceeds window limit)
✓ PASSED (correctly failed)

Test 7: Session key tries set_spending_policy (should be blocked)
✓ PASSED (correctly failed)

Test 8: Session key tries remove_spending_policy (should be blocked)
✓ PASSED (correctly failed)

========================================
Test Results Summary
========================================

Total tests:  10
Passed:       10
Failed:       0

✓ All tests passed!
```

---

## Manual Testing (Optional)

### Add Session Key Manually
```bash
starkli invoke \
  $SESSION_ACCOUNT_ADDRESS \
  add_or_update_session_key \
  $SESSION_PUBKEY \
  u64:$(($(date +%s) + 604800)) \
  u32:100 \
  array:1:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e \
  --account $STARKNET_ACCOUNT \
  --keystore $STARKNET_KEYSTORE
```

### Set Spending Policy Manually
```bash
# Policy: 1000 tokens per call, 5000 per 24h window
starkli invoke \
  $SESSION_ACCOUNT_ADDRESS \
  set_spending_policy \
  $SESSION_PUBKEY \
  $TOKEN_ADDRESS \
  u256:1000000000 \
  u256:5000000000 \
  u64:86400 \
  --account $STARKNET_ACCOUNT \
  --keystore $STARKNET_KEYSTORE
```

### Execute Transfer with Session Key
```bash
starkli invoke \
  $SESSION_ACCOUNT_ADDRESS \
  __execute__ \
  array:1:struct:$TOKEN_ADDRESS:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:array:3:0xDEADBEEF:500000000:0 \
  --account $SESSION_KEY_ACCOUNT \
  --keystore $SESSION_KEY_KEYSTORE
```

### Query Spending State
```bash
starkli call \
  $SESSION_ACCOUNT_ADDRESS \
  get_spending_policy \
  $SESSION_PUBKEY \
  $TOKEN_ADDRESS
```

**Output:**
```
[
  0x3b9aca00,    # max_per_call: 1000000000 (1000 tokens with 6 decimals)
  0x12a05f200,   # max_per_window: 5000000000 (5000 tokens)
  0x15180,       # window_seconds: 86400 (24 hours)
  0x1dcd6500,    # spent_in_window: 500000000 (500 tokens spent)
  0x65c3a2b0     # window_start: timestamp
]
```

---

## Troubleshooting

### "Transaction reverted"
- Check gas fees (need testnet ETH)
- Verify contract address is correct
- Ensure session key is properly registered

### "Spending: exceeds per-call"
- ✅ **This is expected!** Policy is working correctly
- Reduce transfer amount or increase policy limits

### "Account not found"
- Session key account file may be incorrect
- Verify SESSION_KEY_ACCOUNT path and contents

### "Invalid signature"
- Session key private key doesn't match public key
- Re-generate keypair and update account file

---

## Next Steps

1. ✅ **Basic tests passing?** → Proceed to comprehensive E2E testing
2. 📊 **Run load tests** → See `scripts/load_test.sh`
3. 📖 **Full E2E guide** → See `docs/E2E_TESTING_GUIDE.md`
4. 🔒 **Security validation** → Review attack simulations in guide
5. 🚀 **Mainnet deployment** → After all tests pass and security sign-off

---

## Support & Resources

- **Full E2E Guide:** `docs/E2E_TESTING_GUIDE.md`
- **Security Audit:** `docs/security/SPENDING_POLICY_AUDIT.md`
- **Deployment Info:** `docs/DEPLOYED_CONTRACTS.md`
- **Starkli Docs:** https://book.starkli.rs/
- **Starknet Sepolia Faucet:** https://faucet.goerli.starknet.io/

---

**Quick Start Complete!** 🎉

Your SessionAccount with spending policy is deployed and ready for testing.
