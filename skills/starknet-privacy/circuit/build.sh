#!/bin/bash
# Privacy Pool — Circuit Build Script
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/build"
mkdir -p "$OUT"

echo "=== Step 1: Compile Circuit ==="
circom "$DIR/privacy_pool.circom" \
    --r1cs \
    --wasm \
    --sym \
    --output "$OUT" \
    -l node_modules/circomlib/circuits

echo "✅ Circuit compiled"
ls -la "$OUT"/*.r1cs "$_OUT"/*.wasm "$OUT"/*.sym

echo ""
echo "=== Step 2: Info ==="
snarkjs r1cs info "$OUT/privacy_pool.r1cs"

echo ""
echo "=== Step 3: Powers of Tau (ceremony) ==="
# Use existing ptau if available, otherwise download
PTAU_FILE="$OUT/pot12_final.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau..."
    snarkjs powersoftau new bn128 12 "$OUT/pot12_0000.ptau" -v
    snarkjs powersoftau contribute "$OUT/pot12_0000.ptau" "$OUT/pot12_0001.ptau" \
        --name="First" -e="random entropy for contribution"
    snarkjs powersoftau prepare phase2 "$OUT/pot12_0001.ptau" "$PTAU_FILE" -v
    rm -f "$OUT"/pot12_0000.ptau "$OUT"/pot12_0001.ptau
fi

echo ""
echo "=== Step 4: Groth16 Setup ==="
snarkjs groth16 setup "$OUT/privacy_pool.r1cs" "$PTAU_FILE" "$OUT/privacy_pool_0000.zkey"

echo ""
echo "=== Step 5: Contribute to zkey ==="
snarkjs zkey contribute "$OUT/privacy_pool_0000.zkey" "$OUT/privacy_pool_final.zkey" \
    --name="Contributor" -e="second random entropy"
rm -f "$OUT/privacy_pool_0000.zkey"

echo ""
echo "=== Step 6: Export verification key ==="
snarkjs zkey export verificationkey "$OUT/privacy_pool_final.zkey" "$OUT/verification_key.json"

echo ""
echo "=== Step 7: Export Solidity verifier (optional) ==="
snarkjs zkey export solidityverifier "$OUT/privacy_pool_final.zkey" "$OUT/Verifier.sol" 2>/dev/null || true

echo ""
echo "✅ Build complete!"
echo "Files:"
echo "  - $OUT/privacy_pool.wasm (witness generator)"
echo "  - $OUT/privacy_pool_final.zkey (proving key)"
echo "  - $OUT/verification_key.json (verification key)"
