# Starknet Agentic -- Technical Specification

## Planned package: prediction-arb-scanner (MVP0)
Signals-only scanner for cross-venue prediction market pricing deltas, with Starknet-native hedge/collateral recipe strings (Ekubo/Re7/fallback). See issue #27.


## 1. Problem Statement

AI agents are emerging as autonomous economic actors, but they lack standardized infrastructure for:
- Holding and managing on-chain wallets securely
- Building verifiable reputation and trust
- Discovering and transacting with other agents
- Accessing DeFi protocols programmatically

Starknet's native Account Abstraction, low costs, and ZK-provable compute make it uniquely suited to solve these problems.

### Implementation Status

This specification describes both implemented features and planned designs:

| Component | Status | Notes |
|-----------|--------|-------|
| Agent Account Contract | **Tested** | 110 tests across 4 test suites |
| Agent Registry (ERC-8004) | **Production** | 131+ unit + 47 E2E tests, deployed on Sepolia |
| Huginn Registry Contract | **Functional** | Starknet-native reasoning registry at `contracts/huginn-registry/` |
| MCP Server | **Production** | 9 tools implemented |
| A2A Adapter | **Functional** | Basic implementation complete |
| Skills | **Mixed** | 6 skills in repo (complete + template + onboarding) |
| Framework Extensions | **Planned** | Deferred to v2.0 |

See [ROADMAP.md](ROADMAP.md) for detailed implementation plan.

## 2. Architecture

### 2.1 Layer Model

```
Layer 4: Agent Platforms (OpenClaw, Daydreams, Lucid Agents, custom)
Layer 3: Protocol Adapters (MCP Server, A2A Adapter, Skills)
Layer 2: Starknet SDK (wallet mgmt, DeFi actions, identity ops)
Layer 1: Smart Contracts (Agent Account, Agent Registry)
Layer 0: Starknet L2 (native AA, ZK proofs, paymaster)
```

### 2.2 Component Diagram

```
                    ┌───────────────┐
                    │  AI Agent     │
                    │  (any model)  │
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
        │ MCP Server │ │  A2A    │ │   Skills    │
        │ (tools)    │ │ Adapter │ │ (knowledge) │
        └─────┬──────┘ └────┬────┘ └──────┬──────┘
              │             │             │
              └─────────────┼─────────────┘
                            │
                    ┌───────▼───────┐
                    │  Starknet SDK │
                    │  (starknet.js)│
                    └───────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
        │   Agent   │ │  Agent  │ │  Reputation  │
        │  Account  │ │Registry │ │  Registry    │
        └─────┬─────┘ └────┬────┘ └──────┬──────┘
              │             │             │
              └─────────────┼─────────────┘
                            │
                    ┌───────▼───────┐
                    │   Starknet    │
                    │      L2       │
                    └───────────────┘
```

## 3. Smart Contracts

### 3.1 Agent Account Contract

**Status:** Tested at `contracts/agent-account/` (~570 lines main contract, 110 tests across 4 suites).

**Purpose:** A purpose-built Starknet account contract for AI agents that extends native AA with agent-specific features.

**Interface:**

```cairo
#[starknet::interface]
trait IAgentAccount<TContractState> {
    // Session key management
    fn register_session_key(ref self: TContractState, key: felt252, policy: SessionPolicy);
    fn revoke_session_key(ref self: TContractState, key: felt252);
    fn get_session_key_policy(self: @TContractState, key: felt252) -> SessionPolicy;
    fn is_session_key_valid(self: @TContractState, key: felt252) -> bool;

    // Policy enforcement
    fn validate_session_key_call(
        self: @TContractState,
        key: felt252,
        target: ContractAddress,
    ) -> bool;
    fn use_session_key_allowance(
        ref self: TContractState,
        key: felt252,
        token: ContractAddress,
        amount: u256,
    );

    // Owner controls
    fn emergency_revoke_all(ref self: TContractState);
    fn get_active_session_key_count(self: @TContractState) -> u32;

    // Agent identity link
    fn set_agent_id(ref self: TContractState, registry: ContractAddress, agent_id: u256);
    fn get_agent_id(self: @TContractState) -> (ContractAddress, u256);
}
```

**Session Policy struct:**

```cairo
struct SessionPolicy {
    valid_after: u64,
    valid_until: u64,
    spending_limit: u256,
    spending_token: ContractAddress,
    allowed_contract: ContractAddress,  // zero address = any contract
}
```

### 3.2 Agent Registry Contract (ERC-8004 Core)

Based on ERC-8004, with Starknet-specific enhancements:

