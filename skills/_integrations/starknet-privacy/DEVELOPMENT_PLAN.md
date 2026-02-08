# Starknet Privacy Pool - Development Plan

**Project:** Private transfers, Shielded pools, ZK payment channels  
**Status:** Scarb 2.14.0 ✓, Python 3.12 ✓  
**Created:** 2026-02-06

---

## 📋 What We've Already Built

| Component | Status | Notes |
|-----------|--------|-------|
| `ShieldedPool.cairo` | ⚠️ LegacyMap | Basic contract, needs 2.14.0 upgrade |
| `starknet_shielded_pool_forge/` | ⚠️ Cairo 2.8.0 | Compiles, deprecated patterns |
| `merkle_tree.py` | ⚠️ SHA256 | Pedersen simulated |
| `zk_circuit.py` | ⚠️ Stubs | ZK logic incomplete |
| `zk_proof_generator.py` | ⚠️ Stubs | Needs garaga integration |
| `shielded_pool.py` | ⚠️ Partial | SDK with TODO sections |
| `garaga_demo.py` | ✅ Working | Demonstrates garaga |
| `deploy.py` | ⚠️ Incomplete | No testnet account yet |
| ZK artifacts (`.r1cs`, `.zkey`) | ⚠️ Mock | Need real trusted setup |

---

## 🎯 Three Core Products

### 1. Private Transfers
- **Goal:** Send tokens without revealing sender/recipient/amount
- **Approach:** ZK-SNARK commitments + nullifiers
- **Timeline:** Phase 1 (2-3 weeks)

### 2. Shielded Pool  
- **Goal:** Zcash-style shielded pool for Starknet
- **Approach:** Merkle tree of commitments on-chain + off-chain proofs
- **Timeline:** Phase 1-2 (3-4 weeks)

### 3. ZK Payment Channel
- **Goal:** Private, instant P2P payments (Lightning-style)
- **Approach:** State channels with ZK validity proofs
- **Timeline:** Phase 2 (2-3 weeks)

---

## 🗓️ Development Roadmap

### PHASE 1: Foundation (Week 1-2)

#### Week 1: Cairo Contracts Upgrade

```
Day 1-2: Upgrade to Scarb 2.14.0 + Cairo 2.14.0
├── Migrate LegacyMap → Map
├── Add proper event emission
├── Implement deposit/spend/withdraw
└── Compile with scarb build

Day 3-4: ShieldedPool Core
├── Add commitment storage (Map<u256, u256>)
├── Add nullifier tracking (Map<u256, bool>)
├── Add Merkle root storage
└── Add admin functions

Day 5: Testing
├── Write unit tests
├── Test locally (starknet-devnet)
└── Fix compilation errors
```

**Deliverables:**
- ✅ `contracts/starknet_shielded_pool_forge/src/lib.cairo` (updated)
- ✅ Sierra + CASM compiled
- ✅ Unit tests passing

#### Week 2: ZK Integration

```
Day 1-2: Garaga Setup
├── Install garaga in Python 3.12 venv
├── Test Pedersen hash generation
└── Generate Pedersen circuit

Day 3-4: Merkle Tree
├── Replace SHA256 with real Pedersen
├── Implement incremental updates
├── Generate membership proofs
└── Test against on-chain root

Day 5: Commitment/Nullifier Logic
├── Implement commitment generation
├── Implement nullifier computation
├── Add encryption (AES or ChaCha20)
└── Test off-chain flow
```

**Deliverables:**
- ✅ Real Pedersen hash (not simulated)
- ✅ Working merkle_tree.py
- ✅ Commitment/nullifier generation

---

### PHASE 2: Shielded Pool (Week 3-4)

#### Week 3: On-Chain Contract

```
Day 1-2: Deposit Flow
├── deposit(commitment) external function
├── Store commitment in Merkle tree
├── Emit Deposit event
└── Return leaf index

Day 3-4: Spend Flow  
├── spend(nullifier, commitment, proof) external
├── Verify ZK proof on-chain
├── Check nullifier not spent
├── Update Merkle tree root
└── Emit Withdrawal event

Day 5: View Functions
├── get_merkle_root()
├── is_nullifier_used(nullifier)
├── get_balance(nullifier_hash)
└── get_note(nullifier_hash) - encrypted
```

**Deliverables:**
- ✅ Full deposit/spend/withdraw cycle
- ✅ ZK proof verification on-chain
- ✅ Event emission for off-chain scanning

#### Week 4: Off-Chain SDK

```
Day 1-2: Note Management
├── Note generation (commitment + secret)
├── Note encryption (AES-256-GCM)
├── Note decryption
└── Note storage (local encrypted DB)

Day 3-4: Proof Generation
├── Generate ZK witness
├── Generate Groth16 proof
├── Verify proof before submit
└── Handle proof verification failures

Day 5: Integration Tests
├── Test full deposit flow
├── Test full withdraw flow
├── Test edge cases
└── Performance benchmarking
```

**Deliverables:**
- ✅ shielded_pool.py SDK (complete)
- ✅ notes.py encryption
- ✅ zk_proof_generator.py (working)

