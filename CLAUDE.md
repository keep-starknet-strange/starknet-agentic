# Starknet Agentic -- Development Context

<identity>
Infrastructure layer for AI agents on Starknet. Provides Cairo smart contracts (ERC-8004 identity/reputation), MCP server, A2A adapter, and skills that enable any AI agent to hold wallets, transact, build reputation, and access DeFi on Starknet.
</identity>

<stack>

| Component | Technology | Version |
|-----------|-----------|---------|
| Smart contracts | Cairo (Scarb + snforge) | Cairo 2.12.1, Scarb 2.12.1 |
| Contract deps | OpenZeppelin Cairo | 0.20.0 |
| TypeScript packages | pnpm workspaces, tsup | Node 18+ |
| MCP server | `@modelcontextprotocol/sdk` | ^1.0.0 |
| Starknet interaction | starknet.js | ^6.24.1 |
| DeFi aggregation | `@avnu/avnu-sdk` | ^4.0.1 |
| Schema validation | zod | ^3.23.0 |
| TS testing | Vitest | -- |
| Cairo testing | snforge | 0.51.2 |
| Skills format | SKILL.md (YAML frontmatter + markdown) | AgentSkills spec |
| Website | Next.js 15 + React 19 + Tailwind | -- |

</stack>

<structure>

```
starknet-agentic/
├── packages/
│   ├── starknet-mcp-server/              # MCP server (TODO: implement tools)
│   ├── starknet-a2a/                     # A2A protocol adapter (TODO: implement)
│   └── starknet-identity/
│       └── erc8004-cairo/                # ERC-8004 Cairo contracts (PRODUCTION)
│           ├── src/                      # Contract source (identity, reputation, validation)
│           ├── tests/                    # 74 unit tests (snforge)
│           └── e2e-tests/               # 47 E2E tests (Sepolia)
├── contracts/                            # Future Cairo contracts (agent-wallet planned)
├── skills/
│   ├── starknet-wallet/SKILL.md          # Wallet management skill
│   ├── starknet-defi/SKILL.md            # DeFi operations skill
│   └── starknet-identity/SKILL.md        # Identity & reputation skill
├── references/
│   ├── agentskills/                      # AgentSkills format specs
│   └── starknet-docs/                    # Official Starknet docs (git submodule)
├── docs/
│   ├── SPECIFICATION.md                  # Technical architecture & component specs
│   └── AGENTIC_ECONOMY_PLAN.md           # Use cases, apps, token economy vision
├── website/                              # Next.js documentation site (Vercel)
├── AGENT.md                              # Agent mission & ecosystem context
├── CLAUDE.md                             # This file
└── package.json                          # Root monorepo (pnpm workspaces)
```

NOTE: The `contracts/` directory is currently empty. All production Cairo contracts live in `packages/starknet-identity/erc8004-cairo/`. The Agent Account contract (with session keys) is planned but not yet built.

</structure>

<commands>

| Task | Command | Working Directory |
|------|---------|-------------------|
| Install TS deps | `pnpm install` | repo root |
| Build TS packages | `pnpm build` | repo root |
| Test TS packages | `pnpm test` | repo root |
| Build Cairo contracts | `scarb build` | `packages/starknet-identity/erc8004-cairo/` |
| Test Cairo contracts | `snforge test` | `packages/starknet-identity/erc8004-cairo/` |
| Run specific Cairo test | `snforge test --filter test_name` | `packages/starknet-identity/erc8004-cairo/` |
| Build single TS package | `pnpm build` | `packages/<pkg>/` |
| Dev mode (website) | `pnpm dev` | `website/` |
| Deploy contracts (Sepolia) | `bash scripts/deploy_sepolia.sh` | `packages/starknet-identity/erc8004-cairo/` |

</commands>

<conventions>