- Uses the existing [erc8004-cairo](https://github.com/Akashneelesh/erc8004-cairo) as the foundation
- Adds A2A Agent Card URI to agent metadata
- Integrates with Agent Account contract for automated identity binding
- Leverages Starknet's native signature verification (SNIP-6)

### 3.3 Starknet-Only Contract Extensions

In addition to ERC-8004 registries, this repo includes Starknet-native contracts:

- `contracts/agent-account/`: AA-native account contract with session keys, policy enforcement, and timelocked upgrades.
- `contracts/huginn-registry/`: Starknet-native registry for Huginn integration (outside ERC-8004 core scope).

### 3.4 ERC-8004 Compatibility Matrix (Parity vs Extension)

> **Reader-friendly version:** For a standalone summary of ERC-8004 parity, Starknet extensions (session keys, domain separation), and cross-chain notes, see [ERC8004-PARITY.md](ERC8004-PARITY.md). This section is the canonical technical reference.

This section is the in-repo source of truth for ERC-8004 compatibility decisions.
`Parity` means behavior is intentionally aligned with ERC-8004 Solidity semantics.
`Extension` means additive Starknet-native behavior.

#### Identity Registry

| Function | Solidity reference semantic | Cairo semantic | Status | Type | Notes |
|----------|-----------------------------|----------------|--------|------|-------|
| `register_with_metadata` | Register agent + metadata, return `agentId` | Same semantic, returns `u256` | Implemented | Parity | Value type adaptation: metadata uses `ByteArray` |
| `register_with_token_uri` | Register agent + URI, return `agentId` | Same semantic | Implemented | Parity |  |
| `register` | Register with defaults, return `agentId` | Same semantic | Implemented | Parity |  |
| `set_metadata` / `get_metadata` | Metadata keyed by string/bytes | Metadata keyed by `ByteArray` | Implemented | Parity | ABI adaptation (`bytes`/`string` -> `ByteArray`) |
| `set_agent_uri` | Update token URI by authorized caller | Same semantic | Implemented | Parity |  |
| `get_agent_wallet` | Read current linked wallet | Same semantic | Implemented | Parity |  |
| `set_agent_wallet` | Signature-proven wallet binding | Signature-proven wallet binding | Implemented | Parity + Extension | Extension: domain-separated hash, nonce, tight deadline window |
| `unset_agent_wallet` | Remove linked wallet | Same semantic | Implemented | Parity |  |
| `token_uri` | Read token URI for existing token | Requires token existence, then read | Implemented | Parity | Explicit existence assert added |
| `get_wallet_set_nonce` | Not in Solidity reference | Per-agent nonce read | Implemented | Extension | Replay protection support |

#### Validation Registry

| Function | Solidity reference semantic | Cairo semantic | Status | Type | Notes |
|----------|-----------------------------|----------------|--------|------|-------|
| `validation_request` | Requester designates validator | Same semantic | Implemented | Parity | Includes reentrancy guard |
| `validation_response` | Only designated validator can respond (0..100) | Same semantic | Implemented | Parity | Progressive updates allowed |
| `get_validation_status` | Query by `requestHash`, return status tuple | Same semantic shape | Implemented | Parity | Returns zeroed response fields when not responded |
| `get_summary` | `(count, avgResponse)` | Same semantic | Implemented | Parity |  |
| `get_summary_paginated` | Not in Solidity reference | Bounded summary window | Implemented | Extension | Added for bounded reads |
| `get_agent_validations` / `get_validator_requests` | Full list reads | Full list reads | Implemented | Parity | O(n) list reads; see operational notes below |
| `request_exists` / `get_request` | Existence/details lookup | Same semantic | Implemented | Parity |  |

#### Reputation Registry

| Function | Solidity reference semantic | Cairo semantic | Status | Type | Notes |
|----------|-----------------------------|----------------|--------|------|-------|
| `give_feedback` | Feedback with value, decimals, tags, URIs/hashes | Same semantic | Implemented | Parity | Reentrancy guard enabled |
| `revoke_feedback` | Revoke by original feedback author | Same semantic | Implemented | Parity |  |
| `append_response` | Append response to feedback | Same semantic + revoked guard | Implemented | Parity + Extension | Extension: explicit revoked-feedback block |
| `get_summary` | `(count, summaryValue, summaryValueDecimals)` | Same semantic | Implemented | Parity | Weighted/normalized average behavior aligned |
| `get_summary_paginated` | Not in Solidity reference | Bounded summary window | Implemented | Extension | Added for bounded reads |
| `read_all_feedback` | Full dataset read by filters | Full dataset read by filters | Implemented | Parity | O(n) read; use bounded summary for large sets |

### 3.5 Workstream D Note: Cross-Chain Hash Interoperability

Cross-chain onboarding must assume hash algorithm differences by default:

- EVM reference flows commonly use `bytes32` values generated with `keccak256`.
- Cairo storage uses `u256` for request/response hashes (bit-width-compatible with `bytes32`).
- Auto-generated hashes in the Starknet contracts use Poseidon, not keccak.

Recommended convention for cross-chain portability:

1. Treat externally supplied hashes as opaque 32-byte values.
2. When proving parity across chains, pass explicit request/response hashes from the source system instead of relying on Starknet auto-generation.
3. Document hash provenance in off-chain metadata (e.g., `hash_algorithm: keccak256|poseidon`) for indexers.
4. For v1 migration demos, prefer explicit hash injection and deterministic replay-safe signatures over implicit auto-hash paths.

### 3.6 Operational Notes (Validation/Reputation)

- Progressive overwrite behavior:
  - `validation_response` is latest-state storage by design.
  - A designated validator can update the response over time (progressive validation).
  - Historical evolution is preserved in event logs, not in a full on-chain response history map.

- Unbounded reads:
  - `get_agent_validations`, `get_validator_requests`, and full-list style accessors are O(n).
  - On large datasets, clients should prefer paginated summary functions (`get_summary_paginated`) and bounded off-chain indexing.
  - Avoid relying on unbounded full-array reads for latency-sensitive production paths.

### 3.7 Contract Deployment Plan

1. Deploy IdentityRegistry (standalone)
2. Deploy ReputationRegistry (links to IdentityRegistry)
3. Deploy ValidationRegistry (links to IdentityRegistry)
4. Deploy AgentAccount class (template for new agent wallets)
5. Create factory for deploying new AgentAccount instances linked to the registry

### 3.8 Huginn Registry Semantics (v1)

This section clarifies v1 invariants for `contracts/huginn-registry/`:

- Verifier mutability:
  - The verifier address is constructor-set and immutable in v1.
  - If verifier logic must change, deploy a new registry instance and migrate clients.

- Proof record invariant:
  - Invalid proofs revert and are not stored.
  - Therefore stored records satisfy: `submitted => verified = true`.
  - `verified = false` is not a persisted runtime state in v1.
  - `proof_exists(thought_hash)` should be used by clients for explicit existence checks.
  - Proof payloads are bounded (`MAX_PROOF_WORDS`) to avoid oversized calldata/hash/verifier griefing.

- Ownership and replay:
  - First logger of a `thought_hash` becomes canonical thought owner.
  - Same owner may re-log idempotently; different owner is rejected.
  - Only thought owner can submit proof for that hash.
  - One submitted proof per `thought_hash` (replay blocked).
  - Tradeoff: first-logger semantics can be front-run if `thought_hash` is predictable. Clients should include caller-specific salting/domain separation in hash construction.

## 4. MCP Server

**Status:** Production-ready at `packages/starknet-mcp-server/` (1,600+ lines, 9 tools implemented).

### 4.1 Tool Definitions

Current registered tool inventory in `packages/starknet-mcp-server/src/index.ts`:

1. `starknet_get_balance`
2. `starknet_get_balances`
3. `starknet_transfer`
4. `starknet_call_contract`
5. `starknet_invoke_contract`
6. `starknet_swap`
7. `starknet_get_quote`
8. `starknet_estimate_fee`
9. `x402_starknet_sign_payment_required`

### 4.2 Transport

- stdio transport for local use (Claude Desktop, Cursor)
- HTTP+SSE transport for remote use (web agents, OpenClaw)

### 4.3 Security Model

- Private keys loaded from environment variables only
- Session key support (agent operates with limited permissions)
- Transaction simulation before execution
- Spending limit enforcement in the MCP server layer

## 5. A2A Adapter

**Status:** Functional at `packages/starknet-a2a/` (437 lines). Basic implementation complete.

### 5.1 Agent Card Generation

The adapter reads on-chain identity from the Agent Registry and generates A2A-compliant Agent Cards:

```typescript
async function generateAgentCard(agentId: number, registryAddress: string): Promise<AgentCard> {
  const metadata = await registry.getAllMetadata(agentId);
  const reputation = await reputationRegistry.getSummary(agentId);

  return {
    name: metadata.agentName,
    description: metadata.description,
    url: metadata.a2aEndpoint,
    version: metadata.version,
    skills: parseCapabilities(metadata.capabilities),
    starknetIdentity: {
      registryAddress,
      agentId,
      reputationScore: reputation.averageScore,
      validationCount: reputation.validationCount,
    },
  };
}
```

### 5.2 Task Protocol

A2A tasks map to Starknet transactions:

| A2A Task State | Starknet Equivalent |
|----------------|---------------------|
| `submitted` | Transaction sent |
| `working` | Transaction pending |
| `completed` | Transaction confirmed |
| `failed` | Transaction reverted |
| `canceled` | Not applicable (immutable) |

### 5.3 Package Classification (Infrastructure vs Application)

Current monorepo packages:

| Package | Role | Layer |
|---------|------|-------|
| `starknet-mcp-server` | Tool execution surface (MCP) | Core infrastructure |
| `starknet-a2a` | A2A protocol adapter | Core infrastructure |
| `starknet-agent-passport` | ERC-8004 identity helper/ABI wrapper | Core infrastructure |
| `x402-starknet` | x402 payment integration | Core infrastructure |
| `prediction-arb-scanner` | Prediction-market scanner application | App-layer package |

## 6. Skills Marketplace

**Status:** 6 skills in `skills/` directory.

Current skill directories:

- `huginn-onboard`
- `starknet-anonymous-wallet`
- `starknet-defi`
- `starknet-identity`
- `starknet-mini-pay`
- `starknet-wallet`

### 6.1 Skill Directory Structure

```
skills/<skill-name>/
├── SKILL.md              # Entry point with YAML frontmatter
├── references/           # Detailed guides
│   ├── getting-started.md
│   ├── advanced-usage.md
│   └── error-handling.md
└── scripts/              # Runnable examples
    ├── basic-example.ts
    └── advanced-example.ts
```

### 6.2 Frontmatter Schema

```yaml
---
name: string          # Unique skill identifier
description: string   # When to activate (semantic matching)
keywords: string[]    # Trigger words
allowed-tools: string[] # Claude Code tools the skill can use
user-invocable: boolean # Can users explicitly invoke
---
```

### 6.3 Planned Additional Skills

| Skill | Description | Priority |
|-------|-------------|----------|
| starknet-wallet | Wallet creation, transfers, session keys | P0 |
| starknet-defi | Swaps, staking, lending, DCA | P0 |
| starknet-identity | Agent registration, reputation, validation | P0 |
| starknet-nft | NFT minting, transfers, marketplace | P1 |
| starknet-gaming | Dojo/Torii integration, game worlds | P1 |
| starknet-bridge | Cross-chain token bridges | P1 |
| starknet-governance | DAO voting, proposal creation | P2 |

## 7. Framework Extensions

**Status:** Not yet implemented. Deferred to v2.0 (see [ROADMAP.md](ROADMAP.md) section 3.1).

### 7.1 Daydreams Extension

Follows the Daydreams extension pattern (`extension()` helper):

- **Services:** StarknetProvider (RPC + account), avnuService (DeFi)
- **Contexts:** `starknet-wallet` (balance, tx history), `starknet-agent` (identity, reputation)
- **Actions:** transfer, swap, stake, registerAgent, giveFeedback
- **Inputs:** on-chain event subscription via Torii/polling
- **Outputs:** transaction result formatting

### 7.2 Lucid Agents Extension

Implements the Lucid Agents `Extension` interface:

- **WalletConnector:** StarknetWalletConnector wrapping starknet.js Account
- **PaymentsRuntime:** Starknet-native payment verification (no x402)
- **EntrypointDef:** Starknet operation entrypoints with Zod schemas

## 8. Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Private key exposure | Environment variables only; session keys for agents |
| Unlimited spending | Spending limits in Agent Account contract |
| Unauthorized transactions | Session key policies (allowed contracts, methods, time bounds) |
| Prompt injection via skills | Skill sandboxing; input validation in MCP tools |
| Replay attacks | Chain ID + nonce in all signatures |
| Signer-proxy impersonation/replay | HMAC headers + nonce + timestamp, mTLS for non-loopback production, versioned signer API (`spec/signer-api-v1.openapi.yaml`) |
| Agent impersonation | On-chain identity verification via ERC-8004 |
| Rug pull by agent | Emergency kill switch for human owner |

## 9. Open Questions

These questions are tracked for resolution in [ROADMAP.md](ROADMAP.md) section 3.7.

- **Multiple session keys:** Should the Agent Account support multiple session keys simultaneously?
  - *Current decision:* Single-level delegation only (owner -> agent). Nested delegation deferred to v2.0+.
- **Cross-chain identity:** How should cross-chain identity work between EVM ERC-8004 and Starknet registry?
  - *Status:* Open question, tracked in ROADMAP 3.3.
- **Micropayments:** What is the right economic model for agent-to-agent micropayments?
  - *Status:* Open question, tracked in ROADMAP 3.7.
- **Skill versioning:** Should skills be versioned and how should upgrades be handled?
  - *Status:* Open question, tracked in ROADMAP 3.7.
- **zkML integration:** How to integrate Giza's zkML for verifiable agent decisions?
  - *Status:* Planned for v2.0+, tracked in ROADMAP 3.4.
