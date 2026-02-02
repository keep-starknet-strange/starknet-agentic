# Agent Context -- Starknet Agentic

## Mission

Make Starknet the financial rails for the agentic era. Every AI agent -- regardless of framework -- should be able to hold a wallet, transact, build reputation, and participate in DeFi on Starknet with minimal friction.

## What This Repository Is

A consolidated infrastructure layer that provides:

1. **Smart contracts** (Cairo) for agent wallets and on-chain identity
2. **MCP server** for tool-based Starknet access from any agent
3. **A2A adapter** for agent-to-agent discovery and communication
4. **Skills marketplace** for Claude Code and OpenClaw agents
5. **Framework extensions** for Daydreams and Lucid Agents

## References

The `references/` directory is your knowledge base for agentic development on Starknet. Always consult it before writing skills, contracts, or integrations.

- **`references/starknet-docs/`** -- Official Starknet documentation (git submodule from [starknet-io/starknet-docs](https://github.com/starknet-io/starknet-docs)). Use this as the authoritative source for Starknet architecture, Cairo language, account abstraction, transaction lifecycle, messaging, and protocol-level details.
- **`references/agentskills/`** -- AgentSkills specifications covering integration patterns, skill format, and what skills are.

When building anything in this repo, ground your work in these references rather than relying solely on training data.

## The Agent Standards Stack

Three protocols are converging into the standard infrastructure for AI agents:

```
┌──────────────────────────────────────┐
│  ERC-8004: On-Chain Identity & Trust │  Who agents are, why to trust them
├──────────────────────────────────────┤
│  A2A: Agent-to-Agent Communication   │  How agents talk to each other
├──────────────────────────────────────┤
│  MCP: Agent-to-Tool Connectivity     │  What agents can do
└──────────────────────────────────────┘
```

Starknet Agentic implements all three layers with Starknet as the settlement and identity layer.

## Existing Ecosystem Assets

### Already Built (Reusable)

| Asset | Where | What We Use |
|-------|-------|-------------|
| ERC-8004 Cairo contracts | [erc8004-cairo](https://github.com/Akashneelesh/erc8004-cairo) | Identity, Reputation, Validation registries. 74 unit tests + 47 E2E tests. Production-ready on Sepolia. |
| avnu Skill | [avnu-skill](https://github.com/avnu-labs/avnu-skill) | Swap, DCA, staking, gasless/gasfree patterns. Documentation + scripts. |
| Daydreams StarknetChain | [daydreams/defai](https://github.com/daydreamsai/daydreams) | Minimal IChain (read/write) using starknet.js v6. We extend this. |
| Lucid Agents Extension System | [lucid-agents](https://github.com/daydreamsai/lucid-agents) | WalletConnector, PaymentsRuntime, EntrypointDef interfaces. We implement for Starknet. |
| Snak Agent Kit | [snak](https://github.com/KasarLabs/snak) | MCP-native toolkit with plugin architecture. We can contribute plugins. |
| Cartridge Controller | [cartridge.gg](https://docs.cartridge.gg) | Session key implementation for smart wallets. Reference for our Agent Account. |

### Gaps to Fill

| Gap | Priority | Approach |
|-----|----------|----------|
| No agent-specific account contract | HIGH | Build Agent Account with session keys, spending limits, kill switch |
| No Starknet MCP server with DeFi | HIGH | Build on starknet.js + @avnu/avnu-sdk |
| No Starknet wallet skill | HIGH | Create SKILL.md with wallet operations |
| No A2A support for Starknet agents | MEDIUM | Implement Agent Card generation from on-chain identity |
| No Lucid Agents Starknet connector | MEDIUM | Implement WalletConnector interface with starknet.js |
| No Daydreams DeFi extension | MEDIUM | Create extension with swap, lend, stake actions |
| No MoltBook presence | LOW | Deploy Starknet ecosystem bot |
| No cross-chain identity bridge | LOW | Bridge ERC-8004 between EVM and Starknet |

## Agent Wallet Architecture

The Agent Account contract is the core primitive. It extends Starknet's native AA:

```
┌─────────────────────────────────────┐
│           Agent Account             │
│                                     │
│  ┌──────────┐  ┌────────────────┐   │
│  │  Owner   │  │  Session Keys  │   │
│  │  (human) │  │  (agents)      │   │
│  └──────────┘  └────────────────┘   │
│                                     │
│  Policies:                          │
│  - Allowed contracts & methods      │
│  - Spending limits per period       │
│  - Time bounds (expiry)             │
│  - Kill switch (owner revokes all)  │
│                                     │
│  Features:                          │
│  - Paymaster support (no ETH req)   │
│  - Event logging (for reputation)   │
│  - Multi-call batching              │
│  - Nonce abstraction (parallel tx)  │
└─────────────────────────────────────┘
```

## MCP Server Tools

The Starknet MCP server exposes these tools to any MCP-compatible agent:

### Wallet Tools
- `starknet_get_balance` -- Query token balances for an address
- `starknet_transfer` -- Send tokens (ETH, STRK, USDC, etc.)
- `starknet_get_nonce` -- Get current nonce
- `starknet_estimate_fee` -- Estimate transaction fees

### Contract Tools
- `starknet_call_contract` -- Read contract state (view functions)
- `starknet_invoke_contract` -- Write to contracts (state-changing)
- `starknet_deploy_contract` -- Deploy new contracts
- `starknet_get_events` -- Query on-chain events

### DeFi Tools
- `starknet_swap` -- Execute token swaps via avnu aggregator
- `starknet_get_quote` -- Get swap quotes without executing
- `starknet_stake` -- Stake STRK or liquid staking tokens
- `starknet_create_dca` -- Create Dollar Cost Averaging orders

### Identity Tools
- `starknet_register_agent` -- Register agent identity on-chain (ERC-8004)
- `starknet_get_agent_info` -- Query agent metadata and reputation
- `starknet_give_feedback` -- Submit reputation feedback for an agent
- `starknet_request_validation` -- Request third-party validation

## Skills Format

Skills follow the AgentSkills convention used by Claude Code and OpenClaw:

```yaml
---
name: starknet-wallet
description: >
  Create and manage Starknet wallets for AI agents. Transfer tokens,
  check balances, manage session keys, and interact with smart contracts.
keywords:
  - starknet
  - wallet
  - transfer
  - balance
  - session-keys
  - account-abstraction
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---
```

Each skill directory contains:
- `SKILL.md` -- Main skill file with frontmatter and quick reference
- `references/` -- Deep-dive documentation for specific topics
- `scripts/` -- Runnable TypeScript/Python examples

## Platform Integration Patterns

### For Daydreams
```typescript
import { extension, action, service } from "@daydreamsai/core";

export const starknetExtension = extension({
  name: "starknet",
  services: [starknetProviderService],
  actions: [transferAction, swapAction, registerAgentAction],
  contexts: { wallet: starknetWalletContext },
  inputs: { "starknet:event": onChainEventInput },
  outputs: { "starknet:tx": transactionOutput },
});
```

### For Lucid Agents
```typescript
import { Extension, WalletConnector } from "@lucid-agents/types";

export function starknetWallet(config: StarknetConfig): Extension {
  return {
    name: "starknet-wallet",
    build(ctx) {
      return { wallets: createStarknetWalletRuntime(config) };
    },
  };
}
```

### For MCP (any agent)
```json
{
  "mcpServers": {
    "starknet": {
      "command": "node",
      "args": ["./packages/starknet-mcp-server/dist/index.js"],
      "env": {
        "STARKNET_RPC_URL": "https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

## Key Starknet Addresses

### Mainnet
- ETH: `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7`
- STRK: `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`
- USDC: `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8`
- USDT: `0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8`

### API Endpoints
- avnu Mainnet: `https://starknet.api.avnu.fi`
- avnu Sepolia: `https://sepolia.api.avnu.fi`
- avnu Paymaster Mainnet: `https://starknet.paymaster.avnu.fi`
- avnu Paymaster Sepolia: `https://sepolia.paymaster.avnu.fi`

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Cairo for contracts, not Solidity | Native to Starknet, leverages AA and ZK natively |
| MCP as primary integration protocol | Most portable -- works with Claude, ChatGPT, Cursor, OpenClaw |
| ERC-8004 for identity | Only standardized on-chain agent identity; Cairo impl exists |
| avnu for DeFi aggregation | Best Starknet DEX aggregator; SDK well-documented |
| Skills marketplace in-repo | Lower friction than separate registry; grow with ecosystem |
| pnpm workspaces for TS packages | Standard monorepo management; matches Daydreams/Lucid |
