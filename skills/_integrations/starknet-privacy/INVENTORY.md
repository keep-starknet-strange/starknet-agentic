# Starknet Privacy Pool - Complete File Inventory

**Project:** Private transfers, Shielded pools, ZK payment channels  
**Date:** 2026-02-06  
**Status:** Scarb 2.14.0 ✓, Python 3.12 ✓

---

## 📁 CONTRACT FILES (Cairo)

### `contracts/starknet_shielded_pool_forge/src/lib.cairo`
| Status | ✅ UPDATED - Cairo 2.14.0 |
|--------|---------------------------|
| **Modern Map** | ✅ `Map<felt252, felt252>` (not LegacyMap) |
| **Events** | ✅ `#[event]` system with Deposited, Spent, MerkleRootUpdated |
| **Pedersen** | ✅ `core::pedersen::PedersenTrait` |
| **Storage** | ✅ merkle_root, next_index, nullifier_used, notes, owner |
| **Functions** | ✅ constructor, deposit, spend, set_merkle_root, views |
| **Views** | ✅ is_nullifier_used, get_merkle_root, get_next_index, get_owner, is_commitment_valid |
| **Comments** | Pedersen hash helpers (compute_commitment, compute_nullifier) |

**To Do:**
- [ ] Add `#[generate_trait]` for function impls
- [ ] Add reentrancy guards
- [ ] Add access control for `spend` (currently anyone can spend!)

---

### `contracts/starknet_shielded_pool/src/lib.cairo`
| Status | ⚠️ EXISTS - Not reviewed |
|--------|--------------------------|
| **File** | contracts/starknet_shielded_pool/src/lib.cairo |
| **Target** | target/dev/starknet_shielded_pool.sierra.json |

**To Do:**
- [ ] Review and compare with forge version
- [ ] Decide which to keep

---

### `contracts/ShieldedPool.cairo`
| Status | ⚠️ LEGACY - Cairo 2.0 patterns |
|--------|-------------------------------|
| **Age** | Original from Jan 31 |
| **Pattern** | Uses deprecated LegacyMap |
| **Usage** | Reference / deprecated |

**Action:** Archive or delete - not needed for production

---

### `contracts/starknet_shielded_pool/src/interface.cairo`
| Status | ✅ Extracted interface |
|--------|----------------------|
| **Purpose** | Interface definition |

---

## 📁 SCRIPTS (Python)

### `scripts/cli.py` (10.6 KB)
| Status | ⚠️ PARTIAL |
|--------|------------|
| **Main functions** | deploy, call, invoke, multicall |
| **Commands** | All print TODO notes, not implemented |
| **STUBS** | deploy(), call(), invoke() - just print messages |

**Missing:**
- [ ] Implement `deploy()` - real starknet.py deployment
- [ ] Implement `call()` - read contract state
- [ ] Implement `invoke()` - write to contracts
- [ ] Implement `multicall()` - batch calls

---

### `scripts/shielded_pool.py` (15.9 KB)
| Status | ⚠️ NEEDS PEDERSEN |
|--------|-------------------|
| **Classes** | ShieldedPool, InsufficientBalanceError, NoteNotFoundError, NoteAlreadySpentError, InvalidSecretError |
| **Methods** | deposit(), create_transfer(), withdraw(), get_balance(), verify_integrity(), export_state(), import_state() |
| **Pedersen** | ❌ Uses SHA256 via hashlib (line ~50, ~150) |
| **Encryption** | ✅ cryptography.fernet (Fernet) |
| **Merkle** | Uses NoteMerkleTree from notes.py |

**TODO:**
- [ ] Replace SHA256 with real Pedersen from garaga
- [ ] Integrate with garaga_integration.py
- [ ] Add ZK proof generation hook
- [ ] Add on-chain sync (publish commitment to contract)

---

### `scripts/merkle_tree.py` (6.4 KB)
| Status | ⚠️ SIMULATED PEDERSEN |
|--------|----------------------|
| **Classes** | MerkleProof, NoteMerkleTree |
| **Methods** | insert(), get_proof(), get_root(), verify_proof() |
| **Hash** | ❌ SHA256-based (line 44: `hashlib.sha256`) |

**TODO:**
- [ ] Replace SHA256 with garaga Pedersen
- [ ] Add incremental tree updates
- [ ] Batch insert support
- [ ] Compress proof size

---

### `scripts/zk_proof_generator.py` (9.5 KB)
| Status | ⚠️ MOCK IMPLEMENTATION |
|--------|------------------------|
| **Classes** | ZKProof, Commitment, ZKPrivacyPool |
| **Methods** | setup(), generate_commitment(), create_proof(), verify_proof(), export_calldata(), _pedersen_hash(), generate_witness() |
| **snarkjs** | ❌ Calls snarkjs CLI (not implemented) |
| **Real ZK** | ❌ All proofs are mock data |

