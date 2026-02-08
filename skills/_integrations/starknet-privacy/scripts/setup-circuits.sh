#!/bin/bash
# Setup ZK Circuits - Download dependencies and prepare environment

set -e

echo "========================================"
echo "🔐 ZK Privacy Pool - Circuit Setup"
echo "========================================"

# Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

if ! command -v circom &> /dev/null; then
    echo "❌ circom not found. Install with:"
    echo "   npm install -g circom"
    exit 1
fi
echo "✅ circom: $(circom --version)"

if ! command -v snarkjs &> /dev/null; then
    echo "❌ snarkjs not found. Install with:"
    echo "   npm install -g snarkjs"
    exit 1
fi
echo "✅ snarkjs: $(snarkjs --version)"

# Create directories
echo ""
echo "📁 Creating directories..."
mkdir -p circuits
mkdir -p temp

# Download Powers of Tau (if not exists)
PTAU_FILE="pot12_0000.ptau"
if [ ! -f "zk_circuits/$PTAU_FILE" ]; then
    echo ""
    echo "📥 Downloading Powers of Tau..."
    curl -L "https://hermez.s3-eu-west-1.amazonaws.com/powersoftau/pot12_0000.ptau" \
        -o "zk_circuits/$PTAU_FILE"
    echo "✅ Downloaded $PTAU_FILE"
else
    echo "✅ Powers of Tau already exists"
fi

# Compile circuits
echo ""
echo "🔨 Compiling circuits..."
cd zk_circuits

# Compile production circuit
if [ -f "privacy_pool_production.circom" ]; then
    echo "   Compiling privacy_pool_production.circom..."
    circom privacy_pool_production.circom --r1cs --wasm --output .
    echo "✅ Compiled privacy_pool_production.circom"
fi

# Trusted setup
echo ""
echo "🔐 Running trusted setup..."

if [ -f "privacy_pool_production.r1cs" ]; then
    # Phase 2 setup (circuit-specific)
    if [ ! -f "privacy_pool_production_0000.zkey" ]; then
        echo "   Initial setup..."
        snarkjs groth16 setup privacy_pool_production.r1cs pot12_0000.ptau privacy_pool_production_0000.zkey
    fi
    
    # Beacon ceremony (add randomness)
    if [ ! -f "privacy_pool_production_final.zkey" ]; then
        echo "   Beacon ceremony..."
        snarkjs zkey beacon privacy_pool_production_0000.zkey privacy_pool_production_final.zkey 1 12345
    fi
    
    # Export verification key
    if [ ! -f "verification_key.json" ]; then
        echo "   Exporting verification key..."
        snarkjs zkey export verificationkey privacy_pool_production_final.zkey verification_key.json
    fi
    
    echo "✅ Trusted setup complete"
fi

cd ..

echo ""
echo "========================================"
echo "🎉 Setup complete!"
echo "========================================"
echo ""
echo "Generated files:"
ls -la zk_circuits/*.r1cs zk_circuits/*.json 2>/dev/null | head -20
echo ""
echo "📚 Next steps:"
echo "   1. Generate witness: snarkjs wc -w witness.json input.json"
echo "   2. Generate proof:   snarkjs groth16 prove circuit_final.zkey witness.wtns.json proof.json public.json"
echo "   3. Verify:           snarkjs groth16 verify verification_key.json public.json proof.json"
