# REAL ZK SETUP GUIDE

## Status: 🚧 Trusted Setup in Progress

## Quick Start (Demo Mode)

For testing without full ceremony:

```bash
cd /home/wner/clawd/skills/_integrations/starknet-privacy
python3 scripts/zk_snarkjs_workflow.py
```

This generates mock proofs that demonstrate the workflow.

## Full Trusted Setup (Required for Production)

### Step 1: Download Powers of Tau

**Option A: Download Pre-computed Ceremony**

```bash
cd zk_demo

# Try these sources:
# 1. Iden3 ceremony (17GB - full power 12)
curl -L -o pot12_0000.ptau \
  "https://hermez.s3-eu-west-1.amazonaws.com/powersoftau/pot12_0000.ptau"

# 2. Alternative (smaller, for testing)
curl -L -o pot12_0000.ptau \
  "https://www.dropbox.com/s/0jiv8c2t0oz0y8o/pot12_0000.ptau?dl=1"
```

**File Sizes:**
| Power | Size | Use Case |
|-------|------|----------|
| 2^4 | ~64MB | Testing |
| 2^10 | ~2GB | Development |
| 2^12 | ~17GB | Production |

### Step 2: Run Trusted Setup

```bash
cd zk_demo

# Generate ceremony (takes 5-30 min)
snarkjs ptn bn254 12 pot12_0000.ptau ceremony_0000.ptau

# Contribute randomness (interactive)
snarkjs ptc ceremony_0000.ptau ceremony_final.ptau
```

### Step 3: Create Circuit

```bash
# Compile circuit
npx circom2 circuits/privacy_pool.circom --r1cs --wasm --output circuits/

# Output:
# - circuits/privacy_pool.r1cs
# - circuits/privacy_pool_js/
```

### Step 4: Generate Proving Keys

```bash
# Setup Groth16 (requires ceremony)
snarkjs groth16 setup circuits/privacy_pool.r1cs ceremony_final.ptau circuit_0000.zkey

# Verify setup
snarkjs zkv circuits/privacy_pool.r1cs ceremony_final.ptau circuit_0000.zkey

# Export verification key
snarkjs zkev circuit_0000.zkey verification_key.json

# Export Solidity verifier
snarkjs zkesv circuit_0000.zkey contracts/Groth16Verifier.sol
```

### Step 5: Generate Proof

```bash
# Generate witness
snarkjs wc -w witness.json circuits/privacy_pool_js/witness_calculator < input.json

# Generate proof
snarkjs g16p circuit_0000.zkey witness.json proof.json public.json

# Verify proof
snarkjs g16v verification_key.json public.json proof.json
```

## Running Full Setup

### Interactive Setup (Recommended)

```bash
cd zk_demo

# 1. Download ceremony
./download_ptau.sh

# 2. Run setup
./setup.sh

# 3. Generate keys
./generate_keys.sh

# 4. Create proof
./create_proof.sh

# 5. Verify
./verify_proof.sh
```

### Automated Setup

```bash
cd /home/wner/clawd/skills/_integrations/starknet-privacy

# Download real ptau (17GB)
./scripts/download_real_ptau.sh

# Run full ceremony
python3 scripts/run_trusted_setup.py --power 12

# This will:
# 1. Download pot12_0000.ptau
# 2. Run powersoftau ceremony
# 3. Generate circuit keys
# 4. Create verification contract
```

## Current Demo Status

| Step | Status | File |
|------|--------|------|
| R1CS Generation | ✅ Done | circuit.r1cs |
| Input Generation | ✅ Done | input.json |
| Witness | ✅ Done | witness.wtns.json |
| Proof | ✅ Done | proof.json |
| Verification | ✅ Mock | verification_key.json |

**For REAL proofs:** Download the actual pot12_0000.ptau file (~17GB).

## Scripts Available

```bash
# Demo (works now)
python3 scripts/zk_snarkjs_workflow.py

# Full setup (requires pot12_0000.ptau)
python3 scripts/run_trusted_setup.py --power 12

# Generate circuit from circom
npx circom2 circuits/privacy_pool.circom --r1cs --wasm

# Download ceremony
./scripts/download_ptau.sh

# Create proof
./scripts/generate_proof.sh input.json proof.json
```

## Expected Output (Real Setup)

After running full setup:

```
📁 Generated files:
├── circuit.r1cs           - Constraint system
├── circuit_0000.zkey      - Proving key (17GB+)
├── verification_key.json  - Verification key
├── Groth16Verifier.sol    - Solidity verifier
├── witness.wtns          - Witness file
├── proof.json            - ZK proof (~200 bytes)
└── public.json           - Public inputs
```

## Verification

```bash
# Verify proof on-chain
npx hardhat run scripts/verify_onchain.js --network starknet

# Verify off-chain
snarkjs g16v verification_key.json public.json proof.json
```

## Next Steps

1. ✅ SnarkJS installed (0.7.6)
2. ✅ Circom2 installed (2.2.2)
3. ⏳ Download pot12_0000.ptau (17GB)
4. ⏳ Run trusted setup
5. ⏳ Generate real keys
6. ⏳ Create real proof
7. ⏳ Deploy verifier contract

## Troubleshooting

### "Powers of Tau file not found"
```bash
# Download manually
wget https://hermez.s3-eu-west-1.amazonaws.com/powersoftau/pot12_0000.ptau
```

### "Ceremony too slow"
```bash
# Use smaller power for testing
snarkjs ptn bn254 4 test_small.ptau
```

### "Not enough memory"
```bash
# Use streaming mode
snarkjs groth16 setup --help
```

## Resources

- [SnarkJS Documentation](https://github.com/iden3/snarkjs)
- [Circom Documentation](https://docs.circom.io)
- [Iden3 Powers of Tau](https://github.com/iden3/snarkjs/tree/master/templates)
- [Hermez Ceremony](https://hermez.io)