**TODO:**
- [ ] Install snarkjs and test
- [ ] Create proper R1CS circuit
- [ ] Run real trusted setup
- [ ] Generate real proving/verification keys
- [ ] Implement garaga-based proof generation

---

### `scripts/zk_snarkjs_workflow.py` (9.3 KB)
| Status | ⚠️ WORKFLOW ONLY |
|--------|------------------|
| **Purpose** | Documents snarkjs workflow |
| **Implementation** | Not connected to other scripts |

**TODO:**
- [ ] Integrate into zk_proof_generator.py
- [ ] Create circuit compilation script
- [ ] Add trusted setup automation

---

### `scripts/zk_circuit.py` (10.3 KB)
| Status | ⚠️ STUBS |
|--------|----------|
| **Purpose** | ZK circuit definitions |
| **Implementation** | TODO comments, not working |

**TODO:**
- [ ] Define R1CS constraints for privacy pool
- [ ] Implement commitment circuit
- [ ] Implement merkle proof circuit
- [ ] Implement nullifier circuit

---

### `scripts/garaga_integration.py` (6.9 KB)
| Status | ⚠️ PARTIAL |
|--------|-----------|
| **Purpose** | garaga library integration |
| **Features** | Pedersen hash, hash_to_curve, vector operations |
| **Tests** | Has test methods (test_pedersen_hash, etc.) |
| **Python** | Uses Python 3.14 syntax (walrus operator issues) |

**TODO:**
- [ ] Fix Python 3.12 compatibility
- [ ] Add full garaga installation script
- [ ] Integrate with shielded_pool.py
- [ ] Test Pedersen hash matches on-chain

---

### `scripts/garaga_demo.py` (5.3 KB)
| Status | ✅ WORKING DEMO |
|--------|-----------------|
| **Purpose** | Demonstrates garaga capabilities |
| **Content** | Shows hash_to_curve, Pedersen, vector ops |
| **Status** | Reference / demo only |

---

### `scripts/notes.py` (8.2 KB)
| Status | ✅ FUNCTIONAL |
|--------|---------------|
| **Classes** | ConfidentialNote, NoteMerkleTree, MerkleProof |
| **Methods** | create(), to_dict(), from_dict(), encrypt(), decrypt() |
| **Encryption** | ✅ cryptography.fernet (AES-128) |
| **Hash** | ❌ SHA256 (should be Pedersen) |

**TODO:**
- [ ] Replace SHA256 with garaga Pedersen
- [ ] Add note encryption key derivation
- [ ] Support multiple token types

---

### `scripts/deploy.py` (3.2 KB)
| Status | ⚠️ STUB - No testnet account |
|--------|------------------------------|
| **Functions** | deploy_contract(), main() |
| **Status** | Just imports, no actual deployment |

**TODO:**
- [ ] Add starknet.py Account setup
- [ ] Add RPC connection (STARKNET_RPC_URL)
- [ ] Add contract deployment (declare + deploy)
- [ ] Add fee estimation
- [ ] Add multi-step deployment (shielded pool + token)

---

### `scripts/sdk.py` (14.3 KB)
| Status | ⚠️ PARTIAL |
|--------|------------|
| **Purpose** | High-level SDK for shielded pool |
| **Classes** | PrivacySDK, ShieldedPoolContract, AccountManager |
| **Implementation** | Has structure, many TODO sections |

**TODO:**
- [ ] Complete AccountManager with starknet.py
- [ ] Implement ShieldedPoolContract with real calls
- [ ] Add PrivacySDK methods
- [ ] Connect to on-chain contract

---

### `scripts/main.py` (1.9 KB)
| Status | ✅ Simple entry point |
|--------|----------------------|
| **Purpose** | CLI entry point |
| **Usage** | python scripts/main.py |

---

### `scripts/download_ptau.py` (3.3 KB)
| Status | ✅ UTILITY |
|--------|-----------|
| **Purpose** | Downloads ptau for trusted setup |
| **Usage** | For ZK ceremony |

---

### `scripts/compute_class_hash.py` (4.0 KB)
| Status | ✅ UTILITY |
|--------|-----------|
| **Purpose** | Compute contract class hash |
| **Usage** | For deployment verification |

---

### `scripts/get_class_hash.py` (2.0 KB)
| Status | ✅ UTILITY |
|--------|-----------|
| **Purpose** | Get class hash from compiled contract |

---

## 📁 ZK CIRCUITS

