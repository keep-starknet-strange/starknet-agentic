# Privacy Pool Development Plan

## Current Status
- ✅ Cairo contract: ShieldedPool.cairo (compiles)
- ⚠️ ZK Circuit: privacy_pool_full.circom (demo, uses + instead of Pedersen)
- ❌ Python implementation: Mock Pedersen hash
- ❌ No tests
- ❌ No Garaga integration (Python 3.14 incompatibility)

## Phase 1: Fix Python Environment

### Task 1.1: Create Python 3.12 Environment for Garaga
```bash
cd /home/wner/clawd/skills/_integrations/starknet-privacy
python3.12 -m venv garaga-venv-real
source garaga-venv-real/bin/activate
pip install garaga==0.18.2 starknet.py==0.22.0
```

### Task 1.2: Verify Garaga Installation
```python
# Test script
python3 -c "from garaga.pedersen import pedersen_hash; print('Garaga OK')"
```

## Phase 2: ZK Circuit Improvements

### Task 2.1: Update Circom Circuit with Real Pedersen
- Use `circomlib` Pedersen hash
- Add range proof (amount > 0)
- Proper Merkle tree verification

### Task 2.2: Generate Real Proving Keys
```bash
cd zk_circuits
circom privacy_pool_full.circom --r1cs --wasm --output .
snarkjs groth16 setup privacy_pool_full.r1cs pot12_0000.ptau circuit_0000.zkey
snarkjs zkey beacon circuit_0000.zkey circuit_final.zkey 1 12345
```

### Task 2.3: Generate Real Proofs
```bash
snarkjs wc -w privacy_pool_full_js/witness.json < input.json
snarkjs groth16 prove circuit_final.zkey witness.wtns.json proof.json public.json
```

## Phase 3: Python Implementation

### Task 3.1: Commitment Generator (scripts/commitment.py)
```python
from garaga.pedersen import pedersen_hash

def generate_commitment(amount: int, salt: int) -> int:
    return pedersen_hash(amount, salt)

def generate_nullifier(commitment: int, secret: int) -> int:
    return pedersen_hash(commitment, secret)
```

### Task 3.2: Merkle Tree (scripts/merkle_tree.py)
- Use garaga.pedersen for hashing
- Sparse Merkle tree implementation
- Membership proof generation

### Task 3.3: ZK Proof Generator (scripts/zk_proof_generator.py)
- Generate witness from inputs
- Use snarkjs CLI for proof generation
- Verify proofs before returning

## Phase 4: Testing

### Task 4.1: Unit Tests
```
tests/
├── test_commitment.py      # Test commitment generation
├── test_merkle.py          # Test Merkle tree operations
├── test_zk_proof.py        # Test proof generation/verification
└── test_integration.py     # End-to-end test
```

### Task 4.2: Run Tests
```bash
source garaga-venv-real/bin/activate
pytest tests/ -v --cov
```

## Phase 5: Integration with Starknet-Agentic

### Task 5.1: Create Node.js Scripts (like other skills)
```
skills/starknet-privacy/
├── SKILL.md
├── scripts/
│   ├── create-commitment.js
│   ├── generate-proof.js
│   ├── verify-proof.js
│   └── shielded-pool.js
├── README.md
└── package.json
```

### Task 5.2: Update SKILL.md
- Add usage examples
- Document prerequisites
- Add CLI reference

## Deliverables

1. **Working ZK proof generation** with real Pedersen hash
2. **Unit tests** with 80%+ coverage
3. **Node.js scripts** for starknet-agentic integration
4. **Updated SKILL.md** with documentation

## Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Python Environment | 30 min | ⏳ Pending |
| Phase 2: ZK Circuit | 1 hour | ⏳ Pending |
| Phase 3: Python Implementation | 2 hours | ⏳ Pending |
| Phase 4: Testing | 1 hour | ⏳ Pending |
| Phase 5: Integration | 1 hour | ⏳ Pending |

**Total: ~6 hours**

## Next Steps

1. Start with Phase 1: Set up Python 3.12 + Garaga
2. Verify garaga.pedersen works
3. Move to Phase 2: Update Circom circuit
4. Continue with remaining phases
