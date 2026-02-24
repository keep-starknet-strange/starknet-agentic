# Scripts

Use this directory for runnable examples that mirror common Starkzap workflows.

## Setup Context (Required)

These scripts import `starkzap` and are meant to run in the Starkzap repository/runtime context.
Copy/adapt them there before execution, or install compatible `starkzap` dependencies in your local environment.

Included starter examples:
- `wallet-execute-example.ts` - `StarkSDK` init, `sdk.connectWallet(...)`, `wallet.ensureReady(...)` (execute flow intentionally left as a placeholder).
- `staking-pool-discovery.ts` - startup scaffold for discovery checks; extend with pool enumeration in Starkzap repo context.
- `privy-signing-debug.ts` - `OnboardStrategy.Privy` resolve flow with env validation and onboarding diagnostics.

Guidelines:
- Keep scripts minimal and reproducible.
- Use environment variables for secrets and endpoint URLs.
- Print actionable errors with recovery hints (retry, config check, auth check).
