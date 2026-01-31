# Starknet Agentic -- Development Context

## Project Overview

Starknet Agentic is the infrastructure layer for AI agents on Starknet. It provides smart contracts, SDK packages, MCP servers, and skills that enable AI agents to use Starknet as their financial rails.

## Repository Structure

```
starknet-agentic/
├── contracts/                    # Cairo smart contracts
│   ├── agent-wallet/             # Agent Account contract (AA + session keys)
│   └── agent-registry/           # ERC-8004 on Starknet (identity, reputation, validation)
├── packages/
│   ├── starknet-mcp-server/      # MCP server exposing Starknet tools
│   └── starknet-a2a/             # A2A protocol adapter
├── skills/                       # Claude Code / OpenClaw skills marketplace
│   ├── starknet-wallet/          # Wallet management skill
│   ├── starknet-defi/            # DeFi operations skill
│   └── starknet-identity/        # Agent identity skill
└── docs/                         # Specifications and architecture docs
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart contracts | Cairo 2.x (Scarb, snforge) |
| TypeScript packages | pnpm workspaces, tsup, TypeScript |
| MCP server | TypeScript, `@modelcontextprotocol/sdk` |
| Starknet interaction | starknet.js v8+, @avnu/avnu-sdk |
| Testing | snforge (Cairo), Vitest (TypeScript) |
| Skills | SKILL.md format (YAML frontmatter + markdown) |

## Key Dependencies

### Cairo Contracts
- `starknet` >= 2.12.1
- `openzeppelin` >= 0.20.0 (ERC-721, SRC5, ReentrancyGuard)
- `snforge_std` >= 0.43.1 (testing)

### TypeScript Packages
- `starknet` (starknet.js) >= 6.24.1
- `@avnu/avnu-sdk` -- DeFi aggregation (swaps, DCA, staking)
- `@modelcontextprotocol/sdk` -- MCP server SDK
- `zod` -- Schema validation

## Standards This Project Implements

### MCP (Model Context Protocol)
- Agent-to-tool connectivity standard by Anthropic
- Our MCP server exposes Starknet operations as tools
- Any MCP client (Claude, ChatGPT, Cursor, OpenClaw) can use them
- Spec: https://modelcontextprotocol.io/specification/2025-11-25

### A2A (Agent-to-Agent Protocol)
- Inter-agent communication standard by Google
- Agents publish capabilities via Agent Cards at `/.well-known/agent.json`
- Built on HTTP/SSE/JSON-RPC
- Spec: https://a2a-protocol.org/latest/

### ERC-8004 (Trustless Agents)
- On-chain agent identity and trust standard
- Three registries: Identity (ERC-721), Reputation (feedback), Validation (assessments)
- Reference Cairo implementation: https://github.com/Akashneelesh/erc8004-cairo
- EIP: https://eips.ethereum.org/EIPS/eip-8004

## Starknet Concepts

### Native Account Abstraction
Every Starknet account is a smart contract. This means:
- Custom validation logic per account (agents can have their own signing schemes)
- Session keys are first-class (temporary keys with limited permissions)
- Fee abstraction (paymasters can sponsor agent transactions)
- Nonce abstraction (parallel transaction execution)

### Session Keys
Temporary keys granting limited transaction permissions without per-action user signatures:
- Define allowed contract methods, time bounds, spending limits
- Critical for agent autonomy within safe bounds
- Cartridge Controller provides a production implementation

### Paymaster
Allows gas fees to be paid in any token or sponsored by a third party:
- AVNU paymaster supports USDC, USDT, STRK, ETH
- "Gasfree" mode: dApp sponsors all gas via API key
- Agents never need to hold ETH

## Development Guidelines

### Cairo Contracts
- Use OpenZeppelin Cairo components (ERC-721, access control, reentrancy guard)
- Test with snforge: `snforge test`
- Build with Scarb: `scarb build`
- Deploy with sncast to Sepolia first, then mainnet

### TypeScript Packages
- Use pnpm workspaces
- Build with tsup
- Test with Vitest
- Follow the Daydreams extension pattern for framework integrations

### Skills
- Follow the SKILL.md frontmatter convention
- Include keywords for activation triggers
- Layer documentation: SKILL.md (quick ref) + references/ (deep guides) + scripts/ (examples)
- Test scripts should be runnable standalone

## External Integrations

### Daydreams Framework
- Extension system: `extension({ name, contexts, actions, services, inputs, outputs })`
- StarknetChain class exists at `@daydreamsai/defai` (minimal: read/write only)
- We extend this with full DeFi actions and wallet management
- Docs: https://github.com/daydreamsai/daydreams

### Lucid Agents SDK
- Commerce SDK: wallets, payments (x402), identity, A2A
- Extension interface: `{ name, build(ctx) => runtime_slice }`
- WalletConnector interface for adding new chains
- Currently no Starknet support -- we add it
- Docs: https://github.com/daydreamsai/lucid-agents

### AVNU SDK
- DeFi aggregator for Starknet (swaps, DCA, staking, gasless/gasfree)
- `@avnu/avnu-sdk` npm package
- Key functions: getQuotes, executeSwap, quoteToCalls, executeCreateDca, executeStake
- Mainnet API: https://starknet.api.avnu.fi
- Sepolia API: https://sepolia.api.avnu.fi

### OpenClaw / MoltBook
- Skills follow AgentSkills convention (SKILL.md + YAML frontmatter)
- Publish to ClawHub for distribution to 157K+ agents
- MoltBook API: https://www.moltbook.com/api/v1
- MCP servers natively supported

## Key Contract Addresses (Sepolia)

Will be populated after deployment. Reference addresses:
- AVNU Router: Check https://app.avnu.fi for current addresses
- STRK Token: `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`
- ETH Token: `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7`

## Common Tasks

### Adding a new skill
1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter
2. Add `references/` directory with detailed guides
3. Add `scripts/` directory with runnable examples
4. Update README.md skills table

### Adding a new MCP tool
1. Define the tool schema in `packages/starknet-mcp-server/src/tools/`
2. Implement the handler
3. Register in the server's tool list
4. Add tests

### Adding a new Cairo contract
1. Create module in `contracts/<contract-name>/`
2. Add Scarb.toml with dependencies
3. Implement with tests
4. Add deployment script for Sepolia
