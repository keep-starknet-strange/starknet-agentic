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

### 1.0 ~~Upgrade starknet.js to v8 Across All Packages~~ DONE

All TypeScript packages are already standardized on starknet.js ^8.9.1.

---

### 1.1 ~~Enable and Write MCP Server Tests~~ DONE

MCP server tests are fully implemented with 7 test files covering handlers, tools, services, providers, and utils. Vitest is configured with 80% coverage thresholds.

---

### 1.2 Publish Skills to Distribution Channels

**Description**: Publish all complete skills to GitHub, ClawHub, and npm for maximum distribution.

**Requirements**:
- [ ] Create npm packages for each skill (as installable dependencies)
- [ ] Register `@starknet-agentic/skill-wallet` on npm
- [ ] Register `@starknet-agentic/skill-defi` on npm
- [ ] Register `@starknet-agentic/skill-identity` on npm
- [ ] Register `@starknet-agentic/skill-mini-pay` on npm
- [ ] Register `@starknet-agentic/skill-anonymous-wallet` on npm
- [ ] Publish skills to ClawHub for OpenClaw/MoltBook users
- [ ] Update skills README with installation instructions for all channels
- [ ] Set up automated publishing in CI workflow

**Implementation Notes**:
- Skills are complete in `skills/` directory
- ClawHub publication requires OpenClaw account setup
- npm packages should include SKILL.md, references/, and scripts/
- Consider scoped packages under `@starknet-agentic` org

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

### 1.4 Flagship DeFi Agent Documentation

**Description**: Promote defi-agent as the flagship demo with comprehensive documentation and tutorials.

**Requirements**:
- [ ] Create detailed README.md for `examples/defi-agent/`
- [ ] Add architecture diagram showing agent components
- [ ] Document configuration options (trade size, profit thresholds, intervals)
- [ ] Add step-by-step setup guide for beginners
- [ ] Create video tutorial or GIF walkthrough
- [ ] Link prominently from main README.md and website
- [ ] Add production deployment guide (systemd, Docker, cloud)

**Implementation Notes**:
- defi-agent is ~337 lines demonstrating arbitrage patterns
- Demonstrates triangular arbitrage with ETH/STRK
- Includes risk management (spending limits, min profit thresholds)
- Good showcase for Starknet's low fees enabling high-frequency strategies

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
- [ ] Create Sepolia deployment script
- [ ] Deploy to Sepolia testnet
- [ ] Document deployed contract address

**Implementation Notes**:
- Contract at `contracts/agent-account/src/agent_account.cairo` (~570 lines)
- Tests: test_agent_account (43), test_execute_validate (20), test_security (33), test_agent_account_factory (14)
- Uses OpenZeppelin AccountComponent
- Single-level session keys (owner -> agent, no nested delegation)

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
- [x] ~~Add Cairo contract build verification to CI~~ — done in `ci.yml`
- [x] ~~Add snforge test execution to CI~~ — done in `ci.yml`
- [x] ~~Add automated npm publishing on release~~ — done in `publish.yml`
- [ ] Add starknet.js version consistency check
- [ ] Add dependency vulnerability scanning
- [ ] Add automated ClawHub publishing on release
- [ ] Add test coverage reporting

**Implementation Notes**:
- CI pipeline at `.github/workflows/ci.yml` runs TS + Cairo builds + tests
- `publish.yml` publishes 3 packages to npm on release
- `health-check.yml` runs daily cron checks

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

## Implementation Priority Summary

| Phase | Target | Key Deliverables |
|-------|--------|------------------|
| **MVP (v1.0)** | Q1 2026 | starknet.js v8, MCP tests, skill publishing, defi-agent docs, changelog |
| **Nice to Have (v1.x)** | Q2 2026 | Agent Account deployment, identity MCP tools, A2A expansion, messaging |
| **Future (v2.0+)** | 2026+ | Framework extensions, economy apps, cross-chain, zkML |

---

## Status Legend

- `[ ]` Not started
- `[x]` Complete
- `[~]` In progress

*Last updated: 2026-02-06*
