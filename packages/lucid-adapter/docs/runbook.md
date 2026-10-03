# Integration Runbook

## Prerequisites
* Node 20+
* Sepolia STRK faucet
* Env vars:
  * STARKNET_RPC_URL
  * OWNER_ADDRESS
  * OWNER_PRIVATE_KEY
  * SESSION_SALT
  * RECIPIENT_ADDRESS

## Run smoke
```bash
pnpm --filter @starknet-agentic/lucid-adapter test:smoke
pnpm --filter @starknet-agentic/lucid-adapter dev
```

## Expected artifacts
* requestId
* policyDecision = allow
* txHash linkage

## Known failure modes
* Session expired -> renew session key
* Replay protection hit -> new requestId required
* Insufficient STRK balance -> top up Sepolia
