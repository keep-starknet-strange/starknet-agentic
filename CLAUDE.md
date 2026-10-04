# Starknet Agentic -- Development Context

Canonical behavioral instructions live in `AGENTS.md`, imported here so Claude
Code loads them: @AGENTS.md

This file provides repository implementation context and operational references.
Keep it factual: no line/test/tool counts or status labels; point at the source
of truth instead.

<identity>
Infrastructure layer for AI agents on Starknet. Provides Cairo smart contracts (ERC-8004 identity/reputation/validation, agent and session-key accounts), an MCP server, an A2A adapter, and installable skills that let any AI agent hold wallets, transact, build reputation, and access DeFi on Starknet.
</identity>

<stack>

Selected versions for orientation; the source-of-truth files define the exact pins.

| Component | Technology | Source of truth |
|-----------|-----------|-----------------|
| Smart contracts | Cairo 2.14 (Scarb 2.14.0), Starknet Foundry 0.64.0 | `contracts/*/Scarb.toml`, CI workflow |
| Contract deps | OpenZeppelin Cairo v3.0.0 | `contracts/*/Scarb.toml` |
| Runtime | Node.js 24+, pnpm 10 (corepack) | `.nvmrc`, root `package.json` |
| TS toolchain | TypeScript 6, tsup (ESM + `.d.ts`), Vitest 5 | `package.json` files |
| Starknet interaction | starknet.js v10 | `package.json` files |
| MCP server | `@modelcontextprotocol/sdk` 1.x | `packages/starknet-mcp-server/package.json` |
| DeFi aggregation | `@avnu/avnu-sdk` 4.x | `packages/starknet-mcp-server/package.json` |
| Schema validation | zod v4 | `package.json` files |
| Skills format | `SKILL.md` (YAML frontmatter + markdown) | `references/agentskills/SPECS.md` |
| Python tooling | Python 3 (skill validation, evals) | `requirements.txt`, `requirements-lock.txt` |
| Website | Next.js 16, React 19, Tailwind CSS 4 | `website/package.json` |

Folders outside the pnpm workspace (`contracts/*/scripts/`, `contracts/erc8004-cairo/e2e-tests/`,
`skills/*/package.json`) pin their own, sometimes older, starknet.js majors.

</stack>

<structure>

Directory purpose only; each directory's README has details.

```
starknet-agentic/
├── packages/                      # pnpm workspace TypeScript packages (ESM)
│   ├── create-starknet-agent/     # CLI scaffolder
│   ├── starknet-mcp-server/       # MCP server exposing Starknet operations as tools
│   ├── starknet-a2a/              # A2A adapter (Agent Cards backed by ERC-8004)
│   ├── starknet-agent-passport/   # Capability metadata conventions on IdentityRegistry
│   ├── starknet-onboarding-utils/ # Preflight, factory deploy, first-action helpers
│   ├── x402-starknet/             # x402 payment header helpers
│   ├── prediction-arb-scanner/    # Signals-only prediction-market arb scanner
│   ├── session-account-e2e/       # Session-key signer/invoke helper for scripts/e2e_test_runner.sh (private)
│   └── shared/                    # Internal shared utilities (private)
├── contracts/                     # Independent Scarb packages
│   ├── erc8004-cairo/             # ERC-8004 registries, e2e-tests/, deploy scripts/
│   ├── agent-account/             # Agent account + factory (session keys, timelocked upgrades)
│   ├── session-account/           # Session-key account with per-token spending policy
│   └── huginn-registry/           # Thought-provenance registry (experimental)
├── skills/                        # One directory per skill (SKILL.md); README.md catalog, manifest.json index
├── SKILL.md, llms.txt             # Root skill router and LLM index
├── .agents/skills/                # Codex discovery symlinks -> skills/*
├── .claude-plugin/, commands/     # Claude Code plugin manifests and slash commands
├── examples/                      # Runnable demos (pnpm workspace members)
├── spec/                          # Signer API/auth, session-signature, interop schemas + vectors
├── datasets/, evals/              # Cairo audit corpora; skill benchmarks, scorecards, reports
├── scripts/                       # Deploy, quality gates, skill validation, security evidence, site build
├── security/, tools/              # Dependency audit allowlist; vendored ajv-cli
├── docs/                          # Architecture, roadmap, guides, security runbooks
├── website/                       # Next.js docs site (has its own CLAUDE.md)
└── references/                    # AgentSkills spec + starknet-docs (git submodule)
```

