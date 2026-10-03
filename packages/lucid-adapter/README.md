# Lucid Adapter - Starknet STRK Payment + Session-Key Wallet

Scoped integration for Lucid agent runtime to trigger Starknet-native paid tool entrypoints via `x402-starknet` flow.

## Quick start

```bash
cp .env.example .env
pnpm --filter @starknet-agentic/lucid-adapter dev
```

## Features

* STRK payment path adapter skeleton
* Session-key operational wallet pattern with SNIP-12 signature v2
* Request / receipt traceability: requestId, policyDecision, txHash
* Sepolia example

See `docs/runbook.md` for setup and `docs/security.md` for trust boundaries.
