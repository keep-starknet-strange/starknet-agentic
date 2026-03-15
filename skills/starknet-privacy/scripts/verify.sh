#!/bin/bash
# Verify a Privacy Pool proof
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$DIR/circuit/build"

echo "=== Verifying proof ==="
snarkjs groth16 verify \
    "$BUILD/verification_key.json" \
    "$BUILD/public.json" \
    "$BUILD/proof.json"

echo ""
echo "✅ Proof verified!"
