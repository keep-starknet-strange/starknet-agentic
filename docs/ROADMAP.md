# Roadmap

Feature roadmap for Starknet Agentic infrastructure, broken into MVP, Nice-to-have, and Future phases.

> **Note:** Website-specific features are tracked in `website/docs/ROADMAP.md`.

---

## Prompt Initialization

Hey, I am working to implement features for Starknet Agentic from the roadmap. Let's continue with implementing:

---

# Phase 1: MVP

Core infrastructure features required for v1.0 release. MVP definition: MCP server + skills working (agents can transact via MCP tools).

---

### 1.1 Create `create-starknet-agent` CLI Scaffolding Tool ✅

**Status**: COMPLETE (PR #134)

**Description**: CLI scaffolding tool at `packages/create-starknet-agent/` that generates new agent projects.

**Implemented**:
- [x] Create `packages/create-starknet-agent/` directory
- [x] Implement CLI using `create-*` npm convention (runs via `npx create-starknet-agent`)
- [x] Add interactive prompts for project configuration
- [x] Generate project structure with pre-configured package.json, .env.example, agent entry point
- [x] Add `--template` flag for different starting points (minimal, defi, full)
- [x] Version 0.1.0 at `packages/create-starknet-agent/`
- [x] Publish to npm as `create-starknet-agent` (v0.1.0 published)
- [x] ~~Add automated publishing to CI workflow~~ Manual publishing preferred (independent release cycle from core libraries)

**Priority**: ~~HIGH~~ COMPLETE.

---

### 1.2 Publish Skills to Distribution Channels

**Description**: Publish all complete skills to GitHub, ClawHub, and other channels for maximum distribution.

**Requirements**:
- [x] Register/Setup Publication for `@starknet-agentic/skill-wallet`
- [x] Register/Setup Publication for `@starknet-agentic/skill-defi`
- [x] Register/Setup Publication for `@starknet-agentic/skill-identity`
- [x] Register/Setup Publication for `@starknet-agentic/skill-mini-pay`
- [x] Register/Setup Publication for `@starknet-agentic/skill-anonymous-wallet`
- [x] Register/Setup Publication for `@starknet-agentic/huginn-onboard`
- [ ] Publish skills to ClawHub for OpenClaw/MoltBook users (blocked: CLI not on npm, publishing workflow undocumented)
- [x] Update skills README with installation instructions for all channels
- [x] Set up automated publishing in CI workflow

**Implementation Notes**:
- Skills are complete in `skills/` directory with standardized frontmatter
- Claude Code plugin manifest at `.claude-plugin/marketplace.json`
- CI validation workflow added to `.github/workflows/ci.yml`
- Skills README at `skills/README.md` with installation instructions
- Monorepo approach chosen: all skills in one repo, installable individually or together
- ClawHub blocked: CLI not published to npm, publishing workflow not documented

**Distribution Channels**:
- GitHub: `npx skills add keep-starknet-strange/starknet-agentic`
- Claude Code: `/plugin marketplace add keep-starknet-strange/starknet-agentic`
- skills.sh: Auto-indexed from GitHub
- ClawHub: Blocked (check clawhub.ai for updates)

---

### 1.3 Agent Passport as Standard Capability Metadata

**Description**: Standardize agent-passport as the convention for agents to describe their capabilities via ERC-8004 metadata.

**Requirements**:
- [ ] Document agent-passport schema in SPECIFICATION.md
- [ ] Create JSON schema for capability metadata validation
- [ ] Add capability metadata examples to skills documentation
- [ ] Update starknet-identity skill to use agent-passport for registration
- [ ] Add agent-passport integration to MCP server (optional helper tool)
- [ ] Write migration guide for existing ERC-8004 agents

**Implementation Notes**:
- `packages/starknet-agent-passport/` already implements the client
- Standardize on capability categories: `defi`, `trading`, `identity`, `messaging`, `payments`
- Capability metadata stored in ERC-8004 IdentityRegistry via `setMetadata`

---

### 1.5 Auto-Generated Changelog Setup

**Description**: Set up automated changelog generation from conventional commits.

**Requirements**:
- [ ] Install and configure release-please or semantic-release
- [ ] Create CHANGELOG.md in repository root
- [ ] Configure conventional commit linting (commitlint)
- [ ] Add commit message format to CONTRIBUTING.md
- [ ] Set up GitHub Action for automated changelog updates
- [ ] Configure version bumping for packages (pnpm workspaces aware)

**Implementation Notes**:
- Use conventional commits format: `feat:`, `fix:`, `docs:`, `chore:`
- release-please handles monorepo versioning well
- Consider changesets as alternative for more manual control
- Consider backfilling changelog from existing commit history

---

### 1.6 Complete starknet-defi Skill Implementation

**Description**: The starknet-defi skill is currently a template. Complete the implementation with full documentation and examples.

**Requirements**:
- [ ] Add comprehensive swap documentation (avnu patterns)
- [ ] Add staking documentation (STRK staking, liquid staking)
- [ ] Add lending documentation (zkLend, Nostra patterns)
- [ ] Add DCA (Dollar Cost Averaging) documentation
- [ ] Create example scripts for each operation
- [ ] Add error handling guide with recovery steps
- [ ] Include token addresses and protocol endpoints

**Implementation Notes**:
- Basic structure exists at `skills/starknet-defi/SKILL.md` (345 lines)
- Should mirror comprehensiveness of starknet-wallet skill (465 lines)
- Reference avnu-skill for patterns: https://github.com/avnu-labs/avnu-skill

---

### 1.7 Complete starknet-identity Skill Implementation

**Description**: The starknet-identity skill has structure but needs ERC-8004 integration details.

**Requirements**:
- [ ] Add agent registration workflow documentation
- [ ] Add reputation system usage guide
- [ ] Add validation request/response documentation
- [ ] Add metadata schema reference
- [ ] Create example scripts for identity operations
- [ ] Document deployed contract addresses (Sepolia, Mainnet when available)
- [ ] Add querying reputation and validation status examples

**Implementation Notes**:
- Basic structure exists at `skills/starknet-identity/SKILL.md` (303 lines)
- ERC-8004 contracts are production-ready in `packages/starknet-identity/erc8004-cairo/`
- Include agent-passport integration

---

### 1.8 Standardize MCP ↔ Skill Architecture Separation

**Description**: Align all skills with 2025-2026 best practices for the MCP (capability layer) vs Skills (knowledge layer) separation. Currently, skills vary in how they relate to the MCP server—some document MCP tools (ideal), some bundle standalone execution (acceptable for missing capabilities), and some are complete standalone apps (should be refactored).

**Background** (from architecture analysis):
- **Best practice**: Skills provide "context, instructions, domain knowledge, and behavioral patterns"—MCP tools provide executable functions. Skills teach *when/what*, MCP executes *how*.
- **Token economics**: One MCP server can consume 50k+ tokens of schemas; skills use progressive disclosure (~100 tokens metadata, ~5k when activated).
- **Industry alignment**: AgentSkills spec (agentskills.io) + MCP (donated to Linux Foundation AAIF) are complementary standards adopted by Microsoft, OpenAI, Cursor, GitHub, etc.

**Current State Assessment**:

| Skill | Pattern | Best Practice Alignment |
|-------|---------|-------------------------|
| `starknet-wallet` | Documents 8 MCP tools, minimal validation scripts | ✅ 100% - Ideal separation |
| `starknet-defi` | Documents MCP swap/quote tools, SDK patterns | ✅ 95% - Good separation |
| `starknet-identity` | Template, needs ERC-8004 integration | ⚠️ 60% - Incomplete |
| `starknet-anonymous-wallet` | Bundles Node.js scripts (Typhoon not in MCP) | ⚠️ 60% - Valid deviation |
| `starknet-mini-pay` | Complete standalone Python app + Telegram bot | ❌ 40% - Should use MCP |
| `huginn-onboard` | Onboarding workflow | ⚠️ TBD - Needs review |

**Requirements**:

#### 1.8.1 starknet-wallet (Reference Implementation)
- [x] Documents MCP tools in skill body
- [x] Provides TypeScript code examples
- [x] Bundles only validation scripts (`scripts/check-balance.ts`, `scripts/check-balances.ts`)
- [ ] Add explicit "MCP Tools Used" section with tool schemas
- [ ] Add integration test: skill + MCP server working together
- [ ] Document as reference implementation for other skills

#### 1.8.2 starknet-defi (Minor Improvements)
- [x] Documents MCP swap/quote tools
- [x] Comprehensive avnu SDK patterns
- [ ] Add explicit "MCP Tools Used" section listing `starknet_swap`, `starknet_get_quote`
- [ ] Add integration test: DeFi skill guiding agent to use MCP swap tools
- [ ] Verify all code examples use MCP tool patterns (not direct SDK calls for operations MCP exposes)

#### 1.8.3 starknet-identity (Complete Implementation)
- [ ] Complete skill implementation (see 1.7)
- [ ] Document which operations should be MCP tools vs skill knowledge
- [ ] Add "MCP Tools Used" section (pending 2.2 MCP Identity Tools)
- [ ] Ensure skill teaches patterns, doesn't duplicate MCP execution logic

#### 1.8.4 starknet-anonymous-wallet (Document Deviation)
- [x] Bundles scripts because Typhoon protocol not in MCP server
- [ ] Add explicit note: "This skill bundles execution because Typhoon is not exposed via MCP"
- [ ] Evaluate: Should Typhoon operations be added to MCP server?
  - If yes: Create issue to add `starknet_typhoon_deposit`, `starknet_typhoon_withdraw` tools
  - If no: Document rationale (specialized use case, different security model, etc.)
- [ ] Add integration test for script-based workflow

#### 1.8.5 starknet-mini-pay (Refactor to MCP Pattern)
- [ ] **Add payment operations to MCP server**:
  - [ ] `starknet_create_payment_link` - Generate `starknet:<addr>?amount=...` links
  - [ ] `starknet_parse_payment_link` - Parse incoming payment links
  - [ ] `starknet_create_invoice` - Create payment request with expiry
  - [ ] `starknet_get_invoice_status` - Check invoice fulfillment
  - [ ] `starknet_generate_qr` - Generate QR code for address/payment (returns base64 or file path)
- [ ] **Refactor skill to document MCP tools** (like starknet-wallet does)
- [ ] **Keep Telegram bot as separate deployment** that consumes MCP server
- [ ] **Maintain Python scripts** as alternative runtime (document as "standalone mode")
- [ ] Add integration test: skill + MCP payment tools

#### 1.8.6 huginn-onboard (Review and Align)
- [ ] Review current implementation
- [ ] Determine if it documents MCP tools or bundles execution
- [ ] Align with starknet-wallet pattern if applicable
- [ ] Add integration test

#### 1.8.7 Cross-Skill Integration Testing
- [ ] Create `tests/integration/` directory for skill + MCP tests
- [ ] Test: Agent loads starknet-wallet skill → uses MCP tools correctly
- [ ] Test: Agent loads starknet-defi skill → executes swap via MCP
- [ ] Test: Agent loads starknet-mini-pay skill → creates payment link via MCP
- [ ] Document test patterns for community skill authors

#### 1.8.8 Documentation Updates
- [ ] Add "MCP ↔ Skill Architecture" section to SPECIFICATION.md
- [ ] Document when to add capability to MCP vs bundle in skill
- [ ] Add skill authoring guide with best practices
- [ ] Update CLAUDE.md with architecture guidance

**Implementation Notes**:
- starknet-wallet is the reference implementation—other skills should follow its pattern
- Skills that bundle execution (anonymous-wallet, mini-pay) should document *why*
- MCP server changes require Zod schemas, tests, and documentation updates
- Telegram bot in mini-pay is a valid standalone deployment—it can consume MCP server
- Python scripts in mini-pay can remain as "standalone mode" for non-MCP environments

**Acceptance Criteria**:
- All skills have explicit "MCP Tools Used" section (or "Standalone Execution" with rationale)
- Integration tests pass for each skill + MCP combination
- SPECIFICATION.md documents the architecture pattern
- New skill authors have clear guidance on MCP vs bundled execution

**Priority**: MEDIUM - Improves maintainability and aligns with industry standards, but current skills are functional.

**References**:
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [Anthropic: Equipping Agents with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [Agent Skills Specification](https://agentskills.io/specification)
- [Skills vs Tools Production Guide](https://blog.arcade.dev/what-are-agent-skills-and-tools)

---

# Phase 2: Nice to Have

Features that enhance the platform but are not required for v1.0 release.

---

### 2.1 Agent Account Contract Deployment

**Description**: The Agent Account contract is fully tested (110 tests across 4 suites). Next step is Sepolia deployment.

**Requirements**:
- [x] ~~Create tests directory~~ — 4 test files exist in `contracts/agent-account/tests/`
- [x] ~~Write snforge tests for session key registration~~
- [x] ~~Write snforge tests for session key revocation~~
- [x] ~~Write snforge tests for spending limit enforcement~~
- [x] ~~Write snforge tests for time bounds validation~~
- [x] ~~Write snforge tests for emergency revoke mechanism~~
- [x] ~~Write snforge tests for agent ID linking~~
- [x] Create Sepolia deployment script
- [ ] Deploy to Sepolia testnet
- [ ] Document deployed contract address

**Implementation Notes**:
- Contract at `contracts/agent-account/src/agent_account.cairo` (~570 lines)
- Tests: test_agent_account (43), test_execute_validate (20), test_security (33), test_agent_account_factory (14)
- Uses OpenZeppelin AccountComponent
- Single-level session keys (owner -> agent, no nested delegation)
- Use starkli in the deployment script. Follow this as an example: https://github.com/keep-starknet-strange/pow/tree/main/onchain/scripts ( see deploy-sepolia.sh, deploy-mainnet.sh, ... )

---

### 2.2 MCP Identity Tools Implementation

**Description**: Add identity-related MCP tools for on-chain agent registration and reputation.

**Requirements**:
- [ ] Implement `starknet_register_agent` tool
- [ ] Implement `starknet_get_agent_info` tool
- [ ] Implement `starknet_update_agent_metadata` tool
- [ ] Implement `starknet_give_feedback` tool
- [ ] Implement `starknet_get_reputation` tool
- [ ] Implement `starknet_request_validation` tool
- [ ] Add Zod schemas for all new tools
- [ ] Write tests for each tool
- [ ] Update MCP tools documentation

**Implementation Notes**:
- These tools interact with ERC-8004 contracts
- Requires deployed contract addresses in environment
- Lower priority than transaction tools for MVP

---

### 2.3 Generalized Messaging Skill

**Description**: Abstract mini-pay's Telegram bot pattern into a generalized messaging skill supporting multiple platforms.

**Requirements**:
- [ ] Design messaging skill interface (platform-agnostic)
- [ ] Extract Telegram integration from mini-pay as plugin
- [ ] Add Discord bot integration plugin
- [ ] Add Slack integration plugin (optional)
- [ ] Create unified notification API
- [ ] Document bot deployment patterns
- [ ] Add rate limiting and spam prevention

**Implementation Notes**:
- mini-pay has working Telegram bot (684 lines in `telegram_bot.py`)
- Pattern should support: payment notifications, balance alerts, transaction confirmations
- Consider using message queue for reliability

---

### 2.4 A2A Protocol Full Implementation

**Description**: Expand A2A adapter with complete task protocol and discovery.

**Requirements**:
- [ ] Implement full A2A task lifecycle (submitted -> working -> completed/failed)
- [ ] Add Agent Card generation from ERC-8004 metadata
- [ ] Implement `/.well-known/agent.json` endpoint
- [ ] Add agent discovery via registry queries
- [ ] Implement task negotiation protocol
- [ ] Add payment channel support for recurring tasks
- [ ] Write integration tests

**Implementation Notes**:
- Basic adapter exists at `packages/starknet-a2a/` (437 lines)
- A2A tasks map to Starknet transactions
- Consider WebSocket support for real-time updates

---

### 2.5 CI/CD Enhancements

**Description**: Improve CI/CD pipeline with additional checks and automation.

**Requirements**:
- [x] ~~Add Cairo contract build verification to CI~~ — done in `ci.yml` (erc8004, agent-account, huginn-registry)
- [x] ~~Add snforge test execution to CI~~ — done in `ci.yml` (3 separate Cairo test jobs)
- [x] ~~Add automated npm publishing on release~~ — done in `publish.yml`
- [x] ~~Add skill validation to CI~~ — done in `ci.yml` (`validate-skills` job)
- [x] ~~Add onboarding smoke tests to CI~~ — done in `ci.yml` (`onboarding-smoke` job)
- [x] ~~Add dependency vulnerability scanning~~
- [x] ~~Add daily health check cron~~ — done in `health-check.yml`
- [ ] Add starknet.js version consistency check
- [ ] Add automated ClawHub publishing on release
- [ ] Add test coverage reporting

**Implementation Notes**:
- CI pipeline at `.github/workflows/ci.yml` runs 11 jobs: typecheck, lint, test, 3x cairo-test, website-build, validate-skills, onboarding-smoke, all-checks
- `publish.yml` publishes 3 packages to npm on release (mcp-server, a2a, agent-passport)
- `health-check.yml` runs daily at 9:15 UTC, creates GitHub issues on failure

---

# Phase 3: Future

Long-term features and ecosystem expansion planned for v2.0+.

---

### 3.1 Framework Extensions (Daydreams, Lucid Agents)

**Description**: Create native extensions for popular agent frameworks.

**Requirements**:
- [ ] Design Daydreams extension interface following their `extension()` pattern
- [ ] Implement StarknetProvider service for Daydreams
- [ ] Implement wallet context for Daydreams
- [ ] Implement DeFi actions (transfer, swap, stake) for Daydreams
- [ ] Design Lucid Agents WalletConnector interface
- [ ] Implement StarknetWalletConnector for Lucid Agents
- [ ] Implement PaymentsRuntime for Lucid Agents
- [ ] Write documentation and examples for both frameworks
- [ ] Publish as separate npm packages

**Implementation Notes**:
- Low priority for v1.0 (MCP covers most use cases)
- Daydreams pattern: services, contexts, actions, inputs, outputs
- Lucid Agents pattern: Extension interface with WalletConnector
- Consider deferring to community contributions

---

### 3.2 Economy Apps (AgentSouk, ProveWork, StarkMint)

**Description**: Build the apps described in AGENTIC_ECONOMY_PLAN.md on top of the infrastructure.

**Requirements**:
- [ ] Design AgentSouk marketplace architecture
- [ ] Design ProveWork trustless labor market
- [ ] Design StarkMint token launchpad
- [ ] Create shared contracts for escrow and bonding curves
- [ ] Implement AgentSouk MVP (agent profiles, search, discovery)
- [ ] Implement ProveWork MVP (task posting, bidding, escrow)
- [ ] Implement StarkMint MVP (token launch, bonding curves)

**Implementation Notes**:
- These are planned products, not just vision docs
- Build on Agent Account, ERC-8004, and MCP server
- Consider separate repositories or monorepo apps/ directory
- May involve community bounties for implementation

---

### 3.3 Cross-Chain Identity Bridge

**Description**: Bridge ERC-8004 identity between Starknet and EVM chains.

**Requirements**:
- [ ] Design bridge protocol for identity attestations
- [ ] Implement Starknet -> EVM message passing
- [ ] Implement EVM -> Starknet message passing
- [ ] Create bridge contracts on both sides
- [ ] Handle identity verification across chains
- [ ] Document bridge usage patterns

**Implementation Notes**:
- Open question: how should reputation transfer across chains?
- Consider Starknet's native L1 messaging
- May use StarkGate or custom bridge

---

### 3.4 zkML Integration (Giza LuminAIR)

**Description**: Integrate Giza's zkML for verifiable AI agent decisions.

**Requirements**:
- [ ] Research Giza LuminAIR API and capabilities
- [ ] Design integration pattern for agent decision proofs
- [ ] Implement proof generation for trading decisions
- [ ] Implement on-chain proof verification
- [ ] Add zkML attestation to ERC-8004 validation
- [ ] Create example: "Proof-of-Agency" autonomous action verification

**Implementation Notes**:
- Open question: what agent decisions should be provable?
- Giza enables proving ML inference on-chain
- Unique to Starknet (ZK-STARK native)

---

### 3.5 Nested Session Keys (Recursive Agent Swarms)

**Description**: Allow agents to delegate to sub-agents with scoped-down session keys.

**Requirements**:
- [ ] Design nested delegation protocol
- [ ] Implement sub-session key creation in Agent Account contract
- [ ] Add permission intersection logic (sub-key can only narrow, not expand)
- [ ] Add depth limits to prevent infinite delegation
- [ ] Implement swarm dissolution cleanup
- [ ] Write security analysis document

**Implementation Notes**:
- Currently single-level only (owner -> agent)
- Open question: security implications of recursive delegation
- Use case: "Project Manager" agent spawns specialized sub-agents

---

### 3.6 Agent Insurance Pools

**Description**: Decentralized insurance for agent mistakes with reputation-based premiums.

**Requirements**:
- [ ] Design insurance pool contracts
- [ ] Implement premium calculation based on reputation
- [ ] Implement claim verification via on-chain history
- [ ] Add stake-based coverage limits
- [ ] Create governance for pool parameters
- [ ] Document actuarial model

**Implementation Notes**:
- Novel concept only possible on Starknet (provable history)
- Requires mature reputation system
- May need oracle for off-chain claim verification

---

### 3.7 Open Question Resolution

**Description**: Resolve design questions listed in SPECIFICATION.md.

**Items to Resolve**:
- [ ] Cross-chain identity: how should EVM ERC-8004 and Starknet registry interoperate?
- [ ] Micropayments: what is the right economic model for agent-to-agent micropayments?
- [ ] Skill versioning: how should skills be versioned and how should upgrades be handled?
- [ ] Contract upgrades: which contracts should be upgradeable vs. immutable? (case-by-case documented)

**Implementation Notes**:
- Each decision should be documented in SPECIFICATION.md
- May require community input via GitHub discussions
- Some decisions may be deferred to implementation experience

---

### 1.9 Agent Onboarding E2E Flow

**Status**: IN PROGRESS

**Description**: End-to-end onboarding flow for new agents including account deployment, ERC-8004 registration, and first action. Demonstrated via `examples/onboard-agent/` and `examples/crosschain-demo/`.

**Implemented**:
- [x] `examples/onboard-agent/` -- E2E onboarding flow with network/gasfree/verify options
- [x] `examples/crosschain-demo/` -- Base Sepolia ↔ Starknet ERC-8004 cross-chain flow
- [x] AVNU-sponsored gasfree deploy path (PR #140)
- [x] Cross-chain funding logic with threshold/skip+mock (PR #155)
- [x] Onboarding smoke tests in CI (`onboarding-smoke` job)
- [x] `skills/huginn-onboard/` -- Huginn onboarding skill
- [ ] Production deployment of HuginnRegistry contract
- [ ] Mainnet onboarding documentation

**Implementation Notes**:
- Onboard agent: preflight checks → account deployment → identity registration → first action
- Crosschain demo: EVM funding → bridge → Starknet registration → URI update
- Smoke tests run in CI to prevent regressions

---

## Implementation Priority Summary

| Phase | Target | Key Deliverables |
|-------|--------|------------------|
| **MVP (v1.0)** | Q1 2026 | CLI scaffolding ✅, skill publishing, agent onboarding, defi/identity skill completion, changelog |
| **Nice to Have (v1.x)** | Q2 2026 | Agent Account deployment, identity MCP tools, A2A expansion, messaging |
| **Future (v2.0+)** | 2026+ | Framework extensions, economy apps, cross-chain bridge, zkML |

---

## Status Legend

- `[ ]` Not started
- `[x]` Complete
- `[~]` In progress

*Last updated: 2026-02-11*
