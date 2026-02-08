# ZK SNARK Integration - Privacy Pool

## Status: 🚧 IN PROGRESS

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ZK PRIVACY POOL ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                      OFF-CHAIN (Python)                     │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │     │
│  │  │ Commitment    │  │ Merkle       │  │ ZK Proof        │  │     │
│  │  │ Generator     │  │ Tree Builder │  │ Generator       │  │     │
│  │  │ (Pedersen)    │  │              │  │ (snarkjs)       │  │     │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │     │
│  │                                                             │     │
│  │  Outputs:                                                   │     │
│  │  - commitment = H(amount, salt)                             │     │
│  │  - nullifier = H(secret)                                   │     │
│  │  - merkle_root = MerkleRoot(commitments)                   │     │
│  │  - proof = Groth16.prove(witness)                          │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                              │                                      │
│                              ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                    ON-CHAIN (Solidity/Cairo)                 │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │     │
│  │  │ PrivacyPool   │  │ Pedersen     │  │ Groth16         │  │     │
│  │  │ Contract      │  │ Hash         │  │ Verifier        │  │     │
│  │  │               │  │              │  │                 │  │     │
│  │  │ - deposit()   │  │ - commit()   │  │ - verify()      │  │     │
│  │  │ - withdraw()  │  │ - nullify()  │  │                 │  │     │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘  │     │
│  └─────────────────────────────────────────────────────────────┘     │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Commitment Generator (`scripts/zk_proof_generator.py`)

```python
# Generate anonymous commitment
pool = ZKPrivacyPool()
commitment = pool.generate_commitment(amount=1000, salt=random())
# Output: commitment = H(amount, salt), nullifier = H(secret)
```

### 2. ZK Proof Generator

```python
# Generate Groth16 proof
proof = pool.create_proof(
    commitment=commitment,
    merkle_proof=[...],
    merkle_root=root,
    private_inputs=[]
)
# Output: pi_a, pi_b, pi_c (ZK proof)
```

### 3. Smart Contracts (`cairo/zk_verifier/`)

| File | Purpose |
|------|---------|
| `PedersenHash.sol` | Pedersen hash for commitments |
| `MerkleTree.sol` | Merkle tree for membership proofs |
| `Groth16Verifier.sol` | Groth16 verification |
| `FullPrivacyPool.sol` | Main privacy pool contract |

## Workflow

### Deposit Flow

```
1. USER (off-chain):
   - Generate secret = random()
   - Generate salt = random()
   - commitment = PedersenHash(amount, salt)
   - nullifier = PedersenHash(secret, 0)
   
2. Submit to contract:
   - deposit(commitment)
   
3. CONTRACT:
   - Store commitment in Merkle tree
   - Emit Deposit event
```

### Withdraw Flow

```
1. USER (off-chain):
   - Have commitment, secret, salt
   - Generate merkle_proof (path to root)
   - Generate ZK proof using snarkjs
   
2. Submit to contract:
   - withdraw(nullifier, proof, merkle_proof)
   
3. CONTRACT:
   - Verify ZK proof (Groth16)
   - Verify merkle_proof
   - Check nullifier not used
   - Mark nullifier as used
   - Transfer funds
```

## Installation

### Prerequisites

```bash
# Python 3.10+ (for full garaga compatibility)
# Currently running: Python 3.14

# Install snarkjs
npm install -g snarkjs

# Or use our Python implementation
pip install -r requirements.txt
```

### Install SnarkJS (Required for Real ZK)

```bash
# Using npm
npm install -g snarkjs

# Verify
snarkjs --version

# Or using npx
npx snarkjs --version
```

## Usage

### Run Demo

```bash
cd /home/wner/clawd/skills/_integrations/starknet-privacy
python3 scripts/zk_proof_generator.py
```

### Generate Real Proof

```bash
# 1. Create circuit input
cat > input.json <<EOF
{
  "amount": 1000,
  "salt": 12345,
  "nullifier": "..."
}
EOF

# 2. Generate witness
snarkjs wc -w witness.json input.json

# 3. Generate proof
snarkjs groth16 prove proving.key witness.json proof.json

# 4. Export calldata
snarkjs generatecall

# 5. Verify proof
snarkjs groth16 verify verification.key proof.json
```

