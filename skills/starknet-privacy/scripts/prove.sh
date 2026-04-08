#!/bin/bash
# Generate a proof for Privacy Pool withdrawal
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$DIR/circuit/build"
INPUT="$DIR/inputs"
mkdir -p "$INPUT"

# Generate input if not exists
if [ ! -f "$INPUT/input.json" ]; then
    echo "Creating sample input..."
    cat > "$INPUT/input.json" << 'EOF'
{
    "secret": "12345678901234567890",
    "nullifier": "98765432109876543210",
    "pathElements": [
        "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
        "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"
    ],
    "pathIndices": [
        "0", "0", "0", "0", "0", "0", "0", "0", "0", "0",
        "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"
    ],
    "merkleRoot": "0",
    "nullifierHash": "0",
    "recipient": "0"
}
EOF
fi

echo "=== Generating witness ==="
node "$BUILD/privacy_pool_js/generate_witness.js" \
    "$BUILD/privacy_pool_js/privacy_pool.wasm" \
    "$INPUT/input.json" \
    "$BUILD/witness.wtns"

echo ""
echo "=== Generating proof ==="
snarkjs groth16 prove \
    "$BUILD/privacy_pool_final.zkey" \
    "$BUILD/witness.wtns" \
    "$BUILD/proof.json" \
    "$BUILD/public.json"

echo ""
echo "✅ Proof generated!"
echo "Proof: $BUILD/proof.json"
echo "Public signals: $BUILD/public.json"
cat "$BUILD/public.json"
