# Starknet Agentic

Build AI agents that can operate on Starknet with wallets, identity, and payment tools.

## What This Repo Contains

- Cairo contracts for agent accounts and ERC-8004 identity/reputation/validation.
- TypeScript packages for MCP tools, A2A adapter, payment signing, and agent passport metadata.
- Reusable Starknet skills for wallet, payments, identity, and DeFi workflows.
- Examples and a documentation website.

## Current Status

| Component | Path | Status | Test Coverage Snapshot |
|---|---|---|---|
| Agent Account (session keys, policy enforcement) | `contracts/agent-account` | Active | 96 Cairo tests |
| ERC-8004 Cairo (Identity/Reputation/Validation) | `contracts/erc8004-cairo` | Active | 126 Cairo tests |
| Huginn Registry | `contracts/huginn-registry` | Active | 6 Cairo tests |
| MCP Server | `packages/starknet-mcp-server` | Active | Vitest suite in package |
| A2A Adapter | `packages/starknet-a2a` | Active | Vitest suite in package |
| Skills | `skills/*` | Mixed (complete + template) | See each `SKILL.md` |

## Skills At A Glance

| Skill | Purpose | Status |
|---|---|---|
| `starknet-wallet` | Wallet management, session keys, transfers, balances | Complete |
| `starknet-mini-pay` | P2P payments, invoices, QR flows, Telegram support | Complete |
| `starknet-anonymous-wallet` | Privacy-focused wallet operations | Complete |
| `starknet-defi` | DeFi actions (swaps/staking/lending/LP) | Template |
| `starknet-identity` | ERC-8004 identity, reputation, validation workflows | Template |
| `huginn-onboard` | Agent onboarding flow for Huginn patterns | In Progress |

Full definitions and usage: `skills/` (each skill has its own `SKILL.md`).

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Run monorepo checks

```bash
pnpm run build
pnpm run test
```

### 3. Run Cairo checks locally

```bash
cd contracts/erc8004-cairo && scarb build && snforge test
cd ../agent-account && scarb build && snforge test
cd ../huginn-registry && scarb build && snforge test
```

### 4. Run the MCP server package in dev mode

```bash
pnpm --filter @starknet-agentic/mcp-server dev
```

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

## Standards and Integrations

This repo is built to work across the current agent stack:

- MCP for tool execution (`packages/starknet-mcp-server`)
- A2A for agent-to-agent patterns (`packages/starknet-a2a`)
- ERC-8004 for on-chain identity and trust (`contracts/erc8004-cairo`)

## Deployment and Contract Details

For contract-specific documentation (interfaces, behavior, network addresses), see:

- `contracts/erc8004-cairo/README.md`
- `contracts/agent-account/README.md`

## Contributing

- Start with `CONTRIBUTING.md`
- Roadmap: `docs/ROADMAP.md`
- Good first tasks: `docs/GOOD_FIRST_ISSUES.md`