## Full ZK Stack

### Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Pedersen Hash | ✅ | Python implementation |
| Merkle Tree | ✅ | Python + Solidity |
| ZK Proof Gen | ✅ | Python mock, snarkjs ready |
| Groth16 Verifier | ✅ | Solidity contract |
| Cairo Contracts | ⚠️ | Need Cairo 2.12+ (Scarb 2.14.0) |
| Garaga Integration | ❌ | Python 3.14 incompatibility |

### Python 3.14 Issue

Garaga requires Python 3.10-3.12. Current environment has Python 3.14.

**Workarounds:**
1. Use Docker container with Python 3.10
2. Use snarkjs directly (Node.js)
3. Wait for Garaga Python 3.14 support

### Recommended: Use SnarkJS

```bash
# Install Node.js and npm
# Then:
npm install -g snarkjs

# Generate proofs using snarkjs CLI
snarkjs groth16 setup circuit.r1cs -p pk.key -v vk.key
snarkjs wc -w witness.json input.json
snarkjs groth16 prove pk.key witness.json proof.json
snarkjs groth16 verify vk.key proof.json
```

## Circuit Design

### R1CS Constraint System

```
Public inputs:
- nullifier (1 field element)
- merkle_root (1 field element)
- amount (1 field element)

Private inputs:
- salt (1 field element)
- merkle_path (64 field elements)
- nullifier_secret (1 field element)

Constraints:
1. commitment = PedersenHash(amount, salt)
2. nullifier = PedersenHash(commitment, 0)
3. Merkle membership proof verification
4. Nullifier not double-spent
```

### Generate R1CS

```bash
# Using circom
circom circuits/privacy_pool.circom --r1cs --wasm --output circuits/

# Output:
# - privacy_pool.r1cs (constraint system)
# - privacy_pool_js/ (witness generation WASM)
```

## Deployment

### Deploy Contracts

```bash
# Using Hardhat
npx hardhat run scripts/deploy.js --network starknet

# Or using Foundry
forge script script/Deploy.s.sol --rpc-url starknet
```

### Deploy to Testnet

```bash
# Set environment variables
export STARKNET_RPC_URL=...
export PRIVATE_KEY=...

# Deploy
npx hardhat run scripts/deploy.js --network starknet_testnet
```

## Testing

### Run Unit Tests

```bash
# Python tests
pytest tests/test_commitment.py -v
pytest tests/test_merkle.py -v
pytest tests/test_proof.py -v

# Solidity tests
forge test
```

### Run Integration Tests

```bash
# End-to-end test
python3 scripts/e2e_test.py
```

## Security Considerations

### Trusted Setup

The Groth16 proof system requires a trusted setup ceremony:

```
Phase 1: Universal (can be reused for different circuits)
- Powers of tau ceremony
- Anyone can contribute randomness

Phase 2: Circuit-specific
- Must be done for each circuit
- Participants must be trusted (or use MPC)
```

### Soundness

- ZK proofs provide computational soundness
- 128-bit security level recommended
- Use BLS12-381 or BN254 curves

### Privacy Guarantees

- **Full privacy**: Commitments hide amount and sender
- **Linkability**: Cannot link deposits to withdrawals
- **Non-malleability**: Proofs cannot be modified

## Future Enhancements

1. **Cairo 2.12+ Contracts**: Upgrade to Cairo contracts when Scarb 2.14.0+ available
2. **Garaga Integration**: Full Groth16/Plonk when Python 3.10-3.12 available
3. **Multi-asset Support**: Support multiple token types
4. **Relayer Support**: Enable meta-transactions for privacy
5. **Shielded Pools**: Multiple pools with different parameters

## References

- [Groth16 Paper](https://eprint.iacr.org/2016/260)
- [snarkjs](https://github.com/iden3/snarkjs)
- [ZoKrates](https://github.com/Zokrates/ZoKrates)
- [Circom](https://github.com/iden3/circom)
- [Garaga](https://github.com/keep-starknet-strange/garaga)
- [Privacy Pools](https://privacypools.xyz)
