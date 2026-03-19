# Cairo Attack Vectors (2/4): External Calls + Reentrancy + Messaging

> **D:** Detection pattern — what makes this vector dangerous.
> **FP:** False-positive caveat — when this pattern is actually safe.

**21. CEI violation on ERC1155 transfer path**
- **D:** state mutation happens after `safe_transfer_from` (directly or through helper chain).
- **FP:** critical state committed before interaction or robust non-reentrant guard blocks re-entry.

**22. Session self-call hazard**
- **D:** session execution loop permits calls to account contract itself.
- **FP:** explicit self-target block plus policy constraints prevent self-call.

**23. Selector fallback assumption**
- **D:** on syscall error, logic retries alternate selector and masks root failure.
- **FP:** single canonical selector with fail-fast behavior.

**24. Untrusted callback caller**
- **D:** callback handler mutates state without validating caller contract identity.
- **FP:** callback explicitly pinned to expected contract address.

**25. External call proxy without target constraints**
- **D:** privileged function forwards arbitrary `call_contract_syscall` target/selector/calldata.
- **FP:** strict allowlist, Merkle policy verification, or immutable target set.

**26. Cross-function reentrancy window**
- **D:** helper performs interaction; parent updates critical state after helper returns.
- **FP:** shared lock or state update-before-interaction across entire call chain.

**27. Transfer consistency mismatch**
- **D:** one transfer primitive disabled while equivalent primitive remains enabled (ForgeYields redeem NFT pattern).
- **FP:** mismatch is intentional and protected by additional invariants.

**28. Caller-controlled reward contract invocation**
- **D:** harvest/claim path takes arbitrary reward contract and invokes it.
- **FP:** caller and reward contract are both tightly policy-constrained.

**29. L1/L2 message replay gap**
- **D:** consumed message nonce/hash not tracked, allowing repeated processing.
- **FP:** replay set keyed by unique message hash and nonce.

**30. Callback state confusion with stale flags**
- **D:** callback logic depends on flags written only after interaction.
- **FP:** callback preconditions are finalized before external call.

**31. Fee-transfer call result ignored**
- **D:** transfer return value ignored and state progresses as if payment succeeded.
- **FP:** transfer failure reverts before state transition.

**32. External denial path swallowed**
- **D:** external call failures are caught/logged but execution continues into state writes.
- **FP:** denial path reverts or compensates with full rollback.

**33. ERC721 callback reentrancy on order fill**
- **D:** `transfer_from`/`safe_transfer_from` to callback-capable recipient happens before order status commit.
- **FP:** order status or nonce invariant prevents same-order reentry before callback.

**34. Fee-on-transfer token accounting drift**
- **D:** logic assumes nominal transfer amount equals received amount on external token call.
- **FP:** post-transfer balance delta is used for accounting.

**35. Message cancellation timestamp overwrite**
- **D:** repeated cancellation start overwrites prior timestamp and weakens timeout assumptions.
- **FP:** first cancellation timestamp is immutable or monotonic.

**36. Cross-domain origin verification missing**
- **D:** L1/L2 handler validates payload but not expected sender/domain binding.
- **FP:** explicit sender/domain hash verification in message path.

**37. Library-call target controlled by user input**
- **D:** `library_call`/dispatcher target derives from user-controlled path without allowlist.
- **FP:** target selector pair pinned to immutable registry.

**38. External decoder response schema trust**
- **D:** external decoder/sanitizer output is accepted without shape/value validation.
- **FP:** strict schema and bounds checks on returned payload.

**39. Cross-contract call succeeds with wrong selector casing fallback**
- **D:** retrying camelCase/snake_case on failure accidentally invokes unintended function.
- **FP:** explicit ABI mapping known at compile-time with no runtime selector fallback.

**40. Event emission before interaction finality**
- **D:** event logs success before external call outcome is known, confusing off-chain automation.
- **FP:** success events emitted only after all critical interactions and writes succeed.

**91. L1 handler replay by weak message keying**
- **D:** L1 handler marks processed messages with incomplete key material (missing nonce/sender/value domain).
- **FP:** replay key includes full domain-separated message identity.

**92. Dispatcher callback reentrancy via trusted adapter**
- **D:** adapter marked trusted can still re-enter caller path before state finalization.
- **FP:** reentrancy lock/effects-first invariant spans adapter callback boundaries.

**93. External return decoding without length validation**
- **D:** call result is decoded into struct/tuple without asserting expected span length.
- **FP:** decode path validates result shape/length before interpretation.

**94. Fallback-to-default on external read failure**
- **D:** failed external read (price/balance/config) silently falls back to unsafe default and continues.
- **FP:** failed read reverts or routes to explicit fail-safe mode.

