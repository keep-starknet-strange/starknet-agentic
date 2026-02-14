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

Snapshot as of 2026-02-10:

| Area | Path | Status |
|---|---|---|
| Agent Account contract | `contracts/agent-account` | Active, tested (110 Cairo tests) |
| ERC-8004 Cairo contracts | `contracts/erc8004-cairo` | Active, tested (131+ unit + 47 E2E tests) |
| Huginn registry contract | `contracts/huginn-registry` | Active, tested (6 Cairo tests) |
| MCP package | `packages/starknet-mcp-server` | Active (9 tools, input validation) |
| A2A package | `packages/starknet-a2a` | Active |
| CLI scaffolding | `packages/create-starknet-agent` | Complete (npm publish pending) |
| Additional packages | `packages/*` | Active/MVP by package |
| Skills | `skills/*` | 3 complete + 2 template + 1 onboarding |
| Onboarding examples | `examples/onboard-agent`, `crosschain-demo` | Working (with CI smoke tests) |
| CI/CD | `.github/workflows/` | 11 jobs + daily health check |

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

## ERC-8004: Parity + Starknet Extensions

All three ERC-8004 registries (Identity, Reputation, Validation) are implemented in Cairo with API-level parity to the [Solidity reference](https://eips.ethereum.org/EIPS/eip-8004). On top of parity, Starknet's native account abstraction enables extensions that EVM deployments cannot offer:

- **Session keys**: Agents operate with scoped, revocable credentials -- spending cap per token, expiry, contract/selector restrictions -- instead of raw private keys. If a session key leaks, the attacker gets a bounded credential that the owner can revoke instantly. The master key never leaves the owner.
- **Domain-separated wallet binding**: `set_agent_wallet` includes chain_id + contract_address + nonce in the signature hash, preventing cross-chain and cross-registry replay.
- **Bounded reads**: Paginated summary APIs for production-scale reputation and validation queries.

Full compatibility matrix, session key details, and cross-chain notes: **[docs/ERC8004-PARITY.md](docs/ERC8004-PARITY.md)**

Tracking issue: [#78](https://github.com/keep-starknet-strange/starknet-agentic/issues/78)

## Skills At A Glance

| Skill | Purpose | Status |
|---|---|---|
| `starknet-wallet` | Wallet management, session keys, transfers, balances | Complete |
| `starknet-mini-pay` | P2P payments, invoices, QR flows, Telegram support | Complete |
| `starknet-anonymous-wallet` | Privacy-focused wallet operations | Complete |
| `starknet-defi` | DeFi actions (swaps/staking/lending/LP) | Template |
| `starknet-identity` | ERC-8004 identity/reputation/validation workflows | Template |
| `huginn-onboard` | Cross-chain onboarding and Huginn registry integration | Complete |

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

## Examples

| Example | Description | Path |
|---------|-------------|------|
| [DeFi Agent](./examples/defi-agent/) | Autonomous triangular arbitrage agent with risk management | `examples/defi-agent/` |
| Hello Agent | Minimal E2E proof of concept | `examples/hello-agent/` |
| [Onboard Agent](./examples/onboard-agent/) | E2E agent onboarding: deploy account, register identity, first action | `examples/onboard-agent/` |
| [Crosschain Demo](./examples/crosschain-demo/) | Base Sepolia ↔ Starknet ERC-8004 cross-chain registration flow | `examples/crosschain-demo/` |

The **DeFi Agent** is the flagship example demonstrating how to build production-ready autonomous agents on Starknet. The **Onboard Agent** shows the full lifecycle from account deployment to identity registration with AVNU gasfree support.

## Repository Layout

```text
starknet-agentic/
├── contracts/
│   ├── agent-account/                    # Agent account with session keys (110 tests)
│   ├── erc8004-cairo/                    # Identity, reputation, validation (131+ unit + 47 E2E)
│   └── huginn-registry/                  # Thought provenance registry
├── packages/
│   ├── create-starknet-agent/            # CLI scaffolding tool
│   ├── starknet-mcp-server/              # MCP server (9 tools)
│   ├── starknet-a2a/                     # A2A protocol adapter
│   ├── starknet-agent-passport/          # Capability metadata client
│   ├── x402-starknet/                    # X-402 payment protocol
│   └── prediction-arb-scanner/           # Cross-venue arb detection
├── skills/                               # 6 skills (3 complete, 2 template, 1 onboarding)
├── examples/                             # 4 examples + scaffold reference
├── docs/                                 # Roadmap, spec, getting started, troubleshooting
└── website/                              # Next.js documentation site
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

Validation: dependency-review live run check (2026-02-14).
