#!/bin/bash

# Don't use set -e as it causes issues with command substitution
# We'll handle errors explicitly

echo "🚀 Deploying ERC-8004 to Sepolia Testnet..."
echo ""

# ==================== Configuration ====================
# SECURITY: do NOT hardcode private keys or paid RPC keys in repo scripts.
# Provide these via environment variables (or a local .env you source manually).
#
# Required:
#   STARKNET_RPC_URL
#   DEPLOYER_ADDRESS
#   DEPLOYER_PRIVATE_KEY
#
# Optional:
#   DEPLOYER_ACCOUNT_NAME (default: sepolia_deployer)
#   OWNER_ADDRESS (default: DEPLOYER_ADDRESS)

RPC_URL="${STARKNET_RPC_URL:?STARKNET_RPC_URL is required}"
ACCOUNT_ADDRESS="${DEPLOYER_ADDRESS:?DEPLOYER_ADDRESS is required}"
PRIVATE_KEY="${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"
ACCOUNT_NAME="${DEPLOYER_ACCOUNT_NAME:-sepolia_deployer}"

# Owner address for the contracts (deployer is the owner)
OWNER_ADDRESS="${OWNER_ADDRESS:-$ACCOUNT_ADDRESS}"

echo "📡 RPC URL: $RPC_URL"
echo "👤 Account: $ACCOUNT_ADDRESS"
echo "🔑 Owner: $OWNER_ADDRESS"
echo ""

# Ensure we use the latest sncast
export PATH="$HOME/.local/bin:$PATH"

# Build contracts
echo "📦 Building contracts with scarb..."
scarb build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build complete"
echo ""

# Ensure the account exists in the accounts file
echo "📝 Setting up account: $ACCOUNT_NAME"

# Check if account file exists and create directory if needed
ACCOUNTS_FILE="$HOME/.starknet_accounts/starknet_open_zeppelin_accounts.json"
mkdir -p "$(dirname "$ACCOUNTS_FILE")"

# Try to import the account (will fail silently if already exists)
sncast account import \
    --name "$ACCOUNT_NAME" \
    --address "$ACCOUNT_ADDRESS" \
    --private-key "$PRIVATE_KEY" \
    --type oz 2>&1 || echo "   (Account may already exist)"

echo "✅ Account ready"
echo ""

# ==================== DECLARE IDENTITY REGISTRY ====================
echo "==================== IdentityRegistry ===================="
echo "📝 Declaring IdentityRegistry..."

DECLARE_OUTPUT=$(sncast --profile "$ACCOUNT_NAME" declare \
    --contract-name "IdentityRegistry" 2>&1)

echo "$DECLARE_OUTPUT"

# Extract class hash - check for "already declared" case first
if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
    echo "⚠️  Contract already declared, extracting class hash..."
    IDENTITY_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
else
    IDENTITY_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | head -1 | sed 's/class_hash: //')
    if [ -z "$IDENTITY_CLASS_HASH" ]; then
        IDENTITY_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
    fi
fi

if [ -z "$IDENTITY_CLASS_HASH" ]; then
    echo "❌ Failed to extract class hash for IdentityRegistry"
    exit 1
fi

echo "✅ Class Hash: $IDENTITY_CLASS_HASH"
echo ""

# Deploy IdentityRegistry
echo "🏗️  Deploying IdentityRegistry..."
DEPLOY_OUTPUT=$(sncast --profile "$ACCOUNT_NAME" deploy \
    --class-hash "$IDENTITY_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" 2>&1)

echo "$DEPLOY_OUTPUT"

IDENTITY_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | head -1 | sed 's/contract_address: //')
if [ -z "$IDENTITY_ADDRESS" ]; then
    IDENTITY_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | tail -1)
fi

if [ -z "$IDENTITY_ADDRESS" ]; then
    echo "❌ Failed to extract contract address for IdentityRegistry"
    exit 1
fi

echo "✅ IdentityRegistry Address: $IDENTITY_ADDRESS"
echo ""

# ==================== DECLARE REPUTATION REGISTRY ====================
echo "==================== ReputationRegistry ===================="
echo "📝 Declaring ReputationRegistry..."

DECLARE_OUTPUT=$(sncast --profile "$ACCOUNT_NAME" declare \
    --contract-name "ReputationRegistry" 2>&1)

echo "$DECLARE_OUTPUT"

if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
    echo "⚠️  Contract already declared, extracting class hash..."
    REPUTATION_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
else
    REPUTATION_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | head -1 | sed 's/class_hash: //')
    if [ -z "$REPUTATION_CLASS_HASH" ]; then
        REPUTATION_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
    fi
fi

