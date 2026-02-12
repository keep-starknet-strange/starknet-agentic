# ZK Privacy Pool - Scripts

This directory contains Python scripts for ZK proof generation and privacy pool operations.

## Scripts

| Script | Description |
|--------|-------------|
| `zk_prover.py` | Main ZK proof generator using snarkjs |
| `cli.py` | Command-line interface for pool operations |
| `deploy.py` | Deploy privacy pool contract to Starknet |
| `merkle_tree.py` | Off-chain Merkle tree operations |
| `deploy_python312.sh` | Deployment script for Python 3.12 |
| `setup-circuits.sh` | Circuit compilation script |
| `generate-proof.sh` | Proof generation wrapper |

## Quick Start

### 1. Generate Proof

```bash
python3 scripts/zk_prover.py
```

This will:
1. Compile the Circom circuit
2. Run trusted setup
3. Generate witness from template
4. Create Groth16 proof
5. Verify the proof

### 2. CLI Usage

```bash
# Deposit
python3 scripts/cli.py deposit --amount 100 --salt 0x...

# Withdraw
python3 scripts/cli.py withdraw --amount 100 --proof proof.json

# Generate merkle proof
python3 scripts/cli.py merkle --leaf 0x...
```

### 3. Deploy Contract

```bash
# Set environment
export STARKNET_RPC_URL="https://starknet-sepolia.public.blastapi.io/v2/rpc/v0.6"
export PRIVATE_KEY="0x..."

# Deploy
python3 scripts/deploy.py --network sepolia
```

## Requirements

### System Dependencies

```bash
# Circom (for circuit compilation)
curl https://docs.circom.io/downloads/downloCircom.sh | bash

# snarkjs (for ZK proofs)
npm install -g snarkjs

# Node.js 18+
nvm install 18
```

### Python Dependencies

```bash
pip install -r requirements.txt
```

## ZK Prover Usage

```python
from scripts.zk_prover import ZKPrivacyPool

# Initialize
pool = ZKPrivacyPool(circuit_dir="./zk_circuits")

# Compile circuit
pool.compile_circuit("privacy_pool")

# Trusted setup
proving_key, verification_key = pool.trusted_setup("privacy_pool")

# Generate witness
input_data = {
    "nullifierPublic": 1234567890,
    "merkleRootPublic": 9876543210,
    "amountPublic": 100,
    "salt": 1111111111,
    "nullifierSecret": 2222222222,
    "merklePath": [...],  # 32 elements
    "merkleIndices": [...]  # 32 elements (0 or 1)
}
witness = pool.generate_witness(input_data, "privacy_pool")

# Generate proof
proof = pool.generate_proof(witness, proving_key, "privacy_pool")

# Verify
valid = pool.verify_proof(proof, verification_key)

# Export calldata for Starknet
calldata = pool.export_calldata(proof)
```

## Circuit Input Format

```json
{
  "nullifierPublic": 1234567890,
  "merkleRootPublic": 9876543210,
  "amountPublic": 100,
  "salt": 1111111111,
  "nullifierSecret": 2222222222,
  "merklePath": [0, 0, 0, ...],
  "merkleIndices": [0, 1, 0, 1, ...]
}
```

## Troubleshooting

### "circom: command not found"
Install Circom: `curl https://docs.circom.io/downloads/downloCircom.sh | bash`

### "npx: snarkjs: command not found"
Install snarkjs: `npm install -g snarkjs`

### "Node version too old"
Use Node.js 18+: `nvm install 18 && nvm use 18`

## Examples

See `zk_prover.py` for complete example with async main.
