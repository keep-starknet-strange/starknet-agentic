#!/bin/bash
# Deployment script for SessionAccount with Spending Policy on Sepolia
# Usage: ./deploy_sepolia.sh

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
command -v starkli >/dev/null 2>&1 || { echo -e "${RED}starkli is required but not installed${NC}"; exit 1; }
command -v scarb >/dev/null 2>&1 || { echo -e "${RED}scarb is required but not installed${NC}"; exit 1; }

# Check environment variables
if [ -z "$STARKNET_ACCOUNT" ]; then
    echo -e "${RED}STARKNET_ACCOUNT environment variable not set${NC}"
    exit 1
fi

if [ -z "$STARKNET_KEYSTORE" ]; then
    echo -e "${RED}STARKNET_KEYSTORE environment variable not set${NC}"
    exit 1
fi

if [ -z "$STARKNET_RPC" ]; then
    echo -e "${YELLOW}STARKNET_RPC not set, using default Sepolia RPC${NC}"
    export STARKNET_RPC="https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
fi

echo -e "${GREEN}✓ Prerequisites checked${NC}"
echo ""

# Get owner public key
echo -e "${YELLOW}Enter owner public key (felt252):${NC}"
read -r OWNER_PUBKEY

if [ -z "$OWNER_PUBKEY" ]; then
    echo -e "${RED}Owner public key cannot be empty${NC}"
    exit 1
fi

# Step 1: Compile contracts
echo -e "${YELLOW}Step 1: Compiling contracts...${NC}"
cd contracts/session-account
scarb build
cd ../..

if [ ! -f "contracts/session-account/target/dev/session_account_SessionAccount.contract_class.json" ]; then
    echo -e "${RED}Compilation failed - contract class not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Contracts compiled${NC}"
echo ""

# Step 2: Declare contract
echo -e "${YELLOW}Step 2: Declaring SessionAccount contract...${NC}"
DECLARE_OUTPUT=$(starkli declare \
    contracts/session-account/target/dev/session_account_SessionAccount.contract_class.json \
    --account $STARKNET_ACCOUNT \
    --keystore $STARKNET_KEYSTORE \
    --rpc $STARKNET_RPC 2>&1)

echo "$DECLARE_OUTPUT"

# Extract class hash
CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oP 'Class hash declared: \K0x[0-9a-fA-F]+' || echo "")

if [ -z "$CLASS_HASH" ]; then
    # Check if already declared
    CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oP 'Class hash: \K0x[0-9a-fA-F]+' || echo "")
fi

if [ -z "$CLASS_HASH" ]; then
    echo -e "${RED}Failed to extract class hash${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Class hash: $CLASS_HASH${NC}"
echo ""

# Step 3: Deploy contract
echo -e "${YELLOW}Step 3: Deploying SessionAccount instance...${NC}"
DEPLOY_OUTPUT=$(starkli deploy \
    $CLASS_HASH \
    $OWNER_PUBKEY \
    --account $STARKNET_ACCOUNT \
    --keystore $STARKNET_KEYSTORE \
    --rpc $STARKNET_RPC 2>&1)

echo "$DEPLOY_OUTPUT"

# Extract contract address
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oP 'Contract deployed: \K0x[0-9a-fA-F]+' || echo "")

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
starkli call $CONTRACT_ADDRESS get_contract_info

# Expected output:
# [
#   0x..., # contract name
#   0x32,  # version (50 = v3.2)
#   0x...  # agent ID (0 initially)
# ]
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