### `zk_circuits/` (circom-based)
| Status | ⚠️ EXPERIMENTAL |
|--------|-----------------|
| **Files** | privacy_pool_input.json, privacy_pool_proof.json, privacy_pool_vk.json |
| **Circuit** | Not fully defined |
| **Framework** | circomlib (Node.js) |

**TODO:**
- [ ] Define complete R1CS constraints
- [ ] Test circuit compilation
- [ ] Generate real proving key
- [ ] Integrate with snarkjs workflow

---

### `zk_demo/` (Example ZK)
| Status | ✅ REFERENCE |
|--------|--------------|
| **Files** | circuit.r1cs, proof.json, verification_key.json, witness.wtns.json |
| **Purpose** | Example working ZK setup |
| **Origin** | From garaga demos |

---

## 📁 TEST FILES

### `contracts/starknet_shielded_pool/tests/shielded_pool_test.cairo`
| Status | ⚠️ EXISTS |
|--------|-----------|
| **Purpose** | Unit tests for contract |
| **Coverage** | Not verified |

**TODO:**
- [ ] Run tests with `scarb test`
- [ ] Add more test cases
- [ ] Test edge cases

---

### `test_scarb/src/lib.cairo`
| Status | ⚠️ SANDBOX |
|--------|-----------|
| **Purpose** | Scratchpad for testing |
| **Usage** | For experimenting |

---

## 📁 CONFIGURATION

### `contracts/starknet_shielded_pool_forge/Scarb.toml`
| Status | ✅ Cairo 2.14.0 |
|--------|----------------|
| **Version** | starknet = ">=2.0.0" (needs update to 2.14.0) |

**TODO:**
- [ ] Update to `starknet = "2.14.0"`
- [ ] Add dependencies

---

### `contracts/starknet_shielded_pool/Scarb.toml`
| Status | ⚠️ Check version |
|--------|------------------|

---

## 📁 DOCUMENTATION

| File | Status | Notes |
|------|--------|-------|
| SKILL.md | ✅ OpenClaw skill definition |
| README.md | ✅ Overview |
| DEVELOPMENT_PLAN.md | ✅ Master plan |
| IMPLEMENTATION_STATUS.md | ⚠️ Outdated (Feb 3) |
| ZK_SNARK_INTEGRATION.md | ✅ ZK architecture |
| FULL_ZK_PLAN.md | ✅ Complete plan |
| REAL_ZK_SETUP.md | ✅ garaga setup guide |
| COMPILE_STATUS.md | ✅ Compilation notes |
| DEPLOY.md | ✅ Deployment guide |
| RESEARCH.md | ✅ Research notes |

---

## 📊 SUMMARY

| Category | Files | Done | Todo |
|----------|-------|------|------|
| Cairo Contracts | 5 | 1 | 4 |
| Python Scripts | 15 | 4 | 11 |
| ZK Circuits | 10+ | 2 | 8 |
| Tests | 2+ | 0 | 2 |
| Documentation | 10 | 8 | 2 |

---

## 🎯 PRIORITY ORDER (What to fix first)

### 1. CRITICAL (Blocks testnet)
1. `scripts/shielded_pool.py` - Replace SHA256 with garaga Pedersen
2. `scripts/zk_proof_generator.py` - Implement real ZK proof generation
3. `scripts/deploy.py` - Add starknet.py deployment

### 2. HIGH (Needed for ZK)
1. `scripts/merkle_tree.py` - Replace SHA256 with garaga Pedersen
2. `scripts/notes.py` - Replace SHA256 with garaga Pedersen
3. `scripts/zk_circuit.py` - Define complete R1CS

### 3. MEDIUM (SDK completeness)
1. `scripts/cli.py` - Implement all commands
2. `scripts/sdk.py` - Complete SDK methods
3. `scripts/garaga_integration.py` - Fix Python 3.12 compatibility

### 4. LOW (Cleanup)
1. Archive `contracts/ShieldedPool.cairo` (legacy)
2. Write tests for all contracts
3. Create circuit compilation scripts

---

## 🧪 LOCAL TESTING (Without testnet)

### Test 1: Cairo compilation
```bash
cd contracts/starknet_shielded_pool_forge
~/.local/bin/scarb build
# Verify: ls target/release/*.json
```

### Test 2: Python garaga
```bash
source garaga-venv/bin/activate
python scripts/garaga_demo.py
```

### Test 3: Shielded pool simulation
```bash
python scripts/shielded_pool.py
# Check: Uses SHA256 (will fail with real contract)
```

### Test 4: Merkle tree
```bash
python scripts/notes.py
# Test note creation + merkle proof
```

---

*Last updated: 2026-02-06*
