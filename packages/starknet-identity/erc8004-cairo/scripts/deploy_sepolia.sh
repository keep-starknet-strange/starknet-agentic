#!/bin/bash
set -e

echo "🚀 Deploying ERC-8004 to Sepolia Testnet..."
echo ""

# Sepolia Configuration with Alchemy RPC (v0.9)
RPC_URL="https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_9/r93j7Eo1Oub9N6Gs3p7fC"
ACCOUNT_ADDRESS="0x04a6b1f403E879B54Ba3e68072FE4C3aAf8Eb3617a51d8fea59b769432AbBF50"
PRIVATE_KEY="0x0038ea6d7f8df0f1d3d29004deb72390028c1d15be04f1b089f9841d235a7d33"
ACCOUNT_NAME="sepolia_deployer"

echo "📡 RPC URL: $RPC_URL"
echo "👤 Account: $ACCOUNT_ADDRESS"
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

# Set up account for sncast
echo "📝 Setting up account..."

# Delete existing account if it exists (ignore errors)
sncast account delete --name "$ACCOUNT_NAME" 2>/dev/null || true

# Import the account
sncast account import \
    --url "$RPC_URL" \
    --name "$ACCOUNT_NAME" \
    --address "$ACCOUNT_ADDRESS" \
    --private-key "$PRIVATE_KEY" \
    --type open_zeppelin \
    --silent \
    --add-profile "$ACCOUNT_NAME" 2>&1 | grep -v "WARNING" || true

echo "✅ Account configured"
echo ""

# Function to declare contract
declare_contract() {
    local contract_name=$1
    
    echo "==================== ${contract_name} ===================="
    echo "📝 Declaring ${contract_name}..."
    
    # Declare using sncast
    local output=$(sncast --profile "$ACCOUNT_NAME" declare \
        --url "$RPC_URL" \
        --contract-name "$contract_name" 2>&1)
    
    echo "$output"
    
    # Extract class hash
    local class_hash=$(echo "$output" | grep -o 'Class Hash:[[:space:]]*0x[0-9a-fA-F]\+' | head -1 | sed 's/Class Hash:[[:space:]]*//')
    
    # Check if already declared
    if echo "$output" | grep -q "already declared"; then
        echo "⚠️  Contract already declared, extracting class hash..."
        class_hash=$(echo "$output" | grep -o '0x[0-9a-fA-F]\{64\}' | head -1)
    fi
    
    if [ -z "$class_hash" ]; then
        echo "❌ Failed to extract class hash for $contract_name"
        echo "Output was:"
        echo "$output"
        return 1
    fi
    
    echo "✅ Class Hash: $class_hash"
    echo ""
    echo "$class_hash"
}

# Function to deploy contract
deploy_contract() {
    local class_hash=$1
    shift
    local constructor_args=("$@")
    
    echo "🏗️  Deploying contract..."
    
    # Build calldata arguments
    local calldata_flag=""
    if [ ${#constructor_args[@]} -gt 0 ]; then
        calldata_flag="--constructor-calldata"
        for arg in "${constructor_args[@]}"; do
            calldata_flag="$calldata_flag $arg"
        done
    fi
    
    # Deploy using sncast
    local output=$(sncast --profile "$ACCOUNT_NAME" deploy \
        --url "$RPC_URL" \
        --class-hash "$class_hash" \
        $calldata_flag 2>&1)
    
    echo "$output"
    
    # Extract contract address
    local contract_address=$(echo "$output" | grep -o 'Contract Address:[[:space:]]*0x[0-9a-fA-F]\+' | head -1 | sed 's/Contract Address:[[:space:]]*//')
    
    if [ -z "$contract_address" ]; then
        # Try alternative format
        contract_address=$(echo "$output" | grep -o '0x[0-9a-fA-F]\{64\}' | tail -1)
    fi
    
    if [ -z "$contract_address" ]; then
        echo "❌ Failed to extract contract address"
        echo "Output was:"
        echo "$output"
        return 1
    fi
    
    echo "✅ Contract Address: $contract_address"
    echo ""
    echo "$contract_address"
}

# Deploy IdentityRegistry
IDENTITY_CLASS_HASH=$(declare_contract "IdentityRegistry")
if [ $? -ne 0 ]; then
    echo "❌ Failed to declare IdentityRegistry"
    exit 1
fi

IDENTITY_ADDRESS=$(deploy_contract "$IDENTITY_CLASS_HASH")
if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy IdentityRegistry"
    exit 1
fi

# Deploy ReputationRegistry
REPUTATION_CLASS_HASH=$(declare_contract "ReputationRegistry")
if [ $? -ne 0 ]; then
    echo "❌ Failed to declare ReputationRegistry"
    exit 1
fi

REPUTATION_ADDRESS=$(deploy_contract "$REPUTATION_CLASS_HASH" "$IDENTITY_ADDRESS")
if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy ReputationRegistry"
    exit 1
fi

# Deploy ValidationRegistry
VALIDATION_CLASS_HASH=$(declare_contract "ValidationRegistry")
if [ $? -ne 0 ]; then
    echo "❌ Failed to declare ValidationRegistry"
    exit 1
fi

VALIDATION_ADDRESS=$(deploy_contract "$VALIDATION_CLASS_HASH" "$IDENTITY_ADDRESS")
if [ $? -ne 0 ]; then
    echo "❌ Failed to deploy ValidationRegistry"
    exit 1
fi

# Save addresses to JSON file
echo "💾 Saving deployment addresses..."
cat > deployed_addresses_sepolia.json << EOF
{
  "network": "sepolia",
  "rpcUrl": "$RPC_URL",
  "accountAddress": "$ACCOUNT_ADDRESS",
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

echo "✅ Addresses saved to deployed_addresses_sepolia.json"
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
echo "   cp ../deployed_addresses_sepolia.json ../deployed_addresses.json"
echo "   npm test"
echo ""

