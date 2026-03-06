# Starknet ZK Privacy Pool

Privacy-preserving shielded pool for Starknet using ZK-SNARKs.

## Overview

This skill enables AI agents to create and verify private transactions on Starknet using zero-knowledge proofs.

## Features

- **Shielded transfers:** Hide amount and recipient
- **Nullifier system:** Prevent double-spending
- **Merkle proofs:** Verify membership without revealing data
- **On-chain verification:** Groth16 proof verification

## Quick Start

### Prerequisites

```bash
# Install Circom
curl https://docs.circom.io/downloads/downloCircom.sh | bash

# Install snarkjs
npm install -g snarkjs

# Python dependencies
pip install -r requirements.txt
```

### Python Usage

```python
from scripts.zk_prover import ZKPrivacyPool

# Initialize
pool = ZKPrivacyPool()

# Compile circuit
pool.compile_circuit()

# Setup
pool.trusted_setup()

# Generate proof for deposit
input_data = {
    "nullifierPublic": 0,
    "merkleRootPublic": tree_root,
    "amountPublic": 100,
    "salt": random_salt(),
    "nullifierSecret": random_secret(),
    "merklePath": [...],
    "merkleIndices": [...]
}
proof = pool.generate_proof(input_data)

# Verify
pool.verify_proof(proof)
```

## Project Structure

```
privacy-pool/
├── README.md                 # This file
├── requirements.txt          # Python dependencies
├── .gitignore              # Git ignore rules
├── SKILL.md                 # OpenClaw skill definition
├── scripts/
│   ├── zk_prover.py        # Main proof generator
│   └── README.md           # Script documentation
├── zk_circuits/
│   ├── privacy_pool.circom  # ZK circuit (32 levels)
│   ├── witness_template.json # Input template
│   └── README.md           # Circuit documentation
└── tests/
    └── test_privacy_pool.py # Unit tests
```

## Circuit

### Cryptography

| Component | Algorithm | Purpose |
|----------|-----------|---------|
| Commitment | Poseidon | Hide amount + salt |
| Nullifier | Poseidon | Unique spend identifier |
| Merkle tree | Poseidon | Membership proof |

### Security Properties

1. **Privacy:** Amount and recipient hidden
2. **Unlinkability:** Cannot link deposits to withdrawals
3. **Soundness:** Cannot forge proofs
4. **Completeness:** Honest prover always verified

## CLI Commands

```bash
# Generate proof
python scripts/zk_prover.py

# Run tests
python -m pytest tests/
```

## Documentation

- [Circuit docs](zk_circuits/README.md)
- [Script docs](scripts/README.md)
- [OpenClaw skill](SKILL.md)

## References

- [Circom docs](https://docs.circom.io/)
- [snarkjs](https://github.com/iden3/snarkjs)
- [Poseidon hash](https://www.poseidon-hash.info/)
- [Starknet crypto](https://docs.starknet.io/)
