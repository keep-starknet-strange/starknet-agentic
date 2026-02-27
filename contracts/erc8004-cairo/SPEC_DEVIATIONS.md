# ERC-8004 Cairo Spec Deviations

This document lists intentional behavior differences between the Cairo implementation and the Solidity reference/EIP text.

| Area | Cairo Behavior | Reference Behavior | Rationale | Risk / Tradeoff | Integrator Impact |
|---|---|---|---|---|---|
| Hashing primitive | Uses Poseidon for internal hash preimages | Uses keccak256 + ABI encoding | Native Starknet-friendly hashing and lower friction with Starknet tooling | Cross-chain hash parity is not 1:1 | Do not reuse EVM hash assumptions; use Starknet-specific hash builders |
| Validation response mutability | `validation_response` is one-shot (immutable once set) | EIP text allows multiple responses for same request hash | Hardening against silent post-hoc validator rewrites | Loses progressive update workflow for a single request hash | If validator state needs progression, create a new request hash |
| Revoked feedback responses | `append_response` reverts on revoked feedback | Reference allows append semantics without this guard | Avoid attaching fresh responses to explicitly revoked entries | Less flexible dispute-style response flow on revoked items | Capture disputes off-chain or before revoke |
| Agent id start | First agent id is `1` (`0` reserved) | Solidity increments from 0 | Simpler non-existent sentinel semantics | Cross-implementation id parity differs | Indexers and bridges must not assume first id is `0` |
| Wallet-set signature schema | Includes `(nonce, chain_id, registry_address)` in signed preimage | Solidity EIP-712 shape differs | Strong replay resistance and explicit domain separation | Not signature-compatible with Solidity flow | Wallet tooling must follow Cairo preimage format exactly |
| Metadata value type | Uses `ByteArray` values | EIP wording often models metadata as bytes | Native Cairo storage ergonomics | Arbitrary binary payloads require encoding | Encode binary payloads (e.g. hex/base64) before storing |

## Notes

- These deviations are part of the security posture for this repo, not accidental drift.
- For large reads, prefer paginated methods and treat non-paginated methods as legacy convenience APIs with defensive ceilings.
