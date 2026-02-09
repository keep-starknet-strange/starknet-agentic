# Starknet Agentic

Open-source stack for giving AI agents wallets, identity, reputation, and execution rails on Starknet.

## What This Repo Is

`starknet-agentic` is a monorepo with:

- Cairo smart contracts for agent wallets, identity, reputation, and validation
- TypeScript packages for MCP tools, A2A integration, and payment signing
- Reusable skills for common Starknet agent capabilities
- Examples and docs for integration

If you are integrating agents, this repo gives you contract primitives + runtime tooling in one place.

## What Works Today

Snapshot at time of this README update:

| Area | Path | Status |
|---|---|---|
| Agent Account contract | `contracts/agent-account` | Active, tested (110 Cairo tests) |
| ERC-8004 Cairo contracts | `contracts/erc8004-cairo` | Active, tested (131+ unit + 47 E2E tests) |
| Huginn registry contract | `contracts/huginn-registry` | Active, tested (6 Cairo tests) |
| MCP package | `packages/starknet-mcp-server` | Active |
| A2A package | `packages/starknet-a2a` | Active |
| Additional packages | `packages/*` | Active/MVP by package |
| Skills | `skills/*` | Mixed (complete + template) |

## Architecture (Current)

```text
┌─────────────────────────────────────────────────────────┐
│                 Agent Frameworks / Apps                │
│   OpenClaw / MoltBook  |  Daydreams  |  Lucid  |  ...  │
├─────────────────────────────────────────────────────────┤
│                Integration + Runtime Layer             │
│      MCP Server      |       A2A Adapter       | Skills│
├─────────────────────────────────────────────────────────┤
│                 Packages / Tooling Layer               │
│   Wallet + Payments  |  Identity Clients  | Utilities  │
├─────────────────────────────────────────────────────────┤
│                 Cairo Contract Layer                   │
│ Agent Account | ERC-8004 Registries | Huginn Registry  │
├─────────────────────────────────────────────────────────┤
│                       Starknet L2                      │
└─────────────────────────────────────────────────────────┘
```

## Standards Compatibility

| Standard | Purpose | Where in this repo |
|---|---|---|
| [MCP](https://modelcontextprotocol.io/) | Agent-to-tool execution | `packages/starknet-mcp-server` |
| [A2A](https://a2a-protocol.org/) | Agent-to-agent workflows | `packages/starknet-a2a` |
| [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) | Agent identity, reputation, validation | `contracts/erc8004-cairo` |

## Cross-Chain Interop Strategy

We are implementing a parity-core approach for ERC-8004 so integrations can be reused across EVM networks and Starknet, while keeping Starknet-native capabilities as opt-in extensions.

- Goal: portability of agent integrations without giving up Starknet strengths (native account abstraction, Cairo-native patterns, lower execution cost).
- Scope: API semantics align by default; chain-local state (reputation/validation history) remains chain-scoped unless explicitly aggregated off-chain.
- Tracking plan: `#78` in this repository.

## Skills At A Glance

| Skill | Purpose | Status |
|---|---|---|
| `starknet-wallet` | Wallet management, session keys, transfers, balances | Complete |
| `starknet-mini-pay` | P2P payments, invoices, QR flows, Telegram support | Complete |
| `starknet-anonymous-wallet` | Privacy-focused wallet operations | Complete |
| `starknet-defi` | DeFi actions (swaps/staking/lending/LP) | Template |
| `starknet-identity` | ERC-8004 identity/reputation/validation workflows | Template |
| `huginn-onboard` | Huginn onboarding flow | In Progress |

Full definitions and usage are in `skills/*/SKILL.md`.

## Skills Marketplace

The `skills/` directory is a marketplace of Starknet capabilities for agent runtimes that support skill-style tool packs (for example AgentSkills-compatible workflows).

Install pattern:

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/<skill-name>
```

Example:

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/starknet-wallet
```

<<<<<<< HEAD
=======
## Examples

| Example | Description | Path |
|---------|-------------|------|
| [DeFi Agent](./examples/defi-agent/) | Autonomous triangular arbitrage agent with risk management | `examples/defi-agent/` |
| Hello Agent | Minimal E2E proof of concept | `examples/hello-agent/` |

The **DeFi Agent** is the flagship example demonstrating how to build production-ready autonomous agents on Starknet. It monitors ETH↔STRK prices and executes profitable arbitrage trades.

>>>>>>> origin/main
## Repository Layout

```text
starknet-agentic/
├── contracts/
│   ├── agent-account/
│   ├── erc8004-cairo/
│   └── huginn-registry/
├── packages/
│   ├── starknet-mcp-server/
│   ├── starknet-a2a/
│   ├── starknet-agent-passport/
│   ├── x402-starknet/
│   └── prediction-arb-scanner/
├── skills/
├── examples/
├── docs/
└── website/
```

## Quick Start

### 1) Install dependencies

```bash
pnpm install
```

### 2) Run JS/TS monorepo checks

```bash
pnpm run build
pnpm run test
```

### 3) Run Cairo checks locally

```bash
cd contracts/erc8004-cairo && scarb build && snforge test
cd ../agent-account && scarb build && snforge test
cd ../huginn-registry && scarb build && snforge test
```

### 4) Run MCP package in dev mode

```bash
pnpm --filter @starknet-agentic/mcp-server dev
```

## MCP Tools Snapshot

Current MCP package (`@starknet-agentic/mcp-server`) exposes tools across:

- balances and transfers
- contract read/write calls
- swap and quote flows
- fee estimation
- x402 Starknet payment signing

See package source/docs for exact tool names and request schemas:

- `packages/starknet-mcp-server/`

## External Foundations

These projects are important dependencies or ecosystem foundations for this repo:

| Project | Role |
|---|---|
| [starknet.js](https://github.com/starknet-io/starknet.js) | TS SDK used across packages |
| [OpenZeppelin Cairo](https://github.com/OpenZeppelin/cairo-contracts) | Base contract components/patterns |
| [Daydreams](https://github.com/daydreamsai/daydreams) | Agent framework integration target |
| [Lucid Agents](https://github.com/daydreamsai/lucid-agents) | Commerce + wallet interoperability target |
| [OpenClaw / MoltBook](https://docs.openclaw.ai/) | Skill distribution and agent ecosystem |
| [Cartridge Controller](https://docs.cartridge.gg/controller/getting-started) | Session-key wallet patterns on Starknet |

## Contract Docs and Deployments

For contract-specific behavior and deployment addresses:

- `contracts/erc8004-cairo/README.md`
- `contracts/agent-account/README.md`
- `contracts/huginn-registry/README.md` (if present in this branch)

## Contributing

- Start with `CONTRIBUTING.md`
- Roadmap: `docs/ROADMAP.md`
- Good first tasks: `docs/GOOD_FIRST_ISSUES.md`