Skills (catalog: `skills/README.md`):
- Starknet app/agent: `starknet-js`, `starknet-wallet`, `starknet-defi`, `starknet-identity`, `snip-36`, `starknet-mini-pay`, `starknet-tongo`, `starknet-anonymous-wallet`, `controller-cli`, `huginn-onboard`, `starkzap-sdk`
- Cairo: `cairo-contract-authoring`, `cairo-testing`, `cairo-optimization`, `cairo-deploy`, `cairo-auditor`, `account-abstraction`, `starknet-network-facts`

Examples: `hello-agent`, `onboard-agent`, `crosschain-demo`, `defi-agent`, `carry-agent`, `controller-calls`, `erc8004-validation-demo`, `full-stack-swarm`, `secure-defi-demo`, `starkzap-onboard-transfer`.

</structure>

<commands>

| Task | Command | Working Directory |
|------|---------|-------------------|
| Install TS deps | `pnpm install` | repo root |
| Build all TS packages (CI typecheck) | `pnpm build` | repo root |
| Test all TS packages | `pnpm test` | repo root |
| Lint packages (as CI) | `pnpm -r --if-present --filter './packages/*' lint` | repo root |
| Build/test one package | `pnpm --filter <package-name> build` (or `test`) | repo root |
| Website dev / build | `pnpm dev` / `pnpm build` | `website/` |
| Build Cairo contracts | `scarb build` | `contracts/<package>/` |
| Test Cairo contracts | `snforge test` | `contracts/<package>/` |
| Run matching Cairo tests | `snforge test <name-filter>` | `contracts/<package>/` |
| Minimal agent demo | `pnpm demo:hello-agent` | repo root |
| Deploy ERC-8004 registries (Sepolia) | `bash scripts/deploy_sepolia.sh` | `contracts/erc8004-cairo/` |
| Deploy SessionAccount (Sepolia) | `bash scripts/deploy_sepolia.sh` | repo root |
| Scaffold new agent | `npx @starknetfoundation/create-starknet-agent@latest` | any |

</commands>

<conventions>

### Cairo
- Use OpenZeppelin Cairo components (ERC-721, SRC5, ReentrancyGuard, access control)
- Contracts use the `#[starknet::contract]` module pattern with component embedding
- Interfaces are `#[starknet::interface]` traits kept apart from implementations (`src/interfaces/` or `src/interfaces.cairo`)
- Tests use snforge `declare`, `deploy`, and dispatchers
- Use Poseidon hashing (not Pedersen) for new cryptographic operations
- Use `ByteArray` for string-like metadata keys

### TypeScript
- ESM-only (`"type": "module"`); build with tsup to ESM with `.d.ts`
- Validate env/config and untrusted input with Zod
- starknet.js object-form constructors: `new Account({ provider, address, signer })`, `new Contract({ abi, address, providerOrAccount })`
- `RpcProvider` for read-only operations

### Skills
- YAML frontmatter: `name`, `description`, `keywords`, `allowed-tools`, `user-invocable`
- Name format: lowercase, hyphens only, 1-64 chars
- Include starknet.js code examples, reference the avnu SDK for DeFi, list error codes with recovery steps

### Git and deployment
See `AGENTS.md` ("Git and Deployment").

</conventions>

<standards>

- **MCP** (Model Context Protocol): agent-to-tool connectivity; our MCP server exposes Starknet operations as tools.
- **A2A** (Agent-to-Agent Protocol): inter-agent communication; Agent Cards at `/.well-known/agent.json`.
- **ERC-8004** (Trustless Agents): Identity (ERC-721), Reputation (feedback), Validation (assessments) registries. See `docs/ERC8004-PARITY.md`.

</standards>

<starknet_concepts>

- **Native Account Abstraction**: every account is a smart contract; custom validation, session keys, fee and nonce abstraction are first-class.
- **Session Keys**: temporary keys with limited permissions (allowed methods, time bounds, spending limits). Critical for agent autonomy.
- **Paymaster**: gas paid in a supported token or sponsored by a third party (avnu paymaster). "Gasfree"/sponsored = dApp pays gas.
- **V3 Transactions**: current transaction version; fees paid in STRK.

</starknet_concepts>

<contracts_detail>