if [ -z "$REPUTATION_CLASS_HASH" ]; then
    echo "❌ Failed to extract class hash for ReputationRegistry"
    exit 1
fi

echo "✅ Class Hash: $REPUTATION_CLASS_HASH"
echo ""

# Deploy ReputationRegistry (owner + identity_registry_address)
echo "🏗️  Deploying ReputationRegistry..."
DEPLOY_OUTPUT=$(sncast --profile "$ACCOUNT_NAME" deploy \
    --class-hash "$REPUTATION_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$IDENTITY_ADDRESS" 2>&1)

echo "$DEPLOY_OUTPUT"

REPUTATION_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | head -1 | sed 's/contract_address: //')
if [ -z "$REPUTATION_ADDRESS" ]; then
    REPUTATION_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | tail -1)
fi

if [ -z "$REPUTATION_ADDRESS" ]; then
    echo "❌ Failed to extract contract address for ReputationRegistry"
    exit 1
fi

echo "✅ ReputationRegistry Address: $REPUTATION_ADDRESS"
echo ""

# ==================== DECLARE VALIDATION REGISTRY ====================
echo "==================== ValidationRegistry ===================="
echo "📝 Declaring ValidationRegistry..."

DECLARE_OUTPUT=$(sncast --profile "$ACCOUNT_NAME" declare \
    --contract-name "ValidationRegistry" 2>&1)

echo "$DECLARE_OUTPUT"

if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
    echo "⚠️  Contract already declared, extracting class hash..."
    VALIDATION_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
else
    VALIDATION_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | head -1 | sed 's/class_hash: //')
    if [ -z "$VALIDATION_CLASS_HASH" ]; then
        VALIDATION_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)
    fi
fi

if [ -z "$VALIDATION_CLASS_HASH" ]; then
    echo "❌ Failed to extract class hash for ValidationRegistry"
    exit 1
fi

echo "✅ Class Hash: $VALIDATION_CLASS_HASH"
echo ""

# Deploy ValidationRegistry (owner + identity_registry_address)
echo "🏗️  Deploying ValidationRegistry..."
DEPLOY_OUTPUT=$(sncast --profile "$ACCOUNT_NAME" deploy \
    --class-hash "$VALIDATION_CLASS_HASH" \
    --constructor-calldata "$OWNER_ADDRESS" "$IDENTITY_ADDRESS" 2>&1)

echo "$DEPLOY_OUTPUT"

VALIDATION_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | head -1 | sed 's/contract_address: //')
if [ -z "$VALIDATION_ADDRESS" ]; then
    VALIDATION_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | tail -1)
fi

if [ -z "$VALIDATION_ADDRESS" ]; then
    echo "❌ Failed to extract contract address for ValidationRegistry"
    exit 1
fi

echo "✅ ValidationRegistry Address: $VALIDATION_ADDRESS"
echo ""

# Save addresses to JSON file
echo "💾 Saving deployment addresses..."
cat > deployed_addresses_sepolia.json << EOF
{
  "network": "sepolia",
  "rpcUrl": "$RPC_URL",
  "accountAddress": "$ACCOUNT_ADDRESS",
  "ownerAddress": "$OWNER_ADDRESS",
  "contracts": {
    "identityRegistry": {
      "classHash": "$IDENTITY_CLASS_HASH",
      "address": "$IDENTITY_ADDRESS"
    },
    "reputationRegistry": {
      "classHash": "$REPUTATION_CLASS_HASH",
      "address": "$REPUTATION_ADDRESS"
    },
    "validationRegistry": {
      "classHash": "$VALIDATION_CLASS_HASH",
      "address": "$VALIDATION_ADDRESS"
    }
  },
  "deployedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Also copy to deployed_addresses.json for E2E tests
cp deployed_addresses_sepolia.json deployed_addresses.json

echo "✅ Addresses saved to deployed_addresses_sepolia.json"
echo "✅ Addresses copied to deployed_addresses.json (for E2E tests)"
echo ""

# Display summary
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║              SEPOLIA DEPLOYMENT SUCCESSFUL! 🎉                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Contract Addresses:"
echo "   IdentityRegistry:   $IDENTITY_ADDRESS"
echo "   ReputationRegistry: $REPUTATION_ADDRESS"
echo "   ValidationRegistry: $VALIDATION_ADDRESS"
echo ""
echo "📄 Configuration saved to: deployed_addresses_sepolia.json"
echo ""
echo "🔍 View on Voyager:"
echo "   https://sepolia.voyager.online/contract/$IDENTITY_ADDRESS"
echo ""
echo "🧪 To run E2E tests:"
echo "   cd e2e-tests"
echo "   npm install"
echo "   npm test"
echo ""