**95. Multicall order dependence on mutable shared state**
- **D:** same transaction can reorder calls to bypass per-call assumptions (auth/limits/nonce checks).
- **FP:** order-independent invariants or explicit topological restrictions are enforced.

**96. Session signature replay across bundled calls**
- **D:** one signature/nonce authorizes multiple operations without per-call binding.
- **FP:** signature domain binds call set/hash and nonce monotonicity per execution.

**97. Bridge emit-before-lock/burn inconsistency**
- **D:** outbound bridge message/event emitted before asset lock/burn is irreversible.
- **FP:** bridge side effects are emitted only after asset state commit.

**98. External call target mutable in same tx path**
- **D:** target address can be changed then used immediately in same execution path without delay.
- **FP:** target mutation and target use are separated by governance delay/checkpoint.

**99. Post-interaction authorization check**
- **D:** external interaction occurs before caller/role authorization is fully validated.
- **FP:** full auth and policy checks happen strictly before any external interaction.

**100. Error-logging without rollback in privileged path**
- **D:** privileged flow catches/logs external error but keeps partial state updates.
- **FP:** privileged path either reverts or atomically compensates all partial state.

**133. Safe-dispatcher panic data drives privileged fallback logic**
- **D:** call through a safe dispatcher returns `Result::Err(panic_data)` and caller parses attacker-controlled `panic_data` to choose a privileged fallback path, effectively turning error payload into authorization/config input.
- **FP:** `Err` branches treat panic payload as opaque diagnostics only; privileged decisions never depend on panic-data content.

**134. Safe-dispatcher fallback assumes catchability of non-catchable syscall failures**
- **D:** fallback logic assumes all external call failures are catchable, but cases like non-existent contract/class hash or Cairo 0 edge paths revert the entire transaction and bypass fallback.
- **FP:** fallback logic is limited to documented catchable failure modes and pre-validates contract/class existence where needed.

**135. Deserialization failure in try_* syscall wrapper causes unexpected revert**
- **D:** `try_call_contract` or similar wrapper reverts on deserialization failure of the return value instead of returning an error, breaking fallback logic.
- **FP:** wrapper handles both call failure and decode failure paths, or return type is guaranteed by target ABI.

**136. L1/L2 message ordering gap enables blocking attack**
- **D:** `update_state` or L1 handler processes messages sequentially; a single malformed or oversized message blocks all subsequent messages in the batch.
- **FP:** messages are processed independently with per-message error isolation, or batch validation rejects invalid entries before processing.

**137. Race condition in multi-step token activation**
- **D:** token bridge activation requires multiple transactions (deploy + register + configure); between steps, another actor can front-run or interfere with an incomplete activation.
- **FP:** activation is atomic or protected by a pending-state lock that blocks interference.

**138. Optional token metadata/interface assumption without capability check**
- **D:** protocol assumes optional token metadata/interface functions (for example `decimals()`) are present and trusted, causing runtime failure or incorrect normalization on non-standard tokens.
- **FP:** token capability is validated at registration and missing optional interfaces are handled explicitly.

**139. Cross-chain bridge missing rate limit or circuit breaker**
- **D:** single bridge transaction can drain the entire locked pool with no per-transaction cap or pause mechanism.
- **FP:** bridge enforces per-tx and per-period caps with automatic pause on anomalous volume.

**140. Batch executor reuses stale external-state cache across legs**
- **D:** batched execution caches external state (allowance/balance/config) from an early leg and reuses it after intervening calls mutate that state, so even fixed call ordering can execute against invalid assumptions.
- **FP:** each leg refreshes external state at point-of-use or invalidates cache on every state-changing leg.

**141. Excessive message or output size causes DoS in state update**
- **D:** bridge `update_state` or message handler does not validate input array sizes; excessively large payloads cause out-of-gas or computation overflow.
- **FP:** handler enforces maximum array/message size bounds before processing.

**142. Registry-to-dispatch TOCTOU on class-hash validation**
- **D:** class hash is validated only at registration time, but dispatch uses a mutable registry value later without re-validating against current allowlist/snapshot.
- **FP:** dispatch re-validates class hash against immutable snapshot/allowlist at execution time.

**143. Callback during token transfer enables cross-protocol reentrancy**
- **D:** ERC721/ERC1155 safe transfer triggers receiver callback; receiving contract re-enters a different protocol function that reads stale state from the transferring contract.
- **FP:** cross-protocol reentrancy guard or effects-before-interaction pattern across all dependent state.

**144. Bridge message hash collision via non-canonical preimage encoding**
- **D:** bridge participants hash semantically identical messages with different field packing/serialization rules (felt vs bytes layout, padding, or array framing), creating hash mismatches or collisions across domains.
- **FP:** bridge defines one canonical preimage encoding shared by all participants and enforces it with cross-implementation test vectors.
