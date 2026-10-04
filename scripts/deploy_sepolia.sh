#!/bin/bash
# Deployment script for SessionAccount with Spending Policy on Sepolia
# Usage: bash scripts/deploy_sepolia.sh   (from the repo root)
#
# Environment:
#   STARKNET_ACCOUNT   either a starkli-format account JSON file (with STARKNET_KEYSTORE),
#                      or an account name from sncast's accounts file (without it)
#   STARKNET_KEYSTORE  optional encrypted keystore for STARKNET_ACCOUNT; sncast prompts for
#                      its password unless KEYSTORE_PASSWORD is set
#   STARKNET_RPC       optional RPC URL; defaults to sncast's built-in Sepolia provider

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}SessionAccount Sepolia Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"
command -v sncast >/dev/null 2>&1 || { echo -e "${RED}sncast (Starknet Foundry) is required but not installed${NC}"; exit 1; }
command -v scarb >/dev/null 2>&1 || { echo -e "${RED}scarb is required but not installed${NC}"; exit 1; }

# Check environment variables
if [ -z "$STARKNET_ACCOUNT" ]; then
    echo -e "${RED}STARKNET_ACCOUNT environment variable not set${NC}"
    exit 1
fi

ACCOUNT_ARGS=(--account "$STARKNET_ACCOUNT")
if [ -n "$STARKNET_KEYSTORE" ]; then
    ACCOUNT_ARGS+=(--keystore "$STARKNET_KEYSTORE")
fi

if [ -n "$STARKNET_RPC" ]; then
    NETWORK_ARGS=(--url "$STARKNET_RPC")
    NETWORK_HINT="--url $STARKNET_RPC"
else
    echo -e "${YELLOW}STARKNET_RPC not set, using sncast's default Sepolia provider${NC}"
    NETWORK_ARGS=(--network sepolia)
    NETWORK_HINT="--network sepolia"
fi

# Last 0x value of a field in sncast --json output (one JSON object per line).
json_field() {
    grep -oE "\"$1\": ?\"0x[0-9a-fA-F]+\"" | tail -n 1 | grep -oE '0x[0-9a-fA-F]+'
}

echo -e "${GREEN}✓ Prerequisites checked${NC}"
echo ""

# Get owner public key
echo -e "${YELLOW}Enter owner public key (felt252):${NC}"
read -r OWNER_PUBKEY

if [ -z "$OWNER_PUBKEY" ]; then
    echo -e "${RED}Owner public key cannot be empty${NC}"
    exit 1
fi

# Step 1: Compile and compute the class hash (sncast builds the package with scarb)
echo -e "${YELLOW}Step 1: Compiling SessionAccount and computing its class hash...${NC}"
CLASS_HASH=$(cd contracts/session-account && sncast --json utils class-hash --contract-name SessionAccount | json_field class_hash || true)

if [ -z "$CLASS_HASH" ]; then
    echo -e "${RED}Compilation failed - could not compute the SessionAccount class hash${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Contracts compiled (class hash $CLASS_HASH)${NC}"
echo ""

# Step 2: Declare contract
echo -e "${YELLOW}Step 2: Declaring SessionAccount contract...${NC}"
if DECLARE_OUTPUT=$(cd contracts/session-account && sncast --json "${ACCOUNT_ARGS[@]}" --wait \
    declare --contract-name SessionAccount "${NETWORK_ARGS[@]}" 2>&1); then
    echo "$DECLARE_OUTPUT"
    DECLARED_HASH=$(echo "$DECLARE_OUTPUT" | json_field class_hash || true)
    if [ -n "$DECLARED_HASH" ] && [ "$DECLARED_HASH" != "$CLASS_HASH" ]; then
        echo -e "${RED}Declared class hash $DECLARED_HASH does not match local $CLASS_HASH${NC}"
        exit 1
    fi
elif echo "$DECLARE_OUTPUT" | grep -qi "already declared"; then
    echo -e "${YELLOW}Class already declared; reusing it${NC}"
else
    echo "$DECLARE_OUTPUT"
    echo -e "${RED}Declare failed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Class hash: $CLASS_HASH${NC}"
