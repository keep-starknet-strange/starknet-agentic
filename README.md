# Starknet Agentic

**The infrastructure layer for the agentic era on Starknet.**

Starknet Agentic provides everything needed to build AI agents that use Starknet as their financial rails. It consolidates skills, smart contracts, SDKs, and integration primitives that enable agents to transact, hold identity, build reputation, and interact with DeFi protocols on Starknet.

## Why Starknet for AI Agents?

Starknet has structural advantages that make it uniquely suited as the financial backbone for autonomous AI agents:

- **Native Account Abstraction** -- Every account is a smart contract. Session keys, custom validation, fee abstraction, and nonce abstraction are first-class citizens. No EOA legacy.
- **ZK-Provable Compute** -- The S-two prover enables zkML via Giza's LuminAIR framework, allowing agents to prove their ML inference on-chain.
- **Performance** -- 2-second confirmations, 992 peak TPS, sub-cent transaction costs. Agents need fast, cheap transactions to be economically viable.
- **Paymaster Support** -- Agents don't need to hold ETH. Gas can be paid in any token or sponsored by dApps.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Agent Platforms                       │
│  OpenClaw/MoltBook  │  Daydreams  │  Lucid Agents  │ …  │
├─────────────────────────────────────────────────────────┤
│                  Integration Layer                       │
│    MCP Server    │   A2A Protocol   │   Claude Skills    │
├─────────────────────────────────────────────────────────┤
│                  Starknet Agentic SDK                    │
│  Wallet Mgmt  │  DeFi Actions  │  Identity  │  Payments │
├─────────────────────────────────────────────────────────┤
│                  Smart Contracts (Cairo)                  │
│  Agent Account  │  Agent Registry  │  Reputation  │  …   │
├─────────────────────────────────────────────────────────┤
│                      Starknet L2                         │
└─────────────────────────────────────────────────────────┘
```

## Contributing

- Start here: `CONTRIBUTING.md`
- Quick tasks: `docs/GOOD_FIRST_ISSUES.md`
- Direction: `docs/ROADMAP.md`

## Repository Structure

```
starknet-agentic/
├── contracts/                    # Cairo smart contracts
│   ├── agent-wallet/             # Agent Account with session keys, spending limits
│   └── agent-registry/           # On-chain agent identity & reputation (ERC-8004 on Starknet)
├── packages/
│   ├── starknet-mcp-server/      # MCP server for Starknet tools
│   └── starknet-a2a/             # A2A protocol adapter for Starknet agents
├── skills/                       # Starknet Skills Marketplace
│   ├── starknet-wallet/          # Wallet management skill
│   ├── starknet-defi/            # DeFi operations skill
│   └── starknet-identity/        # Agent identity & reputation skill
└── docs/                         # Architecture and specification docs
```

## Skills Marketplace

The skills directory is a marketplace of Starknet capabilities for AI agents. Skills follow the [AgentSkills convention](https://docs.openclaw.ai/tools/skills) -- each skill is a `SKILL.md` file with YAML frontmatter plus supporting references and scripts.

Install any skill:

```bash
npx skills add starknet-agentic/skills/starknet-wallet
npx skills add starknet-agentic/skills/starknet-defi
npx skills add starknet-agentic/skills/starknet-identity
```

### Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| **starknet-wallet** | Create and manage agent wallets, session keys, transfers, balances | Planned |
| **starknet-defi** | Token swaps (avnu), staking, lending, LP management | Planned |
| **starknet-identity** | On-chain agent registration, reputation, validation (ERC-8004) | Planned |

## Smart Contracts

### Agent Account (`contracts/agent-wallet/`)

A purpose-built Cairo account contract for AI agents with:

- Session key management with configurable policies (allowed methods, time bounds, spending limits)
- Emergency kill switch for the human owner
- Allowlisted contract interactions
- Paymaster integration (agents don't need ETH)
- Event logging for reputation systems

### Agent Registry (`contracts/agent-registry/`)

Cairo implementation of the ERC-8004 Trustless Agents concept on Starknet:

- **Identity Registry** -- Agents as ERC-721 NFTs with on-chain metadata
- **Reputation Registry** -- Feedback system with cryptographic authorization
- **Validation Registry** -- Third-party validator assessments with support for zkML, TEE, and staker verification

## Packages

### Starknet MCP Server (`packages/starknet-mcp-server/`)

An [MCP](https://modelcontextprotocol.io/) server that exposes Starknet operations as tools for any MCP-compatible agent (Claude, ChatGPT, Cursor, OpenClaw, etc.):

- `starknet_get_balance` -- Check token balances
- `starknet_transfer` -- Send tokens
- `starknet_deploy_contract` -- Deploy Cairo contracts
- `starknet_call_contract` -- Read contract state
- `starknet_swap` -- Execute swaps via avnu aggregator
- `starknet_register_agent` -- Register agent on-chain (ERC-8004)

### Starknet A2A Adapter (`packages/starknet-a2a/`)

[A2A protocol](https://a2a-protocol.org/) adapter for Starknet-native agents:

- Agent Card generation from on-chain identity
- Task management over Starknet transactions
- Discovery via `/.well-known/agent.json`

## Standards Compatibility

This project is designed to work with the emerging agent standards stack:

| Standard | Purpose | Integration |
|----------|---------|-------------|
| [MCP](https://modelcontextprotocol.io/) | Agent-to-tool connectivity | Starknet MCP Server |
| [A2A](https://a2a-protocol.org/) | Agent-to-agent communication | A2A Adapter + Agent Cards |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | On-chain agent identity & trust | Agent Registry contracts |

## Platform Integrations

### Daydreams

[Daydreams](https://github.com/daydreamsai/daydreams) is a TypeScript AI agent framework with composable contexts and an extension system. Starknet Agentic provides a Daydreams extension with wallet context, DeFi actions, and on-chain event subscriptions.

### Lucid Agents

[Lucid Agents](https://github.com/daydreamsai/lucid-agents) is the commerce SDK for agents -- wallets, payments, and identity. Currently supports EVM and Solana. Starknet Agentic adds Starknet as a first-class network with native wallet connectors and payment rails.

### OpenClaw / MoltBook

[OpenClaw](https://docs.openclaw.ai/) is the agent framework powering [MoltBook](https://www.moltbook.com/) (157K+ AI agents). Starknet skills are publishable to [ClawHub](https://clawhub.ai) for instant distribution. MoltBook agents can connect to Starknet wallets via our OpenClaw skill.

## Existing Primitives

These projects provide foundational components that this repository builds upon:

| Project | What It Provides | Link |
|---------|-----------------|------|
| **Daydreams** | Agent framework with `StarknetChain` class | [GitHub](https://github.com/daydreamsai/daydreams) |
| **Lucid Agents** | Commerce SDK (wallet connectors, x402 payments, A2A) | [GitHub](https://github.com/daydreamsai/lucid-agents) |
| **avnu Skill** | Claude Code skill for Starknet DeFi (swaps, DCA, staking) | [GitHub](https://github.com/avnu-labs/avnu-skill) |
| **ERC-8004 Cairo** | Agent identity/reputation/validation contracts | [GitHub](https://github.com/Akashneelesh/erc8004-cairo) |
| **Snak** | MCP-native Starknet agent toolkit | [GitHub](https://github.com/KasarLabs/snak) |
| **Cartridge Controller** | Smart wallet with session keys | [Docs](https://docs.cartridge.gg/controller/getting-started) |
| **Giza** | zkML and verifiable AI agents | [Website](https://www.gizatech.xyz/) |
| **starknet.js** | JavaScript/TypeScript SDK for Starknet | [GitHub](https://github.com/starknet-io/starknet.js) |
| **starknet.py** | Python SDK for Starknet | [GitHub](https://github.com/software-mansion/starknet.py) |

## Reference Documentation

- [Starknet AI Portal](https://www.starknet.io/verifiable-ai-agents/) -- Official Starknet AI agent ecosystem
- [OpenClaw Documentation](https://docs.openclaw.ai/) -- Agent framework docs
- [MoltBook](https://www.moltbook.com/) -- AI agent social network
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25) -- Model Context Protocol
- [A2A Protocol](https://a2a-protocol.org/latest/) -- Agent-to-Agent Protocol
- [ERC-8004 EIP](https://eips.ethereum.org/EIPS/eip-8004) -- Trustless Agents standard
- [Starknet Native AA](https://www.starknet.io/blog/native-account-abstraction/) -- Account Abstraction
- [Session Keys on Starknet](https://www.starknet.io/blog/session-keys-on-starknet-unlocking-gasless-secure-transactions/) -- Session key patterns

## Getting Started

```bash
# Clone the repository
git clone https://github.com/your-org/starknet-agentic.git
cd starknet-agentic

