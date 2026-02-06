# Good First Issues

Pick one item and ship it as a single PR with acceptance tests.

See [ROADMAP.md](ROADMAP.md) for the full feature roadmap.

---

## 1) MCP Server: Add Vitest Tests

**Goal:** Re-enable and write unit tests for the MCP server tools.

**Context:** The MCP server has 9 implemented tools but tests are disabled.

**Acceptance:**
- [ ] Vitest configuration enabled in `packages/starknet-mcp-server/`
- [ ] At least 3 tools have unit tests with mocked RPC/AVNU
- [ ] `pnpm test` passes in package directory
- [ ] Code coverage reported

**Files:** `packages/starknet-mcp-server/src/`, `packages/starknet-mcp-server/vitest.config.ts`

**Difficulty:** Medium

---

## 2) Agent Account: Add snforge Tests

**Goal:** Write snforge unit tests for the Agent Account contract.

**Context:** Contract exists (140 lines) but has no tests. Needed before deployment.

**Acceptance:**
- [ ] Tests directory created at `contracts/agent-account/tests/`
- [ ] At least 5 test cases covering session key and spending limit logic
- [ ] `snforge test` passes
- [ ] 80%+ coverage

**Files:** `contracts/agent-account/src/`, `contracts/agent-account/tests/`

**Difficulty:** Medium-Hard

---

## 3) Skill: Complete starknet-defi Documentation

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

## 4) Skill: Complete starknet-identity Documentation

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

## 5) Example: defi-agent README

**Goal:** Create comprehensive documentation for the flagship defi-agent example.

**Context:** 8800+ lines of production code, minimal documentation.

**Acceptance:**
- [ ] README.md with architecture overview
- [ ] Step-by-step setup guide
- [ ] Configuration options documented
- [ ] Deployment guide (Docker or systemd)

**Files:** `examples/defi-agent/README.md`

**Difficulty:** Easy

---

## 6) CI: Add Cairo Contract Build to Workflow

**Goal:** Ensure Cairo contracts compile in CI.

**Context:** CI runs TypeScript builds but not Cairo.

**Acceptance:**
- [ ] GitHub Action installs Scarb 2.12.1
- [ ] `scarb build` runs for `packages/starknet-identity/erc8004-cairo/`
- [ ] `scarb build` runs for `contracts/agent-account/`
- [ ] CI fails if contracts don't compile

**Files:** `.github/workflows/ci.yml`

**Difficulty:** Easy-Medium

---

## 7) Docs: Auto-Generated Changelog Setup

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

## 8) Package: Upgrade to starknet.js v8

**Goal:** Upgrade one package from v6/v7 to v8.

**Context:** Packages use mixed versions. Target: v8 for all.

**Acceptance:**
- [ ] Pick one package (e.g., `starknet-mcp-server`)
- [ ] Upgrade starknet.js dependency to v8
- [ ] Fix any type errors from breaking changes
- [ ] Verify builds and any existing tests pass

**Files:** `packages/<chosen-package>/package.json`, source files as needed

**Difficulty:** Medium

---

## How to Contribute

1. Pick an issue from above
2. Comment on the GitHub issue (or open one referencing this doc)
3. Fork and create a feature branch
4. Implement with acceptance tests
5. Open PR linking the issue

Questions? Open a GitHub Discussion or ask in Discord #starknet-agentic.
