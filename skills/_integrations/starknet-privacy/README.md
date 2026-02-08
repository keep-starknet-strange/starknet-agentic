# Starknet Shielded Pool

Privacy-preserving confidential transactions on Starknet using ZK-SNARKs.

## Quick Start

### 1. Python Demo (Works Now)
```bash
cd /home/wner/clawd/skills/_integrations/starknet-privacy

# Run basic shielded pool demo
python3 scripts/zk_proof_generator.py

# Run ZK-SNARK demo (mock proofs)
python3 scripts/zk_circuit.py
```

### 2. Cairo Contract (Requires Scarb 2.14.0)
```bash
# Current: Scarb 2.8.1
# Required: Scarb 2.14.0+ for Garaga

# Upgrade Scarb
curl https://docs.swmansion.com/scarb/install.sh | sh -s -- --version 2.14.0
```

### 3. Deploy to Starknet
```bash
# Using Starkli
starkli deploy --network sepolia \
  --class-hash target/dev/starknet_shielded_pool_ShieldedPool.contract_class_hash
```

## Project Structure

```
starknet-privacy/
├── scripts/
│   ├── shielded_pool.py      # Core privacy pool logic
│   ├── zk_proof_generator.py  # ZK proof generation
│   ├── zk_circuit.py        # ZK-SNARK circuit (mock)
│   ├── deploy.py             # Contract deployment
│   └── merkle_tree.py        # Off-chain merkle tree
├── contracts/
│   └── starknet_shielded_pool_forge/
│       ├── src/lib.cairo    # Cairo contract
│       └── Scarb.toml       # Cairo project config
├── cairo/
│   └── zk_verifier/         # Solidity ZK contracts
│       ├── PedersenHash.sol
│       ├── MerkleTree.sol
│       ├── Groth16Verifier.sol
│       └── FullPrivacyPool.sol
├── ZK_SNARK_INTEGRATION.md  # Full ZK integration guide
├── FULL_ZK_PLAN.md          # Upgrade roadmap
└── COMPILE_STATUS.md        # Cairo compiler status
```

## Features

| Feature | Status | Description |
|---------|--------|-------------|
| Basic Pool | ✅ Working | Deposit, transfer, withdraw |
| ZK-SNARK | ✅ Mock/Ready | Circuit defined, snarkjs ready |
| Cairo Contract | ✅ Compiled | Scarb 2.8.1, needs 2.14.0+ for Garaga |
| Python Backend | ✅ Working | Commitment generation, proof mock |
| Solidity Contracts | ✅ Written | Pedersen, Merkle, Groth16, Pool |
| On-chain Deploy | ⏳ Pending | Requires wallet + Sepolia ETH |

## Commands

```bash
# Python CLI
python3 scripts/zk_proof_generator.py    # Run ZK demo
python3 scripts/cli.py demo              # Run pool demo
python3 scripts/deploy.py                # Deploy contract

# Cairo
~/.local/bin/scarb build               # Compile contract

# ZK-SNARK (requires snarkjs)
npm install -g snarkjs
snarkjs groth16 setup circuit.r1cs -p pk.key -v vk.key
snarkjs groth16 prove pk.key witness.json proof.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ZK PRIVACY POOL ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  OFF-CHAIN (Python):                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ Commitment    │  │ Merkle       │  │ ZK Proof Generator      │  │
│  │ Generator     │  │ Tree Builder │  │ (snarkjs + witnesses)   │  │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘  │
│                                                                       │
│  ON-CHAIN (Cairo/Solidity):                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ PrivacyPool   │  │ Pedersen     │  │ Groth16 Verifier        │  │
│  │ Contract      │  │ Hash         │  │ (ZK proof verification) │  │
│  │ - deposit()   │  │ - commit()   │  │ - verifyProof()         │  │
│  │ - withdraw()  │  │ - nullify()  │  │                         │  │
│  └──────────────┘  └──────────────┘  └─────────────────────────┘  │
│                                                                       │
│  FLOW:                                                               │
│  1. User generates commitment = H(amount, salt)                      │
│  2. User generates nullifier = H(secret)                             │
│  3. Contract stores commitment (Merkle tree)                         │
│  4. User generates ZK proof (snarkjs)                                │
│  5. Contract verifies proof + marks nullifier used                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Dependencies

| Component | Version | Status |
|-----------|---------|--------|
| Python | 3.14 | ✅ Working |
| Scarb | 2.8.1 → 2.14.0 | ⚠️ Need upgrade |
| Cairo | 2.8.0 → 2.12+ | ⚠️ Need upgrade |
| snarkjs | latest | ⏳ Install |
| Node.js | 18+ | ⏳ Install |

### Python 3.14 Limitation

**Garaga** (required for full ZK on Starknet) requires Python 3.10-3.12.

**Solutions:**
1. Use snarkjs directly (Node.js)
2. Use Docker with Python 3.10
3. Wait for Garaga Python 3.14 support

## Documentation

- [ZK-SNARK Integration](./ZK_SNARK_INTEGRATION.md) - Full ZK guide
- [Full ZK Plan](./FULL_ZK_PLAN.md) - Upgrade roadmap
- [Cairo Contract](./contracts/starknet_shielded_pool_forge/README.md)
- [Deployment Guide](./ZK_SNARK_INTEGRATION.md#deployment)

## Status: 🚧 IN PROGRESS

### Completed ✅
- [x] Cairo contract compiles (Scarb 2.8.1)
- [x] Solidity ZK contracts written
- [x] Python proof generator working
- [x] Merkle tree implementation
- [x] Pedersen hash implementation

### In Progress 🔄
- [ ] Upgrade Scarb to 2.14.0+
- [ ] Install snarkjs for real proofs
- [ ] Generate R1CS circuit
- [ ] Run trusted setup

### Pending ⏳
- [ ] Deploy to Starknet Sepolia
- [ ] Full ZK verification on-chain
- [ ] Security audit
- [ ] Production deployment

## License

MIT
