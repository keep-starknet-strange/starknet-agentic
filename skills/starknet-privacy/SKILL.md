---
name: starknet-privacy
description: |
  ⚠️ EXPERIMENTAL - NOT PRODUCTION READY ⚠️
  Privacy protocols for Starknet: shielded pools using ZK-SNARKs with Circom and snarkjs.
  Generates zero-knowledge proofs for confidential transactions.
  Requires cryptographic audit before mainnet use.
version: 2.1.0
updated: 2026-02-10
---

# ⚠️ Starknet Privacy Skill - EXPERIMENTAL ⚠️

**This skill is for educational and experimental purposes only.**
- NOT production ready - requires cryptographic audit
- Integration tests included but full verification pending
- Use only on testnet until security review complete

Privacy-preserving shielded pool for Starknet using ZK-SNARKs.

## Features

- **Shielded transfers:** Hide amount and recipient
- **Nullifier system:** Prevent double-spending
- **Merkle proofs:** Verify membership without revealing data
- **On-chain verification:** Groth16 proof verification

## Usage

### Python API

```python
from scripts.zk_prover import ZKPrivacyPool

# Initialize
pool = ZKPrivacyPool()

# Compile circuit
pool.compile_circuit()

# Setup
pool.trusted_setup()

# Generate proof
input_data = {
    "nullifierPublic": 1234567890,
    "merkleRootPublic": 9876543210,
    "amountPublic": 100,
    "salt": 1111111111,
    "nullifierSecret": 2222222222,
    "merklePath": [...],  # 32 elements
    "merkleIndices": [...]  # 32 elements (0 or 1)
}
proof = pool.generate_proof(input_data)

# Verify
pool.verify_proof(proof)
```

### CLI

```bash
# Run proof generation demo
python3 scripts/zk_prover.py

# Run tests
python3 -m pytest tests/
```

## Dependencies

### System
- Circom 2.2.2+
- snarkjs 0.7.0+
- Node.js 18+
- Python 3.10+

### Python
```bash
pip install -r requirements.txt
```

## Project Structure

```
privacy-pool/
├── README.md              # User-facing docs
├── SKILL.md               # This file
├── requirements.txt       # Python deps
├── scripts/
│   ├── zk_prover.py      # Main ZK proof generator
│   └── README.md          # Script documentation
├── zk_circuits/
│   ├── privacy_pool.circom  # ZK circuit (32 levels)
│   └── README.md          # Circuit docs
└── tests/
    └── test_privacy_pool.py
```

## Cryptography

| Component | Algorithm | Purpose |
|----------|-----------|---------|
| Commitment | Poseidon | Hide amount + salt |
| Nullifier | Poseidon | Unique spend identifier |
| Merkle tree | Poseidon | Membership proof |

## Circuit

### Inputs

**Public:**
- `nullifierPublic` - Published nullifier
- `merkleRootPublic` - Current tree root
- `amountPublic` - Amount (can be zero for anonymous)

**Private:**
- `salt` - Random salt
- `nullifierSecret` - Secret for nullifier
- `merklePath[32]` - Merkle proof
- `merkleIndices[32]` - Path indices

## Commands

```bash
# Generate proof
python3 scripts/zk_prover.py

# Run tests
python3 -m pytest tests/

# Compile circuit
circom zk_circuits/privacy_pool.circom --r1cs --wasm -o zk_circuits/

# Trusted setup
snarkjs groth16 setup zk_circuits/privacy_pool.r1cs -p zk_circuits/proving.key -v zk_circuits/verification.key
```

## References

- [Circom docs](https://docs.circom.io/)
- [snarkjs](https://github.com/iden3/snarkjs)
- [Poseidon hash](https://www.poseidon-hash.info/)
