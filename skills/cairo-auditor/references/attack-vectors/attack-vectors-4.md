# Cairo Attack Vectors (4/4): Storage + Components + Trust Chains

**61. Constructor dead parameter**
- **D:** constructor accepts security-critical parameter but never uses it (ForgeYields redeem request pattern).
- **FP:** parameter is explicitly deprecated/compat-only and cannot affect privilege/invariants.

**62. Map-zero default confusion**
- **D:** zero default map entry is treated as initialized/authorized state.
- **FP:** explicit existence flag or non-zero sentinel separates unset from set.

**63. Stale storage after burn/revoke**
- **D:** post-burn/revoke mappings remain active where logic assumes deletion.
- **FP:** retention is intentional and read paths are gated accordingly.

**64. Cross-contract role dependency break**
- **D:** auth depends on mutable external contract state that can desync or be upgraded unexpectedly.
- **FP:** dependency immutable or validated with integrity checks.

**65. External decoder/sanitizer trust assumption**
- **D:** proof/policy validation relies on external decoder contract without integrity pinning.
- **FP:** decoder identity pinned and governed with fail-safe fallback.

**66. Immutable dependency without recovery path**
- **D:** critical dispatcher/dependency set once and not recoverable after failure.
- **FP:** immutable-by-design and explicitly covered by ops runbook/threat model.

**67. Registry hash/domain mismatch**
- **D:** hashed keys/signatures omit domain separator or key-length semantics.
- **FP:** domain-separated and length-aware hashing.

**68. Nonce monotonicity gap across transitions**
- **D:** nonce not incremented on unset/reset transitions, enabling stale signature replay.
- **FP:** nonce increments on every transition that invalidates signed intent.

**69. Event visibility gap for bulk revocation**
- **D:** bulk state updates omit per-item events needed by indexers.
- **FP:** per-item event emission or equivalent query-safe indexing contract.

**70. Upgrade audit trail loss**
- **D:** upgrade/change event omits prior class hash/identifier.
- **FP:** old and new identifiers emitted atomically.

**71. Initialization branch deadlock**
- **D:** constructor config can permanently disable required init branch.
- **FP:** constructor validates branch preconditions or exposes safe alternate init.

**72. Over-broad registry persistence**
- **D:** helper registry accepts arbitrary writes enabling spam/indexer DoS.
- **FP:** bounded writes, scoped permissions, or explicit pagination caps.

**73. Nonce domain collision across action types**
- **D:** same nonce key reused for distinct actions (set/unset/upgrade) enabling cross-action replay.
- **FP:** nonce scope includes action domain and contract context.

**74. Storage key composition collision**
- **D:** composite storage keys omit one discriminator and collide across logical records.
- **FP:** full key tuple encoded in storage address/hash derivation.

**75. Merkle/root history overwrite without uniqueness check**
- **D:** root history accepts repeated/invalid replacement that weakens finality assumptions.
- **FP:** root insertion enforces expected progression and duplicate handling rules.

**76. Proof verifier address mutability without governance delay**
- **D:** verifier endpoint mutable via immediate admin call, enabling sudden trust shift.
- **FP:** verifier changes timelocked and event-auditable.

**77. ABI variant fallback masks integration breakage**
- **D:** integration tries multiple ABI variants and proceeds on partial decode assumptions.
- **FP:** one canonical ABI and strict decode failure handling.

**78. Pending-owner/admin stale state leak**
- **D:** ownership transfer leaves stale pending/old authority state that still influences checks.
- **FP:** old pending authority cleared on transfer completion.

**79. Wrong event payload branch**
- **D:** event emits mismatched payload (for example claim payload in refund path), causing off-chain accounting to overcount due to stale accumulator state.
- **FP:** event payload strictly tied to executed branch and tested.

**80. Unbounded user-controlled iteration**
- **D:** loops over user-controlled array/span without bound checks can DoS execution.
- **FP:** explicit max bounds and fail-fast checks enforce bounded work.

**111. Component storage namespace overlap**
- **D:** Cairo component composition assigns overlapping component storage base/namespace, so writes in one component corrupt another.
- **FP:** component storage namespaces are uniquely derived at composition time and collision-tested across all embedded components.

**112. Derived storage key missing discriminator**
- **D:** application-level derived key generation (for example via `storage_address_from_base`) omits record/action discriminator and aliases unrelated records.
- **FP:** derived key includes full logical tuple (domain + action + actor + nonce/id) and is invariant-tested for alias resistance.

**113. Class-hash registry downgrade without monotonicity**
- **D:** registry accepts class hash replacement without version/epoch monotonicity checks.
- **FP:** upgrades enforce monotonic versioning and downgrade policy.

**114. Revocation leaves active authorization residue**
- **D:** revocation clears primary role map but leaves secondary authorization surface (cache/root/session capability) still accepted by auth checks.
- **FP:** revoke flow invalidates every authorization surface (role map + capability cache/root/session state) consumed by runtime checks.

**115. Queue/index wraparound overwrite**
- **D:** bounded index/counter wraps and overwrites pending operation state.
- **FP:** queue/index arithmetic enforces monotonic non-overwrite behavior.

**116. Hash preimage ambiguity in composite keys**
- **D:** composite key hashing mixes heterogeneous field encodings (felt packing/spans/byte arrays) without canonical boundaries, creating preimage aliasing.
- **FP:** composite keys use canonical encoding with explicit domain/version separators and deterministic field boundaries.