echo ""

# Step 3: Deploy contract
echo -e "${YELLOW}Step 3: Deploying SessionAccount instance...${NC}"
DEPLOY_OUTPUT=$(sncast --json "${ACCOUNT_ARGS[@]}" --wait \
    deploy --class-hash "$CLASS_HASH" --constructor-calldata "$OWNER_PUBKEY" "${NETWORK_ARGS[@]}" 2>&1) || {
    echo "$DEPLOY_OUTPUT"
    echo -e "${RED}Deploy failed${NC}"
    exit 1
}

echo "$DEPLOY_OUTPUT"

# Extract contract address
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | json_field contract_address || true)

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo -e "${RED}Failed to extract contract address${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Contract address: $CONTRACT_ADDRESS${NC}"
echo ""

# Save deployment info
DEPLOYMENT_FILE="docs/DEPLOYED_CONTRACTS.md"
echo -e "${YELLOW}Saving deployment info to $DEPLOYMENT_FILE...${NC}"

cat > $DEPLOYMENT_FILE << EOF
# Deployed Contracts - Sepolia Testnet

**Deployment Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")
**Network:** Starknet Sepolia
**Deployer:** $STARKNET_ACCOUNT

---

## SessionAccount

**Class Hash:** \`$CLASS_HASH\`
**Contract Address:** \`$CONTRACT_ADDRESS\`
**Owner Public Key:** \`$OWNER_PUBKEY\`

**Deployment Transaction:** [View on Voyager](https://sepolia.voyager.online/contract/$CONTRACT_ADDRESS)

---

## Mock ERC-20 Tokens

### Mock USDC
- **Address:** \`TBD\` (deploy with \`deploy_mock_tokens.sh\`)
- **Symbol:** MUSDC
- **Decimals:** 6
- **Initial Supply:** 1,000,000 MUSDC

### Mock WETH
- **Address:** \`TBD\` (deploy with \`deploy_mock_tokens.sh\`)
- **Symbol:** MWETH
- **Decimals:** 18
- **Initial Supply:** 1,000 MWETH

---

## Configuration for E2E Tests

\`\`\`bash
export SESSION_ACCOUNT_ADDRESS=$CONTRACT_ADDRESS
export OWNER_PUBKEY=$OWNER_PUBKEY
export CLASS_HASH=$CLASS_HASH
\`\`\`

---

## Verification

Verify contract on Voyager:
- URL: https://sepolia.voyager.online/contract/$CONTRACT_ADDRESS
- Check constructor args match owner public key
- Verify contract is initialized correctly

\`\`\`bash
# Query contract info
sncast call $NETWORK_HINT --contract-address $CONTRACT_ADDRESS --function get_contract_info

# Expected: the short string 'v32-agent'
# (Response Raw: [0x7633322d6167656e74])
\`\`\`

---

**Next Steps:**
1. Deploy mock ERC-20 tokens (if needed)
2. Generate session keypair
3. Follow E2E_TESTING_GUIDE.md for testing
EOF

echo -e "${GREEN}✓ Deployment info saved${NC}"
echo ""

# Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Class Hash:      ${YELLOW}$CLASS_HASH${NC}"
echo -e "Contract Address: ${YELLOW}$CONTRACT_ADDRESS${NC}"
echo -e "Owner Pubkey:     ${YELLOW}$OWNER_PUBKEY${NC}"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo -e "1. Review deployment in: ${YELLOW}$DEPLOYMENT_FILE${NC}"
echo -e "2. Verify on Voyager: ${YELLOW}https://sepolia.voyager.online/contract/$CONTRACT_ADDRESS${NC}"
echo -e "3. Follow ${YELLOW}docs/E2E_TESTING_GUIDE.md${NC} for testing"
echo ""
echo -e "${GREEN}Export environment variables:${NC}"
echo -e "${YELLOW}export SESSION_ACCOUNT_ADDRESS=$CONTRACT_ADDRESS${NC}"
echo -e "${YELLOW}export CLASS_HASH=$CLASS_HASH${NC}"
