# Good First Issues (with tight acceptance tests)

If you want to help, pick one item and ship it as a single PR.

## 1) Repo: “one command” health check
- Goal: add `pnpm health` that validates node/pnpm versions and prints a short report.
- Acceptance: `pnpm health` exits 0 on a good setup, non-zero with actionable error messages.

## 2) Packages: MCP server minimal tool set
- Goal: define a stable v0 API list for `packages/starknet-mcp-server` (names + params).
- Acceptance: a markdown spec + a stub implementation that returns “not implemented” but typechecks.

## 3) Contracts: agent registry interface
- Goal: define Cairo interface for agent registry (create/update/read) aligned to ERC-8004 concepts.
- Acceptance: contract compiles, plus at least one test proving storage roundtrip.

## 4) Wallet SDK skeleton
- Goal: `packages/*` TS SDK with deploy/invoke helpers and typed config.
- Acceptance: `pnpm -r build` passes and a sample script runs against devnet (documented).

## 5) Identity URI support
- Goal: support custom identity URIs in identity layer (compatible with daydreamsai/lucid-agents style).
- Acceptance: unit test shows parsing/normalization behavior and docs specify format.

## 6) CI: enforce version consistency
- Goal: add a CI check that ensures package versions are aligned (when required).
- Acceptance: CI fails if versions drift, with a clear error.
