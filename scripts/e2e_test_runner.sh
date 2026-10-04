#!/bin/bash
# E2E Test Runner for SessionAccount Spending Policy
# Usage: ./e2e_test_runner.sh --account <ADDRESS> --session-key <PUBKEY> --token <TOKEN_ADDRESS> [--skip-setup]
#
# Environment:
#   STARKNET_RPC            Sepolia RPC URL
#   SESSION_PRIVATE_KEY     private key of --session-key (session-key steps)
#   SESSION_OWNER_ACCOUNT   starkli account file whose address is the SessionAccount itself
#   SESSION_OWNER_KEYSTORE  starkli keystore holding the SessionAccount owner key
#                           (both only needed without --skip-setup)
#
# Owner-signed setup uses starkli: the owner key signs [r, s] and the SessionAccount calls
# itself, which its assert_only_self admin entrypoints require. starkli cannot produce
# session-key signatures, so session-key steps run packages/session-account-e2e/src/cli.ts,
# which signs [session_pubkey, r, s, valid_until] for the account's session signature mode
# and asserts each step's expected outcome. See docs/E2E_TESTING_GUIDE.md.

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_INVOKE="$REPO_ROOT/packages/session-account-e2e/src/cli.ts"
RECIPIENT=0xDEADBEEF

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --account)
            SESSION_ACCOUNT="$2"
            shift 2
            ;;
        --session-key)
            SESSION_PUBKEY="$2"
            shift 2
            ;;
        --token)
            TOKEN_ADDRESS="$2"
            shift 2
            ;;
        --skip-setup)
            SKIP_SETUP=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validation
if [ -z "$SESSION_ACCOUNT" ]; then
    echo -e "${RED}Error: --account required${NC}"
    exit 1
fi

if [ -z "$SESSION_PUBKEY" ]; then
    echo -e "${RED}Error: --session-key required${NC}"
    exit 1
fi

if [ -z "$TOKEN_ADDRESS" ]; then
    echo -e "${RED}Error: --token required${NC}"
    exit 1
fi

if [ -z "$STARKNET_RPC" ]; then
    echo -e "${RED}Error: STARKNET_RPC must be set${NC}"
    exit 1
fi

if [ -z "$SESSION_PRIVATE_KEY" ]; then
    echo -e "${RED}Error: SESSION_PRIVATE_KEY must be set (private key of --session-key)${NC}"
    exit 1
fi

if [ "$SKIP_SETUP" != "true" ] && { [ -z "$SESSION_OWNER_ACCOUNT" ] || [ -z "$SESSION_OWNER_KEYSTORE" ]; }; then
    echo -e "${RED}Error: SESSION_OWNER_ACCOUNT and SESSION_OWNER_KEYSTORE must be set for setup (or pass --skip-setup)${NC}"
    exit 1
fi

# The session-key helper is TypeScript run directly by Node (type stripping, Node >= 24).
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' 2>/dev/null; then
    echo -e "${RED}Error: Node.js >= 24 is required for the session-key helper${NC}"
    exit 1
fi

if [ ! -d "$REPO_ROOT/packages/session-account-e2e/node_modules/starknet" ]; then
    echo -e "${RED}Error: run 'pnpm install' at the repo root first${NC}"
    exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}E2E Test Runner - Spending Policy${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Account: ${YELLOW}$SESSION_ACCOUNT${NC}"
echo -e "Session Key: ${YELLOW}$SESSION_PUBKEY${NC}"
echo -e "Token: ${YELLOW}$TOKEN_ADDRESS${NC}"
echo ""

# Test result tracking
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# Helper function to run test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"  # "pass" or "fail"

    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "${YELLOW}Test $TESTS_TOTAL: $test_name${NC}"

    if eval "$test_command" > /tmp/test_output.log 2>&1; then
        if [ "$expected_result" = "pass" ]; then
            echo -e "${GREEN}✓ PASSED${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAILED (expected failure but passed)${NC}"
            cat /tmp/test_output.log
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo -e "${GREEN}✓ PASSED (correctly failed)${NC}"
            TESTS_PASSED=$((TESTS_PASSED + 1))
        else
            echo -e "${RED}✗ FAILED${NC}"
            cat /tmp/test_output.log
            TESTS_FAILED=$((TESTS_FAILED + 1))
        fi
    fi
    echo ""
}

# Helper to run a session-key step. The helper exits 0 only when the expected outcome holds:
#   (default)            submitted, SUCCEEDED, and no CallFailed event from the account
#   --expect revert      __execute__ reverts with --reason (fee estimation, not submitted)
#   --expect reject      __validate__ rejects the calls while --control-call validates with
#                        the same key and nonce (fee estimation, not submitted)
run_session_test() {
    local test_name="$1"
    shift

    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "${YELLOW}Test $TESTS_TOTAL: $test_name${NC}"

    if node "$SESSION_INVOKE" --account "$SESSION_ACCOUNT" --session-key "$SESSION_PUBKEY" "$@" \
        > /tmp/test_output.log 2>&1; then
        cat /tmp/test_output.log
        echo -e "${GREEN}✓ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        cat /tmp/test_output.log
        echo -e "${RED}✗ FAILED${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
    echo ""
}

