# Scripts

Use this directory for runnable examples that mirror common Starkzap workflows.

Suggested examples:
- `wallet-execute-example.ts` - `StarkSDK` init, `sdk.connectWallet(...)`, `wallet.ensureReady(...)`, `wallet.execute(...)`.
- `staking-pool-discovery.ts` - pool enumeration, staking config checks, timeout/abort-safe queries.
- `privy-signing-debug.ts` - `OnboardStrategy.Privy` resolve flow and signature diagnostics.

Guidelines:
- Keep scripts minimal and reproducible.
- Use environment variables for secrets and endpoint URLs.
- Print actionable errors with recovery hints (retry, config check, auth check).
