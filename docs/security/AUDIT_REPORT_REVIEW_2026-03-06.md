# Audit Report Review (2026-03-06)

This note reviews the external report claims against current code and primary
standards (SNIP-6, Cairo corelib, ERC-8004 spec).

## Implemented In This PR

1. `agent-account`: block `decrease_allowance` / `decreaseAllowance` for
   session keys.
   - Rationale: prevents session-key griefing of owner-managed approvals.
2. `agent-account`: cap session-key multicall length (`MAX_SESSION_KEY_CALLS_PER_TX = 64`).
   - Rationale: bounds worst-case single-transaction griefing surface.
3. `erc8004-cairo`: increment wallet-set nonce on `unset_agent_wallet`
   only when a wallet is currently set.
   - Rationale: invalidates previously signed-but-unsubmitted wallet-set payloads.
4. `erc8004-cairo`: `_is_approved_or_owner` changed to snapshot
   (`@ContractState`) since it is read-only.

## Finding-By-Finding Verdict

| Finding | Verdict | Notes |
| --- | --- | --- |
| H-1 single `spending_token` allows multi-token drain | Not a vuln | Current logic reverts on token mismatch (`Wrong spending token`). |
| H-2 `decrease_allowance` not blocked | Valid | Fixed in this PR by explicit selector block. |
| H-3 no max calls per tx | Valid hardening | Fixed in this PR with session-key call-count cap. |
| M-1 `_hash_key` missing explicit length | Not actionable | `poseidon_hash_span` already domain-separates by input length/padding; changing preimage now would break stored key compatibility. |
| M-2 `agent_id_counter` overflow | Informational | `u256` checked arithmetic already reverts on overflow. |
| M-3 caller-supplied `request_hash` front-running | Limited/design | Unauthorized third parties cannot submit for victim agent due owner/approval check; custom-hash collision grief remains user-controlled and avoidable via auto-hash (`0`). |
| M-4 open `append_response` spam risk | By design | Matches ERC-8004 open response model. |
| M-5 period boundary double-spend | Known fixed-window behavior | Accepted for current policy semantics. |
| M-6 `VALIDATED` vs `'VALID'` interop | False positive | In Cairo corelib, `starknet::VALIDATED` is `'VALID'`. |
| L-1 `unset_agent_wallet` nonce not incremented | Valid | Fixed in this PR. |
| L-2 missing per-key revoke events in emergency revoke | False positive | Component emits `SessionKeyRevoked` on each revoke. |
| L-3 `_is_approved_or_owner` takes `ref self` | Valid style/correctness | Fixed to `@ContractState`. |
| L-4 constructor factory non-zero check missing | Design choice | Zero factory is intentional for direct-deploy mode. |
| L-5 summary integer truncation | Informational | Expected integer arithmetic behavior. |
| L-6 `get_agent_wallet` lacks exists check | API semantics | Current API intentionally allows zero-address return for unset/non-existent. |

## Primary References Used

- SNIP-6: `is_valid_signature` success value `'VALID'`
  - <https://raw.githubusercontent.com/starknet-io/SNIPs/main/SNIPS/snip-6.md>
- Cairo corelib `starknet::VALIDATED` constant definition
  - `core/src/starknet.cairo` (`pub const VALIDATED: felt252 = 'VALID';`)
- Cairo corelib Poseidon span hashing/padding behavior
  - `core/src/poseidon.cairo`
- ERC-8004 spec (open response model)
  - <https://eips.ethereum.org/EIPS/eip-8004>