---

### PHASE 3: ZK Payment Channel (Week 5-6)

#### Week 5: Channel Architecture

```
Day 1-2: Channel Contract
├── Channel state (open, close, dispute)
├── Balance storage (Map<user, amount>)
├── Channel ID generation
└── Deposit into channel

Day 3-4: State Updates
├── Generate state transition proof
├── Update balances with ZK proof
├── Handle dispute resolution
└── Timeout mechanisms

Day 5: Closing Mechanism
├── Cooperative close (both sign)
├── Unilateral close (one party)
├── Challenge period
└── Final settlement
```

**Deliverables:**
- ✅ PaymentChannel.cairo contract
- ✅ State proof verification
- ✅ Dispute resolution logic

#### Week 6: Channel Manager

```
Day 1-2: Channel Lifecycle
├── Open channel (deposit)
├── Request state update
├── Acknowledge state update
└── Close channel

Day 3-4: Multi-Hop Channels
├── HTLC-like atomic swaps
├── Route discovery
├── Multi-party channels
└── Cross-channel transfers

Day 5: Testing & Security
├── Fuzz testing
├── Security audit prep
├── Documentation
└── Testnet deployment
```

**Deliverables:**
- ✅ payment_channel.py SDK
- ✅ Multi-hop support
- ✅ Testnet deployment

---

## 📁 File Structure After Completion

```
starknet-privacy/
├── contracts/
│   ├── shielded_pool/
│   │   ├── src/
│   │   │   └── lib.cairo          # Main shielded pool (Cairo 2.14)
│   │   ├── Scarb.toml
│   │   └── target/                # Compiled artifacts
│   │       ├── shielded_pool_sierra.json
│   │       └── shielded_pool_casm.json
│   │
│   └── payment_channel/
│       ├── src/
│       │   └── lib.cairo          # ZK payment channel
│       ├── Scarb.toml
│       └── target/
│
├── scripts/
│   ├── shielded_pool.py           # Full SDK (PRIVATE)
│   ├── payment_channel.py         # Channel SDK (PRIVATE)
│   ├── notes.py                   # Note encryption/decryption
│   ├── merkle_tree.py             # Merkle tree with Pedersen
│   ├── zk_proof_generator.py     # ZK proof generation
│   ├── deploy.py                  # Testnet deployment
│   └── cli.py                    # Command-line interface
│
├── zk_circuits/
│   ├── pedersen_hash.cairo        # Pedersen circuit
│   ├── merkle_proof.cairo         # Merkle proof circuit
│   ├── payment_proof.cairo        # Payment channel circuit
│   ├── trusted_setup/             # Ceremony artifacts
│   │   ├── proving_key.json
│   │   └── verification_key.json
│   └── keys/                      # Key pairs
│
├── tests/
│   ├── test_shielded_pool.py      # Contract tests
│   ├── test_merkle_tree.py        # Tree tests
│   └── test_payment_channel.py    # Channel tests
│
├── SKILL.md
├── README.md
└── DEVELOPMENT_PLAN.md
```

---

## 🔧 Dependencies

| Component | Version | Status |
|-----------|---------|--------|
| Scarb | 2.14.0 | ✅ Ready |
| Cairo | 2.14.0 | ✅ Ready |
| Python | 3.12.3 | ✅ Ready |
| garaga | v1.0.1 | ⚠️ Need install |
| starknet.py | 0.12+ | ⚠️ Need install |
| snarkjs | latest | ⚠️ Need install |

---

## 🚀 Quick Start (When Ready)

```bash
# 1. Install dependencies
cd /home/wner/clawd/skills/_integrations/starknet-privacy
source garaga-venv/bin/activate
pip install starknet-py snarkjs

# 2. Compile contracts
cd contracts/shielded_pool
~/.local/bin/scarb build

# 3. Deploy to testnet
cd scripts
python3 deploy.py --network sepolia

# 4. Initialize shielded pool
python3 cli.py init --contract <address>

# 5. Make private transfer
python3 cli.py deposit --amount 100 --token 0x...
python3 cli.py transfer --to 0x... --amount 50
python3 cli.py withdraw --amount 25
```

---

## 📊 Time Estimate

| Phase | Duration | Total |
|-------|----------|-------|
| Phase 1: Foundation | 2 weeks | 80-100 hours |
| Phase 2: Shielded Pool | 2 weeks | 80-100 hours |
| Phase 3: Payment Channel | 2 weeks | 80-100 hours |
| **TOTAL** | **6 weeks** | **240-300 hours** |

---

## 🎯 Next Immediate Action

**Complete Phase 1 Week 1:**
1. Upgrade `starknet_shielded_pool_forge/src/lib.cairo` to Cairo 2.14.0
2. Replace `LegacyMap` with `Map`
3. Add proper event emission
4. Compile with `scarb build`
5. Verify Sierra + CASM output

**Start:** When dev-agent finishes or you approve

---

*Last updated: 2026-02-06*
*Plan based on prior work from Feb 3, 2026*
