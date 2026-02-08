# Full ZK Privacy Pool Implementation Plan

## Status
| Component | Current | Required |
|-----------|---------|----------|
| Scarb | 2.8.1 | 2.14.0+ |
| Cairo | 2.8.0 | 2.12+ |
| Garaga | Not installed | v1.0.1 |
| Python | 3.14 | 3.10-3.12 |

## Roadmap

### Phase 1: Upgrade Scarab to 2.14.0

```bash
# Check current version
scarb --version

# Download Scarb 2.14.0
curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh -s -- --version 2.14.0

# Verify
scarb --version
```

### Phase 2: Install Garaga

```bash
# Create venv with Python 3.10-3.12
python3.12 -m venv garaga-venv
source garaga-venv/bin/activate
pip install garaga

# Verify
garaga --help
```

### Phase 3: Generate Pedersen Hash Circuit

```bash
# Generate Pedersen hash verifier for BN254
garaga gen --curve bn254 --type pedersen_hash

# Output: Cairo contract with Pedersen operations
```

### Phase 4: Generate Groth16 Verifier

```bash
# Generate Groth16 verifier contract
garaga gen --curve bn254 --type groth16_verifier \
    --vk verification_key.json \
    --output contracts/

# Generates:
# - groth16_verifier.cairo
# - verifier_test.cairo
```

### Phase 5: Integrate with Privacy Pool

```
┌─────────────────────────────────────────────────────────┐
│                    FULL ZK STACK                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Cairo Contracts:                                        │
│  ├── shielded_pool.cairo (main)                         │
│  ├── pedersen_hash.cairo (hash commitment)              │
│  ├── groth16_verifier.cairo (ZK proof)                 │
│  └── merkle_tree.cairo (membership)                    │
│                                                         │
│  Off-chain (Python):                                    │
│  ├── circuit.py (Pedersen constraints)                  │
│  ├── prover.py (generate proofs)                        │
│  ├── witness.py (generate witness)                      │
│  └── keys.py (VK/PK management)                        │
│                                                         │
│  Setup:                                                 │
│  ├── trusted_setup (Groth16)                            │
│  ├── proving_key.json                                   │
│  ├── verification_key.json                              │
│  └── witness_gen.py                                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FULL ZK PRIVACY POOL                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  USER (off-chain):                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. Generate commitment:                              │  │
│  │    secret = random()                                │  │
│  │    salt = random()                                  │  │
│  │    commitment = PedersenHash(amount, salt)          │  │
│  │                                                         │  │
│  │ 2. Generate ZK witness:                              │  │
│  │    - path from commitment to root                    │  │
│  │    - nullifier = PedersenHash(secret, 0)             │  │
│  │    - proof = generate_proof(witness)                 │  │
│  │                                                         │  │
│  │ 3. Call contract:                                    │  │
│  │    spend(nullifier, proof, public_inputs)            │  │
│  └─────────────────────────────────────────────────────┘  │
│                            │                                │
│                            ▼                                │
│  SMART CONTRACT (on-chain):                                 │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 1. Verify Groth16 proof:                            │  │
│  │    groth16_verifier.verify(proof, vk, public)      │  │
│  │                                                         │  │
│  │ 2. Check nullifier not used:                        │  │
│  │    assert(!nullifiers[nullifier])                   │  │
│  │                                                         │  │
│  │ 3. Update state:                                    │  │
│  │    nullifiers[nullifier] = true                      │  │
│  │    emit Event { nullifier }                         │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### Task 1: Scarb Upgrade
- [ ] Download Scarb 2.14.0
- [ ] Update PATH
- [ ] Verify Cairo 2.12 compilation

### Task 2: Garaga Setup
- [ ] Create Python 3.12 venv
- [ ] Install garaga package
- [ ] Test garaga gen command

### Task 3: Pedersen Hash
- [ ] Generate Pedersen hash circuit
- [ ] Test hash computation
- [ ] Integrate with shielded pool

### Task 4: Groth16 Verifier
- [ ] Generate verifier contract
- [ ] Setup trusted ceremony (mock for testing)
- [ ] Generate test proving/verification keys

### Task 5: Full Integration
- [ ] Update shielded_pool.cairo
- [ ] Add ZK proof verification
- [ ] Test deposit/spend flow
- [ ] Deploy to testnet

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| scarab | 2.14.0 | Cairo package manager |
| cairo-lang | 2.12+ | Cairo compiler |
| garaga | v1.0.1 | ZK tooling |
| snarkjs | latest | Proof generation |
| python | 3.10-3.12 | Garaga backend |

## References

- Garaga: https://github.com/keep-starknet-strange/garaga
- Scarb: https://docs.swmansion.com/scarb/
- Groth16: https://eprint.iacr.org/2016/260
- Pedersen Hash: https://github.com/ethereum/research/tree/master/pedersen_hash