### Cairo
- Use OpenZeppelin Cairo components (ERC-721, SRC5, ReentrancyGuard, access control)
- Contracts use `#[starknet::contract]` module pattern with component embedding
- Interfaces defined separately in `src/interfaces/` with `#[starknet::interface]` trait
- Tests use snforge `declare`, `deploy`, dispatchers pattern
- Use Poseidon hashing (not Pedersen) for new cryptographic operations
- Use `ByteArray` for string-like metadata keys

### TypeScript
- ESM-only (`"type": "module"` in package.json)
- Build with tsup targeting ESM format with `.d.ts` generation
- Use Zod for input validation on all MCP tool schemas
- starknet.js `Account` class for transaction signing
- `RpcProvider` for read-only operations

### Skills
- YAML frontmatter: `name`, `description`, `keywords`, `allowed-tools`, `user-invocable`
- Name format: lowercase, hyphens only, 1-64 chars
- Include code examples with starknet.js patterns
- Reference avnu SDK for all DeFi operations
- List error codes with recovery steps

### Git
- Conventional commits preferred (feat:, fix:, docs:, chore:)
- Branch from main for features
- Sepolia testing before any mainnet deployment

</conventions>

<standards>

This project implements three converging agent standards:

| Standard | Role | Spec |
|----------|------|------|
| **MCP** (Model Context Protocol) | Agent-to-tool connectivity | Anthropic standard. Our MCP server exposes Starknet ops as tools. |
| **A2A** (Agent-to-Agent Protocol) | Inter-agent communication | Google standard. Agent Cards at `/.well-known/agent.json`. |
| **ERC-8004** (Trustless Agents) | On-chain identity & trust | Three registries: Identity (ERC-721), Reputation (feedback), Validation (assessments). |

</standards>

<starknet_concepts>

- **Native Account Abstraction**: Every account is a smart contract. Custom validation, session keys, fee abstraction, nonce abstraction are all first-class.
- **Session Keys**: Temporary keys with limited permissions (allowed methods, time bounds, spending limits). Critical for agent autonomy. Cartridge Controller is the reference implementation.
- **Paymaster**: Gas fees paid in any token or sponsored by third party. avnu paymaster supports USDC/USDT/STRK/ETH. "Gasfree" mode = dApp sponsors all gas.
- **V3 Transactions**: Current transaction version. Fees paid in STRK (not ETH).

</starknet_concepts>

<contracts_detail>

### ERC-8004 Cairo Contracts (`packages/starknet-identity/erc8004-cairo/src/`)

| Contract | File | Lines | Purpose |
|----------|------|-------|---------|
| IdentityRegistry | `identity_registry.cairo` | 271 | ERC-721 agent NFT registry with key-value metadata |
| ReputationRegistry | `reputation_registry.cairo` | 560 | Feedback system with cryptographic auth & signatures |
| ValidationRegistry | `validation_registry.cairo` | 356 | Third-party validator assessments with request/response |

Key interfaces: `IIdentityRegistry`, `IReputationRegistry`, `IValidationRegistry` (in `src/interfaces/`)

Metadata schema keys: `agentName`, `agentType`, `version`, `model`, `status`, `framework`, `capabilities`, `a2aEndpoint`, `moltbookId`

</contracts_detail>

<key_addresses>

### Mainnet Tokens
- ETH: `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7`
- STRK: `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`
- USDC: `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8`
- USDT: `0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8`

### API Endpoints
- avnu Mainnet: `https://starknet.api.avnu.fi`
- avnu Sepolia: `https://sepolia.api.avnu.fi`
- avnu Paymaster Mainnet: `https://starknet.paymaster.avnu.fi`
- avnu Paymaster Sepolia: `https://sepolia.paymaster.avnu.fi`

</key_addresses>

<workflows>

### Adding a new skill
1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter
2. Follow AgentSkills spec in `references/agentskills/SPECS.md`
3. Include code examples, error handling, token addresses
4. Optionally add `references/` and `scripts/` subdirectories

