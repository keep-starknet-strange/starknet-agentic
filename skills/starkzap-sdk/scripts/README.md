# Scripts

Use this directory for runnable examples that mirror common Starkzap workflows.

Included starter examples:
- `wallet-execute-example.ts` - `StarkSDK` init, `sdk.connectWallet(...)`, `wallet.ensureReady(...)` (execute flow intentionally left as a placeholder).
- `staking-pool-discovery.ts` - startup scaffold for discovery checks; extend with pool enumeration in Starkzap repo context.
- `privy-signing-debug.ts` - `OnboardStrategy.Privy` resolve flow with env validation and onboarding diagnostics.

Guidelines:
- Keep scripts minimal and reproducible.
- Use environment variables for secrets and endpoint URLs.
- Print actionable errors with recovery hints (retry, config check, auth check).
