# Good First Issues

Pick one item and ship it as a single PR with acceptance tests.

See [ROADMAP.md](ROADMAP.md) for the full feature roadmap.

---

## 1) Skill: Complete starknet-defi Documentation

**Goal:** Expand the starknet-defi skill from template to full documentation.

**Context:** Currently 345 lines of basic structure. Should match starknet-wallet (465 lines).

**Acceptance:**
- [ ] Comprehensive swap documentation with avnu patterns
- [ ] Staking documentation (STRK, liquid staking)
- [ ] At least 2 example scripts in `scripts/`
- [ ] Error handling guide

**Files:** `skills/starknet-defi/SKILL.md`, `skills/starknet-defi/scripts/`

**Difficulty:** Easy

---

## 2) Skill: Complete starknet-identity Documentation

**Goal:** Expand the starknet-identity skill with ERC-8004 integration details.

**Context:** Currently 303 lines. Needs concrete contract interaction examples.

**Acceptance:**
- [ ] Agent registration workflow documented
- [ ] Reputation querying examples
- [ ] Deployed contract addresses for Sepolia
- [ ] At least 2 example scripts

**Files:** `skills/starknet-identity/SKILL.md`, `skills/starknet-identity/scripts/`

**Difficulty:** Easy

---

## 3) Example: defi-agent README

**Goal:** Create comprehensive documentation for the defi-agent example.

**Context:** ~337 lines demonstrating arbitrage patterns, needs better documentation.

**Acceptance:**
- [ ] README.md with architecture overview
- [ ] Step-by-step setup guide
- [ ] Configuration options documented
- [ ] Deployment guide (Docker or systemd)

**Files:** `examples/defi-agent/README.md`

**Difficulty:** Easy

---

## 4) Docs: Auto-Generated Changelog Setup

**Goal:** Set up automated changelog generation from conventional commits.

**Context:** No CHANGELOG.md exists. Conventional commits are preferred.

**Acceptance:**
- [ ] release-please or changesets configured
- [ ] CHANGELOG.md created in root
- [ ] GitHub Action generates changelog on release
- [ ] CONTRIBUTING.md updated with commit format

**Files:** `CHANGELOG.md`, `.github/workflows/`, `CONTRIBUTING.md`

**Difficulty:** Medium

---

## 5) Agent Account: Deployment Docs Refresh

**Goal:** Refresh docs to match deployed AgentAccountFactory reality and current deployment truth sources.

**Context:** Sepolia deployment exists; remaining work is documentation/ops alignment and mainnet planning.

**Acceptance:**
- [ ] Update docs to reference `docs/DEPLOYMENT_TRUTH_SHEET.md`
- [ ] Document current Sepolia factory address + linked IdentityRegistry
- [ ] Add mainnet deployment checklist item for AgentAccountFactory
- [ ] Add owner/multisig verification checklist for post-deploy validation

**Files:** `contracts/agent-account/README.md`, `docs/DEPLOYMENT_TRUTH_SHEET.md`, `docs/ROADMAP.md`

**Difficulty:** Medium

---

## 6) Package: Expand Test Coverage for starknet-a2a

**Goal:** Add comprehensive unit tests for the A2A adapter.

**Context:** Currently only has smoke tests. Needs mocked RPC calls and edge case coverage.

**Acceptance:**
- [ ] Mock starknet.js `Contract` and `RpcProvider`
- [ ] Test `generateAgentCard()` with mocked contract calls
- [ ] Test `getTaskStatus()` for all task states
- [ ] Test `registerAgent()` with mocked account execution
- [ ] `pnpm test` passes

**Files:** `packages/starknet-a2a/__tests__/`

**Difficulty:** Medium

---

## How to Contribute

1. Pick an issue from above
2. Comment on the GitHub issue (or open one referencing this doc)
3. Fork and create a feature branch
4. Implement with acceptance tests
5. Open PR linking the issue

Questions? Open a GitHub Discussion or ask in Discord #starknet-agentic.