**117. Signature domain omits chain or contract binding**
- **D:** signature domain binds action/nonce but omits Starknet chain-id or verifier/account contract binding, enabling cross-deployment replay.
- **FP:** signature domain explicitly binds chain-id, verifying contract/account context, action, and nonce.

**118. Upgrade migration not idempotent**
- **D:** migration step can be re-run and mutates state inconsistently on repeat execution.
- **FP:** migration guarded by version bit and repeat-safe behavior.

**119. Trusted relayer set mutation lacks auditability**
- **D:** relayer/trusted-actor mutation occurs without event trail or immutable checkpoint.
- **FP:** mutation emits complete audit event and is recoverable/observable.

**120. Cross-module invariant gap after dependency swap**
- **D:** dependency swap updates pointer successfully but does not revalidate post-swap invariants across tightly-coupled modules, leaving inconsistent cross-module state.
- **FP:** swap path performs explicit post-swap invariant revalidation across coupled modules and aborts on inconsistency.

**157. Storage key collision via duplicate token or pool identifiers**
- **D:** adding a pool/token with the same identifier (address, denomination) overwrites the existing mapping entry silently, corrupting prior state.
- **FP:** registration path checks for existing entry and reverts or uses unique composite key.

**158. Dynamic felt252 array storage with incorrect size tracking**
- **D:** `StoreFelt252Array` or manual array storage writes elements but stores incorrect length, causing reads to return truncated or out-of-bounds data.
- **FP:** array length updated atomically with element writes and validated on read.

**159. ByteArray/felt encoding accepts malformed input without validation**
- **D:** `ByteArray` or raw felt spans are accepted from external input without validating canonical encoding (non-canonical `bytes31` padding, declared-length mismatch, oversized chunk values), causing downstream decode failures.
- **FP:** input validation at the boundary rejects malformed ByteArray/felt encoding before storage or processing.

**160. Array element removal leaves stale reference or index gap**
- **D:** removing element from storage array (swap-and-pop or shift) does not update all secondary indices/references, leaving stale pointers (e.g., lock ID array after unlock).
- **FP:** removal atomically updates all dependent indices and validates consistency.

**161. State counter not updated in secondary function path**
- **D:** primary function updates a state counter (e.g., `notesCount`, `totalDeposits`) but secondary function that also modifies the underlying data skips the counter update.
- **FP:** all mutation paths update the shared counter, enforced by shared internal helper.

**162. Fiat-Shamir challenge omits public input binding in proof composition**
- **D:** challenge derivation in zero-knowledge proof composition omits critical public inputs (bit proofs, commitments, statement components), allowing proof forgery via input substitution.
- **FP:** challenge hash includes all public inputs, statement components, and proof-stream commitments per protocol specification.

**163. Signature replay via omitted nonce or commitment binding**
- **D:** signed payload (encrypted notes, transfer authorization) does not bind to a unique nonce or commitment, allowing the same signature to authorize multiple distinct operations.
- **FP:** signature domain includes monotonic nonce, unique commitment hash, and operation-specific context.

**164. Multisig or aggregation ISM allows duplicate signatures**
- **D:** multi-signature verification (ISM, multisig wallet) counts duplicate signatures from the same signer toward the threshold, allowing single signer to reach quorum.
- **FP:** verification deduplicates signers before counting, or enforces strictly ascending signer order.

**165. Repeated state update overwrites pending timestamp or deadline**
- **D:** calling the same state-update function again (e.g., `start_cancellation`, `start_withdrawal`) overwrites the original timestamp, resetting or extending the waiting period.
- **FP:** repeated call blocked while pending, or first timestamp is immutable until completion/expiry.

**166. Non-reverting failure path lacks durable failure signal**
- **D:** operation records a non-reverting failure state (for example status flag/partial retry state) but emits no event or durable queryable marker, leaving off-chain systems blind.
- **FP:** non-reverting terminal outcomes emit explicit failure events or write a queryable failure-state record.

**167. Cross-function state inconsistency via unsynchronized counters**
- **D:** two functions read/write the same logical counter (e.g., `notesCount`) but one uses stale or differently-scoped state, producing inconsistent results across queries.
- **FP:** shared counter accessed through single internal getter/setter with consistent scope.

**168. Proof or commitment reuse across distinct protocol actions**
- **D:** zero-knowledge proof, encrypted note, or commitment valid for one action (deposit) can be replayed for a different action (withdrawal) because the action type is not bound in the proof domain.
- **FP:** proof/commitment domain explicitly includes action discriminator preventing cross-action replay.

**169. ContractAddress/felt252 narrowing mismatch for 32-byte external identifiers**
- **D:** cross-chain or interop path receives a 32-byte identifier and narrows it into `ContractAddress` (`[0, 2**251)`) or `felt252` (`< P`, where `P = 2**251 + 17*2**192 + 1`) via unchecked truncation/modular reduction, causing collisions or invalid mappings.
- **FP:** external identifiers remain in explicit 256-bit storage (`u256`/byte array) and boundary conversions into `ContractAddress`/`felt252` are explicit, range-checked, and fail-fast.

**170. Aggregation element-count truncation via unsafe narrow/wrapping conversion**
- **D:** aggregation module narrows validator/message count into small integer (`u8`) via wrapping/unchecked conversion; counts above boundary are truncated and quorum checks mis-evaluate.
- **FP:** count stays in sufficiently large type (`u32`/`u64`) or narrowing is guarded by explicit upper-bound assertion with fail-fast revert.
