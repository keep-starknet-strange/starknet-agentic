# Privacy Pool Architecture

## Overview

Zero-knowledge privacy pool for Starknet using ZK-SNARKs.

## Components

### ZK Circuits (zk_circuits/)
- `privacy_pool.circom` - Main ZK circuit
- Witness generation and proof verification

### Python Scripts (scripts/)
- `zk_prover.py` - Proof generation
- `generate_valid_witness.py` - Witness generation

### Tests (tests/)
- `test_privacy_pool.py` - Test suite

## Data Flow

```
User Deposit → Merkle Tree → ZK Circuit → Proof → Smart Contract Verification
```

## Security Considerations

- Circuit designed to prevent double-spending
- Merkle tree for efficient membership proofs
- No linkability between deposits and withdrawals
