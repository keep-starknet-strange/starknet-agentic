# Starknet Privacy Pool - Node.js Integration

ZK Privacy Pool implementation for starknet-agentic using snarkjs and circom.

## Installation

```bash
cd skills/starknet-privacy/scripts
npm install
```

## Quick Start

### Check Setup Status

```bash
node starknet-privacy.js status
```

### Run Demo

```bash
node starknet-privacy.js demo
```

## Setup ZK Circuits

```bash
# Download powers of tau and compile circuits
bash scripts/setup-circuits.sh
```

This will:
1. Download Powers of Tau (if needed)
2. Compile `privacy_pool_production.circom` to R1CS + WASM
3. Run trusted setup for Groth16
4. Export verification key

## Generate Proof

```bash
# Generate ZK proof for spending a note
bash scripts/generate-proof.sh
```

## Architecture

```
skills/starknet-privacy/
├── starknet-privacy.js     # Main module (StarknetPrivacyPool class)
├── package.json            # npm package config
├── README.md              # This file
├── test-privacy.js        # Test suite
├── scripts/
│   ├── setup-circuits.sh   # Circuit setup script
│   ├── generate-proof.sh   # Proof generation script
│   └── ...
├── zk_circuits/
│   ├── privacy_pool_production.circom  # ZK circuit
│   ├── privacy_pool_production.r1cs    # Compiled circuit
│   ├── privacy_pool_production_js/     # Witness generation WASM
│   ├── privacy_pool_production_final.zkey  # Proving key
│   └── verification_key.json           # Verification key
└── temp/                  # Temporary files
```

## Usage

```javascript
const { StarknetPrivacyPool } = require('./starknet-privacy');

async function example() {
    const pool = new StarknetPrivacyPool(32);
    
    // Generate commitment
    const commitment = await pool.generateCommitment(1000, 12345);
    
    // Build Merkle tree
    const { root } = await pool.buildMerkleTree([commitment]);
    
    // Generate ZK proof
    const { proof, public: publicInputs } = await pool.generateProof(
        amount, salt, secret,
        commitments, leafIndex, merkleRoot
    );
    
    // Verify proof
    const isValid = await pool.verifyProof(proof, publicInputs);
}
```

## Workflow

### 1. Create Commitment (Deposit)
```javascript
const commitment = await pool.generateCommitment(amount, salt);
// Send to ShieldedPool contract
```

### 2. Generate Proof (Spend/Withdraw)
```javascript
const { proof, public, nullifier } = await pool.generateProof(
    amount, salt, secret,
    commitments, leafIndex, merkleRoot
);
// Submit to contract with nullifier + proof
```

### 3. Verify On-Chain
- Contract verifies Groth16 proof
- Checks nullifier not used
- Transfers funds

## Dependencies

- **circom** - ZK circuit compiler
- **snarkjs** - ZK proof generation/verification
- **Node.js** - Runtime

## Setup Requirements

```bash
# Install circom
npm install -g circom

# Install snarkjs
npm install -g snarkjs

# Or via npm in project
npm install snarkjs
```

## Files Generated

| File | Purpose |
|------|---------|
| `privacy_pool_production.r1cs` | Circuit constraint system |
| `privacy_pool_production_js/` | Witness generation WASM |
| `privacy_pool_production_final.zkey` | Proving key (private) |
| `verification_key.json` | Verification key (public) |

## Security Notes

- The `.zkey` file contains secret randomness - keep it private
- Verification key can be public
- Trusted setup ceremony should be conducted with multiple participants

## References

- [Circom Documentation](https://docs.circom.io)
- [SnarkJS](https://github.com/iden3/snarkjs)
- [Groth16 Paper](https://eprint.iacr.org/2016/260)
