#!/bin/bash
# Generate ZK Proof - Create a proof for privacy pool spend

set -e

# Configuration
CIRCUITS_DIR="zk_circuits"
TEMP_DIR="temp"
WALLET_DIR="wallet"

echo "========================================"
echo "🧾 ZK Privacy Pool - Generate Proof"
echo "========================================"

# Check if circuit is ready
if [ ! -f "$CIRCUITS_DIR/privacy_pool_production_final.zkey" ]; then
    echo "❌ Circuit not set up. Run: bash scripts/setup-circuits.sh"
    exit 1
fi

# Check for wallet data
if [ ! -f "$WALLET_DIR/commitments.json" ]; then
    echo "❌ Wallet not initialized. Run: node scripts/create-wallet.js"
    exit 1
fi

# Load wallet
echo ""
echo "📂 Loading wallet..."
WALLET=$(cat "$WALLET_DIR/commitments.json")
echo "✅ Loaded $(echo $WALLET | jq 'length') commitments"

# Get latest commitment
LATEST_COMMITMENT=$(echo $WALLET | jq -r '.[-1]')
echo "📝 Latest commitment: $LATEST_COMMITMENT"

# Create proof input
echo ""
echo "🔧 Creating proof input..."

# For now, create demo input
cat > "$TEMP_DIR/proof_input.json" << EOF
{
  "amount": 100,
  "salt": $(date +%s),
  "secret": $(date +%s%N)
}
EOF

echo "✅ Created proof input: $TEMP_DIR/proof_input.json"

# Generate witness
echo ""
echo "👁️  Generating witness..."
if [ -d "$CIRCUITS_DIR/privacy_pool_production_js" ]; then
    snarkjs wc -w "$TEMP_DIR/witness.wtns" "$TEMP_DIR/proof_input.json" \
        --电路 "$CIRCUITS_DIR/privacy_pool_production_js/circuit.wasm" 2>/dev/null || {
        echo "⚠️  Using snarkjs witness calculation..."
        # Simplified witness generation
        snarkjs wc -w "$TEMP_DIR/witness.wtns" "$TEMP_DIR/proof_input.json"
    }
else
    snarkjs wc -w "$TEMP_DIR/witness.wtns" "$TEMP_DIR/proof_input.json"
fi

# Generate proof
echo ""
echo "🔐 Generating Groth16 proof..."
snarkjs groth16 prove \
    "$CIRCUITS_DIR/privacy_pool_production_final.zkey" \
    "$TEMP_DIR/witness.wtns" \
    "$TEMP_DIR/proof.json" \
    "$TEMP_DIR/public.json"

# Verify proof
echo ""
echo "✅ Verifying proof..."
snarkjs groth16 verify \
    "$CIRCUITS_DIR/verification_key.json" \
    "$TEMP_DIR/public.json" \
    "$TEMP_DIR/proof.json"

# Save proof
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PROOF_FILE="proofs/proof_$TIMESTAMP.json"
mkdir -p proofs
cp "$TEMP_DIR/proof.json" "$PROOF_FILE"
cp "$TEMP_DIR/public.json" "proofs/public_$TIMESTAMP.json"

echo ""
echo "========================================"
echo "🎉 Proof generated successfully!"
echo "========================================"
echo ""
echo "📁 Files:"
echo "   Proof:   $PROOF_FILE"
echo "   Public:  proofs/public_$TIMESTAMP.json"
echo ""
echo "📝 Public inputs (for on-chain verification):"
cat "$TEMP_DIR/public.json" | jq '.'