### Adding a new MCP tool
1. Define tool schema with Zod in `packages/starknet-mcp-server/src/tools/`
2. Implement handler using starknet.js or avnu SDK
3. Register in the server's tool list
4. Add Vitest tests
5. Document in AGENT.md tool list

### Adding a new Cairo contract
1. Create module in `contracts/<contract-name>/` or extend existing in `packages/`
2. Add `Scarb.toml` with starknet 2.12.1 + openzeppelin 0.20.0 deps
3. Implement with `#[starknet::contract]` pattern
4. Write snforge tests (aim for >90% coverage)
5. Add Sepolia deployment script

### Running E2E tests (ERC-8004)
1. Ensure `.env` has Sepolia RPC URL, account address, private key
2. `cd packages/starknet-identity/erc8004-cairo/e2e-tests`
3. `pnpm install && pnpm test`

</workflows>

<boundaries>

### DO NOT modify
- `.env*` files (credentials -- use `.env.example` for templates)
- `packages/starknet-identity/erc8004-cairo/Scarb.lock` (dependency lock)
- `references/starknet-docs/` (git submodule -- update via `git submodule update`)
- Deployed contract addresses in production without team review

### Require human review
- Any contract deployment (Sepolia or mainnet)
- Changes to contract interfaces (breaking for deployed instances)
- Dependency version bumps in `Scarb.toml` or root `package.json`
- Security-sensitive code (key handling, signature verification, spending limits)

### Safe for agents
- Reading and analyzing any file
- Writing/editing TypeScript source, tests, skills, docs
- Writing/editing Cairo source and tests (not deploying)
- Running builds and tests
- Creating new skills following the established pattern

</boundaries>

<references>

| Reference | Path | Use When |
|-----------|------|----------|
| AgentSkills spec | `references/agentskills/SPECS.md` | Writing or validating skill YAML frontmatter |
| AgentSkills integration | `references/agentskills/INTEGRATION.md` | Building skill discovery/loading |
| Starknet docs | `references/starknet-docs/` | Any Starknet architecture, Cairo, or AA questions |
| Technical spec | `docs/SPECIFICATION.md` | Understanding planned architecture, interfaces, security model |
| Economy plan | `docs/AGENTIC_ECONOMY_PLAN.md` | Understanding long-term vision and use cases |
| Agent mission | `AGENT.md` | Understanding project goals, existing assets, gaps |

Always consult `references/` before relying on training data for Starknet-specific or AgentSkills-specific information.

</references>

<implementation_status>

| Component | Status | Location |
|-----------|--------|----------|
| ERC-8004 Cairo contracts | Production (74 unit + 47 E2E tests) | `packages/starknet-identity/erc8004-cairo/` |
| Skills (wallet, defi, identity) | Complete | `skills/` |
| Docs & specs | Complete | `docs/` |
| Website | Scaffolded | `website/` |
| MCP server | **TODO** (placeholder) | `packages/starknet-mcp-server/` |
| A2A adapter | **TODO** (placeholder) | `packages/starknet-a2a/` |
| Agent Account contract | **TODO** (designed in spec) | Not yet created |
| Framework extensions | **TODO** | Not yet created |
| CI/CD | **TODO** | No `.github/workflows/` yet |

</implementation_status>

<troubleshooting>

| Problem | Solution |
|---------|----------|
| `scarb build` fails with version mismatch | Ensure Scarb 2.12.1 installed. Check `Scarb.toml` edition. |
| snforge tests fail on deploy | Mock contracts must implement required interfaces. Check `src/mock/`. |
| pnpm install fails | Ensure pnpm installed globally. Node 18+ required. |
| E2E tests fail | Check `.env` has valid Sepolia RPC URL and funded account. |
| Git submodule empty (`references/starknet-docs/`) | Run `git submodule update --init --recursive` |
| starknet.js type errors | Ensure using starknet.js v6.x (not v5). Types changed significantly. |

</troubleshooting>
