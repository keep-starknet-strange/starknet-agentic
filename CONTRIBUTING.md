# Contributing to Starknet Agentic

This repo is a monorepo (pnpm). Contributions should be small, reviewable, and come with an acceptance test.

## Quickstart

Prereqs:
- node (LTS)
- pnpm

Install:
```bash
pnpm install
```

Common commands:
```bash
pnpm -r build
pnpm -r test
pnpm -r lint
```

## How to pick work

Preferred:
- Pick one item from `docs/GOOD_FIRST_ISSUES.md`.
- Or open a short issue with: goal, scope, acceptance test.

## PR checklist

- [ ] Linked issue (or short description) explaining why this change exists
- [ ] Includes acceptance test (unit test, integration test, or a minimal demo script)
- [ ] `pnpm -r build` passes
- [ ] `pnpm -r test` passes (or scoped test target documented)
- [ ] No unrelated refactors

## Commit messages

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat: add starknet_get_events MCP tool
fix: handle zero-balance tokens in batch query
docs: update deployment guide for Sepolia
chore: bump starknet.js to 8.10.0
test: add edge case coverage for arb scanner
```

Common prefixes: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`.

## Style

- Keep PRs small (one logical change).
- Prefer explicit, minimal APIs.
- Document new env vars and defaults.

## Security

- Never commit real private keys or secrets.
- Use `.env.example` only.
