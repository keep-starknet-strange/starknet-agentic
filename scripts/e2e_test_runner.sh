#!/bin/bash
# E2E Test Runner for SessionAccount Spending Policy
# Usage: ./e2e_test_runner.sh --account <ADDRESS> --session-key <PUBKEY> --token <USDC_ADDRESS>

set -e

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
            --account \$STARKNET_ACCOUNT --keystore \$STARKNET_KEYSTORE --rpc \$STARKNET_RPC" \
        "pass"

    # Test 2: Set spending policy (1000 per call, 5000 per window, 24h)
    run_test "Set spending policy (1000/5000/24h)" \
        "starkli invoke $SESSION_ACCOUNT set_spending_policy \
            $SESSION_PUBKEY $TOKEN_ADDRESS \
            u256:1000000000 u256:5000000000 u64:86400 \
            --account \$STARKNET_ACCOUNT --keystore \$STARKNET_KEYSTORE --rpc \$STARKNET_RPC" \
        "pass"
fi

# Phase 2: Happy Path Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 2: Happy Path Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 3: Transfer within limits (500 tokens)
run_test "Transfer 500 tokens (within limits)" \
    "starkli invoke $SESSION_ACCOUNT __execute__ \
        array:1:struct:$TOKEN_ADDRESS:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:array:3:0xDEADBEEF:500000000:0 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "pass"

# Check spending state
SPENDING_STATE=$(get_spending_state)
echo -e "${YELLOW}Current spending state: $SPENDING_STATE${NC}"
echo ""

# Test 4: Second transfer (1000 tokens, cumulative 1500)
run_test "Transfer 1000 tokens (cumulative 1500)" \
    "starkli invoke $SESSION_ACCOUNT __execute__ \
        array:1:struct:$TOKEN_ADDRESS:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:array:3:0xDEADBEEF:1000000000:0 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "pass"

# Phase 3: Failure Path Tests
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 3: Failure Path Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 5: Exceed per-call limit (1500 tokens > 1000 limit)
run_test "Transfer 1500 tokens (exceeds per-call limit)" \
    "starkli invoke $SESSION_ACCOUNT __execute__ \
        array:1:struct:$TOKEN_ADDRESS:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:array:3:0xDEADBEEF:1500000000:0 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "fail"

# Test 6: Exceed window limit (3600 tokens, cumulative would be 5100 > 5000)
run_test "Transfer 3600 tokens (exceeds window limit)" \
    "starkli invoke $SESSION_ACCOUNT __execute__ \
        array:1:struct:$TOKEN_ADDRESS:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:array:3:0xDEADBEEF:3600000000:0 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "fail"

# Test 7: Session key tries to modify policy (blocklist)
run_test "Session key tries set_spending_policy (should be blocked)" \
    "starkli invoke $SESSION_ACCOUNT set_spending_policy \
        $SESSION_PUBKEY $TOKEN_ADDRESS \
        u256:9999999 u256:9999999 u64:1 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "fail"

# Test 8: Session key tries to remove policy (blocklist)
run_test "Session key tries remove_spending_policy (should be blocked)" \
    "starkli invoke $SESSION_ACCOUNT remove_spending_policy \
        $SESSION_PUBKEY $TOKEN_ADDRESS \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "fail"

# Phase 4: Edge Cases
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Phase 4: Edge Case Tests${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Test 9: Transfer exactly at per-call limit (1000 tokens)
run_test "Transfer exactly 1000 tokens (at per-call limit)" \
    "starkli invoke $SESSION_ACCOUNT __execute__ \
        array:1:struct:$TOKEN_ADDRESS:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:array:3:0xDEADBEEF:1000000000:0 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "pass"

# Test 10: Multicall with 3 small transfers (300 each, total 900)
run_test "Multicall: 3 transfers of 300 tokens each" \
    "starkli invoke $SESSION_ACCOUNT __execute__ \
        array:3:struct:$TOKEN_ADDRESS:0x83afd...:array:3:0xBEEF1:300000000:0:struct:$TOKEN_ADDRESS:0x83afd...:array:3:0xBEEF2:300000000:0:struct:$TOKEN_ADDRESS:0x83afd...:array:3:0xBEEF3:300000000:0 \
        --account-session-key \$SESSION_KEY_ACCOUNT \
        --rpc \$STARKNET_RPC" \
    "pass"

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
