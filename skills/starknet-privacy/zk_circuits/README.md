# ZK Privacy Pool Circuits

This directory contains Circom circuits for the privacy pool ZK proofs.

## Structure

```
zk_circuits/
├── privacy_pool.circom          # Main privacy pool circuit (32 levels)
├── witness_template.json        # Template for witness input
└── README.md                   # This file
```

## Privacy Pool Circuit

### Inputs

**Public (visible on-chain):**
| Input | Type | Description |
|-------|------|-------------|
| `nullifierPublic` | signal | Nullifier hash (revealed on spend) |
| `merkleRootPublic` | signal | Current Merkle tree root |
| `amountPublic` | signal | Amount (can be zero for anonymous) |

**Private (not revealed):**
| Input | Type | Description |
|-------|------|-------------|
| `salt` | signal | Random salt for commitment |
| `nullifierSecret` | signal | Secret for nullifier generation |
| `merklePath[32]` | signal[] | Merkle proof path |
| `merkleIndices[32]` | signal[] | Left(0)/Right(1) indicators |

### Cryptography

- **Hash function:** Poseidon (Starknet standard)
- **Commitment:** `H(amount, salt)`
- **Nullifier:** `H(commitment, nullifierSecret)`
- **Merkle tree:** Poseidon-based binary tree

### Security Properties

1. **Balance privacy:** Amount and recipient hidden in commitment
2. **Nullifier uniqueness:** Each spend produces unique nullifier
3. **Merkle membership:** Proof that commitment exists in tree
4. **Range proof:** Amount > 0 (prevents zero-value attacks)

## Compilation

### Install dependencies
```bash
# Install Circom
curl https://docs.circom.io/downloads/downloCircom.sh | bash

# Install snarkjs
npm install -g snarkjs
```

### Compile circuit
```bash
# Compile to R1CS and WASM
circom privacy_pool.circom --r1cs --wasm --json -o ./

# This generates:
# - privacy_pool.r1cs
# - privacy_pool_js/ (WASM witness generator)
```

### Trusted Setup (Groth16)
```bash
# Generate proving and verification keys
snarkjs groth16 setup privacy_pool.r1cs -p proving.key -v verification.key

# Export verification key as Solidity contract
snarkjs groth16 exportverkey verification.key verification_key.json
snarkjs verif to-solidity verification.key verifier.sol
```

### Generate Witness
```bash
# Create witness input
cat > input.json <<EOF
{
  "nullifierPublic": 1234567890,
  "merkleRootPublic": 9876543210,
  "amountPublic": 100,
  "salt": 1111111111,
  "nullifierSecret": 2222222222,
  "merklePath": [...],
  "merkleIndices": [...]
}
EOF

# Generate witness
node privacy_pool_js/generate_witness.js input.json witness.wtns
```

### Generate Proof
```bash
# Generate Groth16 proof
snarkjs groth16 prove proving.key witness.wtns proof.json

# Verify proof
snarkjs groth16 verify verification.key proof.json
```

### Export Calldata
```bash
# Export as contract call data
snarkjs groth16 exportcalldata proof.json public.json calldata.json
```

## Usage with Python

```python
import json
from zk_prover import ZKPrivacyPool

# Initialize
pool = ZKPrivacyPool()

# Setup
pool.setup()

# Generate commitment
commitment = pool.generate_commitment(amount=100, salt=random())

# Generate proof
proof = pool.create_proof(commitment, merkle_proof, merkle_root)

# Verify
pool.verify_proof(proof)
```

## Verification (On-chain)

The verification key can be deployed as a Solidity contract:

```solidity
import { Verifier } from "./verifier.sol";

contract PrivacyPoolVerifier {
    Verifier verifier;
    
    function verifyProof(
        uint256[2] memory pi_a,
        uint256[2][2] memory pi_b,
        uint256[2] memory pi_c,
        uint256[3] memory public_inputs
    ) public returns (bool) {
        return verifier.verifyProof(pi_a, pi_b, pi_c, public_inputs);
    }
}
```

## References

- [Circom documentation](https://docs.circom.io/)
- [snarkjs](https://github.com/iden3/snarkjs)
- [Poseidon hash](https://www.poseidon-hash.info/)
- [Starknet crypto](https://docs.starknet.io/documentation/architecture-and-concepts/cryptography)
