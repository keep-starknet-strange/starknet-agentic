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
- If a key/token is ever pasted into chat/Slack/issues, treat it as compromised and rotate it.

## Secret Scanning

We run automated secret scanning in CI (merge-blocking) to prevent hardcoded keys from landing.

Optional local guardrail:

```bash
./scripts/setup_githooks.sh
```

This enables a pre-commit hook that runs `./scripts/secret_scan.sh` (gitleaks, working-tree scan).

## Security Guardrails

- Do not ship "stubbed security success". If verification or authorization is not implemented yet:
  - revert/panic explicitly, or
  - store/emit explicit unverified state (`verified = false`).
  Never default to success (`verified = true`) behind a TODO.
- If you change auth/signature/verification/session-key logic, include tests for both:
  - expected allow path, and
  - expected deny/reject path.
- Keep security claims in docs/readmes aligned with current code behavior.