# --call spec for an ERC-20 transfer: transfer_call <recipient> <amount_low>
transfer_call() {
    echo "$TOKEN_ADDRESS:transfer:$1,$2,0"
}

# Helper to query spending policy
get_spending_state() {
    starkli call $SESSION_ACCOUNT get_spending_policy $SESSION_PUBKEY $TOKEN_ADDRESS \
        --rpc $STARKNET_RPC 2>/dev/null || echo "0 0 0 0 0"
}

# Phase 1: Setup (if not skipped)
if [ "$SKIP_SETUP" != "true" ]; then
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Phase 1: Setup${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    # Test 1: Add session key
    run_test "Add session key (7 days, 100 calls)" \
        "starkli invoke $SESSION_ACCOUNT add_or_update_session_key \
            $SESSION_PUBKEY u64:$(($(date +%s) + 604800)) u32:100 \
            array:1:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e \
            --account \$SESSION_OWNER_ACCOUNT --keystore \$SESSION_OWNER_KEYSTORE --rpc \$STARKNET_RPC" \
        "pass"

    # Test 2: Set spending policy (1000 per call, 5000 per window, 24h)
    run_test "Set spending policy (1000/5000/24h)" \
        "starkli invoke $SESSION_ACCOUNT set_spending_policy \
            $SESSION_PUBKEY $TOKEN_ADDRESS \
            u256:1000000000 u256:5000000000 u64:86400 \
            --account \$SESSION_OWNER_ACCOUNT --keystore \$SESSION_OWNER_KEYSTORE --rpc \$STARKNET_RPC" \
        "pass"
fi

# Phase 2: Happy Path Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 2: Happy Path Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 3: Transfer within limits (500 tokens)
run_session_test "Transfer 500 tokens (within limits)" \
    --call "$(transfer_call $RECIPIENT 500000000)"

# Check spending state
SPENDING_STATE=$(get_spending_state)
echo -e "${YELLOW}Current spending state: $SPENDING_STATE${NC}"
echo ""

# Test 4: Second transfer (1000 tokens, cumulative 1500)
run_session_test "Transfer 1000 tokens (cumulative 1500)" \
    --call "$(transfer_call $RECIPIENT 1000000000)"

# Phase 3: Failure Path Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 3: Failure Path Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 5: Exceed per-call limit (1500 tokens > 1000 limit)
run_session_test "Transfer 1500 tokens (exceeds per-call limit)" \
    --call "$(transfer_call $RECIPIENT 1500000000)" \
    --expect revert --reason "Spending: exceeds per-call"

# Test 6: Exceed window limit. The per-call check runs first, so every transfer stays at the
# 1000 cap: 1500 already spent + 4 x 1000 = 5500 > 5000, and the fourth transfer reverts.
run_session_test "Multicall: 4 transfers of 1000 tokens (cumulative 5500 exceeds window limit)" \
    --call "$(transfer_call $RECIPIENT 1000000000)" \
    --call "$(transfer_call $RECIPIENT 1000000000)" \
    --call "$(transfer_call $RECIPIENT 1000000000)" \
    --call "$(transfer_call $RECIPIENT 1000000000)" \
    --expect revert --reason "Spending: exceeds window limit"

# Tests 7-8: __validate__ rejects session calls to admin selectors (blocklist), to the account
# itself, or outside the transfer-only whitelist. The control call (a 0-token transfer) must
# validate first with the same key and nonce, so the rejection is the call policy, not the
# signature or session state.

# Test 7: Session key tries to modify policy (blocklist)
run_session_test "Session key tries set_spending_policy (should be blocked)" \
    --call "$SESSION_ACCOUNT:set_spending_policy:$SESSION_PUBKEY,$TOKEN_ADDRESS,9999999,0,9999999,0,1" \
    --expect reject --control-call "$(transfer_call $RECIPIENT 0)"

# Test 8: Session key tries to remove policy (blocklist)
run_session_test "Session key tries remove_spending_policy (should be blocked)" \
    --call "$SESSION_ACCOUNT:remove_spending_policy:$SESSION_PUBKEY,$TOKEN_ADDRESS" \
    --expect reject --control-call "$(transfer_call $RECIPIENT 0)"

# Rejected steps were not submitted, so spending should still be 1500
SPENDING_STATE=$(get_spending_state)
echo -e "${YELLOW}Current spending state: $SPENDING_STATE${NC}"
echo ""

# Phase 4: Edge Cases
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 4: Edge Case Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 9: Transfer exactly at per-call limit (1000 tokens, cumulative 2500)
run_session_test "Transfer exactly 1000 tokens (at per-call limit)" \
    --call "$(transfer_call $RECIPIENT 1000000000)"

# Test 10: Multicall with 3 small transfers (300 each, total 900, cumulative 3400)
run_session_test "Multicall: 3 transfers of 300 tokens each" \
    --call "$(transfer_call 0xBEEF1 300000000)" \
    --call "$(transfer_call 0xBEEF2 300000000)" \
    --call "$(transfer_call 0xBEEF3 300000000)"

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Results Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Total tests:  ${YELLOW}$TESTS_TOTAL${NC}"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
