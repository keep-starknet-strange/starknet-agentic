# ERC-8004 on Starknet: Parity Core + Native Extensions

This document maps the Starknet implementation to the [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004) and explains what Starknet's native account abstraction adds on top.

**Operating model:** Parity Core + Starknet Extensions.

- **Parity Core**: API-level compatibility with ERC-8004 Solidity semantics by default.
- **Starknet Extensions**: Opt-in capabilities enabled by native account abstraction and Cairo patterns.

Tracking issue: [#78](https://github.com/keep-starknet-strange/starknet-agentic/issues/78)

---

## Registry Implementation Status

All three ERC-8004 registries are implemented, tested, and deployed on Sepolia and Mainnet.

| Registry | Contract | Tests | Mainnet | Sepolia |
|----------|----------|-------|---------|---------|
| Identity | `contracts/erc8004-cairo/src/identity_registry.cairo` | 131+ unit + 47 E2E | `0x3365...7595` | `0x72eb...1631` |
| Reputation | `contracts/erc8004-cairo/src/reputation_registry.cairo` | Included in suite above | `0x6988...7944` | `0x5a68...c78e` |
| Validation | `contracts/erc8004-cairo/src/validation_registry.cairo` | Included in suite above | `0x3c2a...cd83` | `0x7c8a...2a4f` |
| Agent Account | `contracts/agent-account/src/agent_account.cairo` | 110+ Cairo tests | Not deployed | `0x3583...720e` (factory) |

---

## Compatibility Matrix

Each function is classified as **Parity** (aligned with Solidity reference) or **Extension** (Starknet-native addition).

### Identity Registry

| Function | Solidity reference | Cairo behavior | Type |
|----------|--------------------|----------------|------|
| `register` / `register_with_token_uri` / `register_with_metadata` | Register agent, return `agentId` | Same semantic, returns `u256`. See [Known Divergences](#known-divergences) for agent ID offset. | Parity |
| `set_metadata` / `get_metadata` | Key-value metadata (string/bytes) | Key-value metadata (`ByteArray`) | Parity |
| `set_agent_uri` | Update token URI by authorized caller | Same semantic | Parity |
| `get_agent_wallet` / `unset_agent_wallet` | Read/remove linked wallet | Same semantic | Parity |
| `set_agent_wallet` | EIP-712 signature with `(agentId, newWallet, owner, deadline)` | SNIP-6 signature with `(agentId, newWallet, owner, deadline, nonce, chainId, registryAddress)`. Behavior-level parity (signature-proven wallet binding); implementation differs (EIP-712/ECDSA/ERC-1271 on EVM vs SNIP-6/Poseidon domain hash on Starknet). Nonce + chain/registry binding are Starknet extensions. | Parity + Extension |
| `token_uri` | Read token URI | Same, with explicit existence assert | Parity |
| `get_wallet_set_nonce` | Not in Solidity reference | Per-agent nonce for replay protection | Extension |
| `agent_exists` / `total_agents` | Not exposed as standalone functions | Query helpers for agent existence and count | Extension |
| `is_authorized_or_owner` | `isApprovedOrOwner` (ERC-721 internal) | Same semantic, exposed as public view | Parity |
| Upgradeable via `replace_class` | UUPS proxy pattern (`UUPSUpgradeable`) | Cairo-native class replacement (no proxy) | Extension |

### Reputation Registry

| Function | Solidity reference | Cairo behavior | Type |
|----------|--------------------|----------------|------|
| `give_feedback` | Feedback with value, decimals, tags, URIs | Same semantic, reentrancy guard | Parity |
| `revoke_feedback` | Revoke by original author | Same semantic | Parity |
| `append_response` | Append response to feedback | Same + blocks responses on revoked feedback | Parity + Extension |
| `get_summary` | `(count, summaryValue, summaryValueDecimals)` | Same semantic, arithmetic mean with WAD normalization | Parity |
| `read_feedback` / `read_all_feedback` | Read feedback entries with filters | Same semantic | Parity |
| `get_response_count` | Count responses for feedback entry | Same semantic. See [Known Divergences](#known-divergences) for empty-responders behavior. | Parity |
| `get_clients` / `get_last_index` | Query feedback clients and indices | Same semantic | Parity |
| `get_summary_paginated` | Not in Solidity reference | Bounded summary window for large datasets | Extension |

### Validation Registry

| Function | Solidity reference | Cairo behavior | Type |
|----------|--------------------|----------------|------|
| `validation_request` | Requester designates validator, emits event | Same semantic, reentrancy guard | Parity |
| `validation_response` | Designated validator responds (0-100 score) | Same semantic, single immutable response per request hash | Parity |
| `get_validation_status` | Query by `requestHash` | Same return shape | Parity |
| `get_summary` | `(count, averageResponse)` | Same semantic | Parity |
| `get_agent_validations` / `get_validator_requests` | Full list reads | Same semantic (O(n)) | Parity |
| `get_summary_paginated` | Not in Solidity reference | Bounded summary window | Extension |
| `request_exists` / `get_request` | Not exposed as standalone functions (Solidity checks `validatorAddress == address(0)`) | Explicit query helpers for request existence and data | Extension |
| Auto-generated `request_hash` | Always externally provided (`keccak256` commitment) | If `request_hash == 0`, auto-generates via Poseidon | Extension |

---

## Known Divergences

Behavioral differences from the Solidity reference that do not affect API compatibility but matter for cross-chain indexers and integrators:

- **Agent ID offset**: Cairo agent IDs start at 1 (0 is reserved for non-existent agents). Solidity starts at 0. Cross-chain indexers must account for this offset when mapping agent identities across registries.
- **`get_response_count` with empty responders**: In Cairo, passing an empty `responders` array returns 0 immediately. In Solidity, an empty array iterates all tracked responders. Practical consequence: Cairo clients calling with an empty array get 0 instead of the global response count. Cairo does not enumerate all responders for a given feedback entry -- callers must supply explicit responder addresses.
- **`append_response` on revoked feedback**: Cairo explicitly blocks appending responses to revoked feedback (`assert(!fb.is_revoked)`). Solidity does not check revocation status before appending. This is a stricter behavior classified as Extension above.
- **Validation response immutability**: Cairo rejects a second `validation_response` for the same `request_hash` (`assert(!existing.has_response)`). Solidity reference behavior allows replacing the previous response. Cairo is stricter and requires a new request hash for revisions.
- **Reentrancy guards**: Cairo adds reentrancy guards to `give_feedback` and `validation_request`. The Solidity reference does not include explicit reentrancy protection for these functions.
- **Metadata key hashing**: Cairo hashes metadata keys to `felt252` via Poseidon (`_hash_key`) before storage lookup. Solidity uses raw `string` keys in nested mappings. Functionally equivalent for normal use, but direct storage readers and cross-chain indexers must be aware that Cairo storage slots are keyed by `poseidon(key_bytes)`, not the raw key string.

---

## Starknet-Native Extensions

These capabilities are not part of the ERC-8004 reference implementation and leverage Starknet-native patterns (account abstraction, Cairo-native storage). Some are achievable on EVM through separate standards (e.g., ERC-4337 session keys), but are not in the ERC-8004 default path.

### Session Keys (Agent Account)

**The problem:** If an AI agent holds a raw private key, a compromise (via prompt injection, social engineering, env var leak, git commit) exposes the entire treasury.

**The solution:** The agent never holds the master key. Instead, the human owner registers a **session key** with a policy enforced on-chain in `__execute__`:

```cairo
struct SessionPolicy {
    valid_after: u64,           // Start timestamp
    valid_until: u64,           // Expiry timestamp
    spending_limit: u256,       // Max spend per 24h rolling window
    spending_token: ContractAddress,  // Which token is capped
    allowed_contract: ContractAddress, // Restrict to specific contract (zero = any)
}
```

**What the policy enforces:**

- **Spending cap**: `transfer`, `approve`, and `increase_allowance` (both snake_case and camelCase variants) are tracked and debited against `spending_limit` per 24-hour rolling period.
- **Time bounds**: Session key is only valid between `valid_after` and `valid_until`.
- **Contract restriction**: If `allowed_contract` is set, the session key can only call that contract.
- **Revocation**: Owner can revoke individual keys or use `emergency_revoke_all()` as a kill switch.

**If the session key leaks**, the attacker gets a credential that:
- Cannot spend more than `spending_limit` per day
- Cannot call contracts outside the allowlist
- Expires at `valid_until`
- Can be revoked instantly by the owner

The master key (owner) stays with the human and is never exposed to the agent runtime.

**Test coverage:** 110+ Cairo tests in `contracts/agent-account/`, including adversarial tests for spending bypass, expired keys, revocation, and emergency scenarios.

### Domain-Separated Wallet Binding

EVM ERC-8004 uses EIP-712 typed signatures for `setAgentWallet`. The Starknet implementation uses SNIP-6 signature verification with a domain-separated hash that includes:

```
(agent_id, new_wallet, owner, deadline, nonce, chain_id, registry_address)
```

This prevents:
- **Cross-chain replay**: A wallet binding signature from Sepolia cannot be reused on mainnet.
- **Cross-registry replay**: A signature for one registry cannot be reused on another.
- **Signature reuse**: Nonce increments after each successful `set_agent_wallet`, making signatures one-time use.

### Bounded Read Paths

Both Reputation and Validation registries add `get_summary_paginated` for bounded reads. The standard `get_summary` functions are O(n) over all entries -- the paginated variants allow production systems to cap gas and latency.

Reputation registry also exposes `read_all_feedback_paginated` for bounded raw-feedback traversal. The legacy `read_all_feedback` path includes a defensive scan ceiling (`MAX_READ_ALL_FEEDBACK_ENTRIES`) across client and feedback iteration and now reverts with `Use read_all_feedback_paginated` when that ceiling is exceeded.

### Timelocked Upgrades

Agent Account supports scheduled contract upgrades with a configurable delay:

- `schedule_upgrade(new_class_hash)` -- starts the timer
- `execute_upgrade()` -- only after delay has elapsed
- `cancel_upgrade()` -- owner can abort

This prevents instant hostile upgrades if the owner key is briefly compromised.

---

## Cross-Chain Interoperability

### Hash Algorithm

| Environment | Hash function | Output type |
|-------------|---------------|-------------|
| EVM (Solidity) | keccak256 | `bytes32` |
| Starknet (Cairo) | Poseidon (auto-generated hashes, domain separation) | `u256` |

`u256` and `bytes32` are bit-width compatible (both 256-bit). Poseidon is used for **auto-generated** hashes (e.g., `validation_request` when `request_hash == 0`) and **internal domain separation** (e.g., `set_agent_wallet` hash preimage). Externally supplied hashes (e.g., `request_hash`, `feedback_hash`) are stored as opaque `u256` values and can originate from any algorithm, including `keccak256` from an EVM source.

For cross-chain portability:

1. Treat externally supplied hashes as opaque 32-byte values.
2. When proving parity across chains, pass explicit hashes from the source system rather than relying on Starknet auto-generation.
3. Document hash provenance in off-chain metadata (`hash_algorithm: keccak256 | poseidon`).

### Identity Linkage

An agent can register on multiple chains. The ERC-8004 registration file includes a `registrations` array:

```json
{
  "registrations": [
    { "agentId": 22, "agentRegistry": "eip155:1:0x742..." },
    { "agentId": 5,  "agentRegistry": "starknet:SN_MAIN:0x785..." }
  ]
}
```

Chain-local state (reputation, validation history) remains chain-scoped. Cross-chain reputation aggregation is handled off-chain by indexers.

---

## Deployment

### Mainnet (live)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595` |
| ReputationRegistry | `0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944` |
| ValidationRegistry | `0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83` |

### Sepolia (live)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631` |
| ReputationRegistry | `0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e` |
| ValidationRegistry | `0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f` |
| AgentAccountFactory | `0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e` |

---

## Workstream Status (Issue #78)

| Workstream | Scope | Status | PRs |
|------------|-------|--------|-----|
| A: Parity Core | Validation API alignment (0-100 score, designated validator, return shapes) | Done | #80, #81 |
| B: Starknet Extensions | Domain-separated wallet hashing, nonce anti-replay | Done | #83 |
| C: Compatibility Governance | Compatibility matrix in docs, upstream sync tracking | Done | #100, #114 |
| D: Cross-Chain Operations | Migration helpers, L1-L2 messaging relay | Design notes only | -- |

---

## Audit Status

This implementation has **not undergone a formal third-party security audit**. The codebase uses audited OpenZeppelin Cairo components (ReentrancyGuard, Ownable, ERC-721, Upgradeable) and includes adversarial test suites and fuzz invariants (PRs #77, #81, #83).

---

## References

- [ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)
- [Solidity reference implementation](https://github.com/erc-8004/erc-8004-contracts)
- [Full technical specification](SPECIFICATION.md) (Section 3.4 for detailed matrix)
- [Issue #78: RFC tracking](https://github.com/keep-starknet-strange/starknet-agentic/issues/78)
- [Agent Account contract](../contracts/agent-account/)
- [ERC-8004 Cairo contracts](../contracts/erc8004-cairo/)
