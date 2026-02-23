---
name: starkzap-sdk
description: "Use when integrating or maintaining applications built with keep-starknet-strange/starkzap. Covers StarkSDK setup, onboarding (Signer/Privy/Cartridge), wallet lifecycle, sponsored transactions, ERC20 transfers, staking flows, tx builder batching, examples, tests, and generated presets."
license: Apache-2.0
metadata:
  author: keep-starknet-strange
  version: "1.0.0"
  org: keep-starknet-strange
compatibility: "Node.js 20+, TypeScript 5+, starkzap repository workflows"
keywords:
  - starknet
  - starkzap
  - sdk
  - typescript
  - onboarding
  - wallet
  - privy
  - cartridge
  - paymaster
  - erc20
  - staking
  - tx-builder
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---

# Starkzap SDK

Project-focused guide for `https://github.com/keep-starknet-strange/starkzap`.

Use this skill when requests involve Starkzap SDK code, examples, or docs.

## When To Use

Trigger for tasks like:
- "Add a new onboarding flow in Starkzap"
- "Fix sponsored transaction behavior in wallet.execute"
- "Update staking pool logic or validator presets"
- "Patch Privy signer/server integration"
- "Review Starkzap tests/docs/examples"

## Repository Map

Primary implementation:
- `src/sdk.ts` - top-level orchestration (`StarkSDK`)
- `src/wallet/*` - wallet implementations and lifecycle
- `src/signer/*` - `StarkSigner`, `PrivySigner`, signer adapter
- `src/tx/*` - `Tx` and `TxBuilder`
- `src/erc20/*` - token helpers, balance/transfer logic
- `src/staking/*` - staking operations and pool discovery
- `src/types/*` - shared domain types (`Address`, `Amount`, config)

Operational and docs:
- `tests/*` and `tests/integration/*`
- `examples/web`, `examples/server`, `examples/mobile`, `examples/flappy-bird`
- `scripts/*` for generated artifacts
- `docs/*` and `mintlify-docs/*`

## Core Workflows

### 1) Configure SDK and Connect Wallets

Common API path:
1. Instantiate `StarkSDK` with `network` or `rpcUrl + chainId`.
2. Use `sdk.onboard(...)` or `sdk.connectWallet(...)`.
3. Call `wallet.ensureReady({ deploy: "if_needed" })` before user-pays writes.

Supported onboarding strategies:
- `OnboardStrategy.Signer`
- `OnboardStrategy.Privy`
- `OnboardStrategy.Cartridge`

For Cartridge:
- Treat as web-only runtime.
- Expect popup/session behavior and policy scoping requirements.

### 2) Transaction Execution and Preflight

Use:
- `wallet.execute(calls, options)` for direct execution
- `wallet.preflight({ calls })` for simulation checks
- `wallet.tx()` (`TxBuilder`) for batched operations

Fee modes:
- `user_pays`
- `sponsored` (paymaster flow)

When changing execution behavior:
- audit deploy vs execute path for undeployed accounts
- verify error messages for unsupported modes/runtimes
- ensure tests cover both sponsored and user-pays branches

### 3) ERC20 and Staking

ERC20:
- validate `Amount` compatibility (decimals/symbol)
- ensure multicall ordering is preserved for batched transfers

Staking:
- membership-sensitive operations (`enter`, `add`, `exit intent`, `exit`)
- use staking config and chain presets correctly
- verify timeout/abort behavior in pool resolution paths

### 4) Examples + Integration Surfaces

Check for drift between:
- `examples/web/main.ts`
- `examples/server/server.ts`
- `README` and docs links

Specifically verify endpoint and auth consistency for Privy + paymaster proxy flows.

## Guardrails

Do not hand-edit generated files:
- `src/erc20/token/presets.ts`
- `src/erc20/token/presets.sepolia.ts`
- `src/staking/validator/presets.ts`
- `src/staking/validator/presets.sepolia.ts`
- `docs/api/**`
- `docs/export/**`

Regenerate with scripts:
```bash
npm run generate:tokens
npm run generate:tokens:sepolia
npm run generate:validators
npm run generate:validators:sepolia
npm run docs:api
npm run docs:export
```

Keep API export changes explicit:
- If new public API is added/removed, update `src/index.ts`.

## Validation Checklist

Run minimal set first:
```bash
npm run typecheck
npm test
```

Run broader checks when behavior is cross-cutting:
```bash
npm run build
npm run test:all
```

Integration tests may require local devnet/fork setup:
```bash
npm run test:integration
```

If not run, clearly report why.

## Useful Task Patterns

- **Bug fix in wallet lifecycle**:
  - inspect `src/wallet/index.ts`, `src/wallet/utils.ts`
  - patch
  - update `tests/wallet*.test.ts`

- **Privy auth/signature issue**:
  - inspect `src/signer/privy.ts`
  - align with `examples/server/server.ts`
  - update `tests/privy-signer.test.ts`

- **Staking regression**:
  - inspect `src/staking/staking.ts`, `src/staking/presets.ts`
  - add/adjust integration assertions in `tests/integration/staking.test.ts`

## Example Prompt

"Use this skill to fix Starkzap sponsored execution for undeployed accounts, add tests, and list behavior changes."
