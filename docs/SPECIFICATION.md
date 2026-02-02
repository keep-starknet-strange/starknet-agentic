# Starknet Agentic -- Technical Specification

## 1. Problem Statement

AI agents are emerging as autonomous economic actors, but they lack standardized infrastructure for:
- Holding and managing on-chain wallets securely
- Building verifiable reputation and trust
- Discovering and transacting with other agents
- Accessing DeFi protocols programmatically

Starknet's native Account Abstraction, low costs, and ZK-provable compute make it uniquely suited to solve these problems.

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

    // Owner controls
    fn set_spending_limit(ref self: TContractState, token: ContractAddress, amount: u256, period: u64);
    fn emergency_revoke_all(ref self: TContractState);
    fn set_allowed_contracts(ref self: TContractState, contracts: Array<ContractAddress>);

    // Agent identity link
    fn set_agent_id(ref self: TContractState, registry: ContractAddress, agent_id: u256);
    fn get_agent_id(self: @TContractState) -> (ContractAddress, u256);
}
```

**Session Policy struct:**

```cairo
struct SessionPolicy {
    allowed_contracts: Array<ContractAddress>,
    allowed_selectors: Array<felt252>,
    spending_limit: u256,
    spending_token: ContractAddress,
    valid_after: u64,
    valid_until: u64,
    max_calls_per_tx: u32,
}
```

### 3.2 Agent Registry Contract

Based on ERC-8004, with Starknet-specific enhancements:

- Uses the existing [erc8004-cairo](https://github.com/Akashneelesh/erc8004-cairo) as the foundation
- Adds A2A Agent Card URI to agent metadata
- Integrates with Agent Account contract for automated identity binding
- Leverages Starknet's native signature verification (SNIP-6)

### 3.3 Contract Deployment Plan

1. Deploy IdentityRegistry (standalone)
2. Deploy ReputationRegistry (links to IdentityRegistry)
3. Deploy ValidationRegistry (links to IdentityRegistry)
4. Deploy AgentAccount class (template for new agent wallets)
5. Create factory for deploying new AgentAccount instances linked to the registry

## 4. MCP Server

### 4.1 Tool Definitions

Each tool follows the MCP tool schema:

```typescript
{
  name: "starknet_swap",
  description: "Execute a token swap on Starknet using avnu aggregator",
  inputSchema: {
    type: "object",
    properties: {
      sellToken: { type: "string", description: "Address of token to sell" },
      buyToken: { type: "string", description: "Address of token to buy" },
      amount: { type: "string", description: "Amount to sell in wei" },
      slippage: { type: "number", description: "Max slippage (0.01 = 1%)", default: 0.01 },
      gasless: { type: "boolean", description: "Use paymaster for gas", default: false },
    },
    required: ["sellToken", "buyToken", "amount"],
  },
}
```

### 4.2 Transport

- stdio transport for local use (Claude Desktop, Cursor)
- HTTP+SSE transport for remote use (web agents, OpenClaw)

### 4.3 Security Model

- Private keys loaded from environment variables only
- Session key support (agent operates with limited permissions)
- Transaction simulation before execution
- Spending limit enforcement in the MCP server layer

## 5. A2A Adapter

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

## 6. Skills Marketplace

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

### 6.3 Planned Skills

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
| Agent impersonation | On-chain identity verification via ERC-8004 |
| Rug pull by agent | Emergency kill switch for human owner |

## 9. Open Questions

- Should the Agent Account support multiple session keys simultaneously?
- How should cross-chain identity work between EVM ERC-8004 and Starknet registry?
- What is the right economic model for agent-to-agent micropayments?
- Should skills be versioned and how should upgrades be handled?
- How to integrate Giza's zkML for verifiable agent decisions?