| Package | Main sources | Purpose |
|---------|--------------|---------|
| `contracts/erc8004-cairo` | `identity_registry.cairo`, `reputation_registry.cairo`, `validation_registry.cairo`, `interfaces/` | ERC-8004 registries (`IIdentityRegistry`, `IReputationRegistry`, `IValidationRegistry`) |
| `contracts/agent-account` | `agent_account.cairo`, `agent_account_factory.cairo`, `session_key.cairo` | Agent account; factory deploys an account and registers its ERC-8004 identity |
| `contracts/session-account` | `account.cairo`, `spending_policy/` | Session-key account with per-token spending policy |
| `contracts/huginn-registry` | `src/` | Thought-provenance registry |

ERC-8004 metadata keys used by the MCP server and skills: `agentName`, `agentType`, `version`, `model`, `status`, `framework`, `capabilities`, `a2aEndpoint`, `moltbookId`.

Deployed addresses and class hashes: `docs/DEPLOYMENT_TRUTH_SHEET.md`.

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
1. Create `skills/<skill-name>/SKILL.md` with YAML frontmatter (spec: `references/agentskills/SPECS.md`); optionally add `references/` and `scripts/`
2. Add the `.agents/skills/<skill-name>` symlink and list the skill in `.claude-plugin/plugin.json`
3. From repo root (`python3 -m pip install -r requirements.txt` first in a fresh env):
   ```bash
   python3 scripts/skills_manifest.py --write
   python3 scripts/quality/validate_skills.py
   python3 scripts/skills_manifest.py --check
   python3 scripts/quality/check_codex_distribution.py
   python3 -m unittest scripts/quality/test_codex_distribution.py
   python3 scripts/quality/validate_marketplace.py
   ```

### Adding a new MCP tool
1. Define the tool: name, description, input schema; validate arguments with Zod
2. Implement the handler with starknet.js or the avnu SDK
3. Register the tool with the server
4. Add Vitest tests
5. Document the tool in the server README

See `packages/starknet-mcp-server/README.md` for where tool definitions live.

### Adding a new Cairo contract
1. Create a Scarb package under `contracts/<contract-name>/` matching existing pins (starknet 2.14.0, OpenZeppelin v3.0.0, snforge_std 0.64.0)
2. Implement with the `#[starknet::contract]` pattern
3. Write snforge tests (aim for >90% coverage)
4. Add a CI build/test job and a Sepolia deployment script

### Running E2E tests
See `docs/E2E_TESTING_GUIDE.md` (ERC-8004 registries and SessionAccount spending policy on Sepolia).

</workflows>

<boundaries>

### DO NOT modify
- `.env*` files (credentials -- use `.env.example` for templates)
- `contracts/*/Scarb.lock` (dependency locks)
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
| Agent mission + coordination | `AGENTS.md` | Goals, roles, required validation per change type |
| AgentSkills spec / integration | `references/agentskills/SPECS.md`, `INTEGRATION.md` | Skill frontmatter; skill discovery/loading |
| Starknet docs | `references/starknet-docs/` | Starknet architecture, Cairo, or AA questions |
| Skills catalog + install | `skills/README.md` | Choosing, installing, distributing skills |
| Technical spec | `docs/SPECIFICATION.md` | Architecture, interfaces, security model |
| ERC-8004 parity | `docs/ERC8004-PARITY.md` | Cross-chain compatibility, Starknet extensions |
| Deployments | `docs/DEPLOYMENT_TRUTH_SHEET.md` | Deployed addresses and class hashes |
| Getting started / E2E | `docs/GETTING_STARTED.md`, `docs/E2E_TESTING_GUIDE.md` | Onboarding; Sepolia end-to-end runs |
| Troubleshooting | `docs/TROUBLESHOOTING.md`, `skills/TROUBLESHOOTING.md` | Runtime/build issues; skill install issues |
| Security runbooks | `docs/security/` | Signer, deployment, spending-policy evidence |

Always consult `references/` before relying on training data for Starknet-specific or AgentSkills-specific information.

</references>

<troubleshooting>

| Problem | Solution |
|---------|----------|
| `scarb build` version mismatch | Install the Scarb version pinned in `Scarb.toml` / CI (2.14.0). |
| snforge tests fail on deploy | Mock contracts must implement required interfaces; check the package's mock modules. |
| `pnpm install` fails | Use Node 24+ and the pnpm version in root `packageManager` (`corepack enable`). |
| E2E tests fail | Check `.env` has a valid Sepolia RPC URL and a funded account. |
| `references/starknet-docs/` empty | `git submodule update --init --recursive` |
| starknet.js type errors | Workspace packages use v10 object-form constructors (see TypeScript conventions); standalone script folders may be on older majors. |

</troubleshooting>