# Install dependencies (when packages are ready)
pnpm install

# Start the MCP server (when ready)
pnpm --filter starknet-mcp-server dev
```

## Roadmap

### Phase 1: Foundation
- [ ] Agent Account contract (Cairo) with session keys
- [ ] Agent Registry contract (ERC-8004 on Starknet)
- [ ] Starknet MCP Server (balance, transfer, contract calls)
- [ ] Starknet wallet skill for Claude Code / OpenClaw

### Phase 2: DeFi Integration
- [ ] avnu swap integration in MCP server
- [ ] Staking actions (STRK, liquid staking)
- [ ] Lending protocol actions (zkLend, Nostra)
- [ ] DeFi skill for Claude Code / OpenClaw

### Phase 3: Agent Commerce
- [ ] A2A adapter for Starknet agents
- [ ] Agent-to-agent payment channels
- [ ] Lucid Agents Starknet extension (wallet connector, payments)
- [ ] Daydreams Starknet extension (full DeFi actions)

### Phase 4: Ecosystem
- [ ] MoltBook Starknet agent (ecosystem bot)
- [ ] ClawHub skill publication
- [ ] Cross-chain agent identity bridge (EVM <-> Starknet)
- [ ] zkML integration via Giza LuminAIR

## Contributing

Contributions are welcome. See the project's CLAUDE.md and AGENT.md for development context.

## License

MIT
