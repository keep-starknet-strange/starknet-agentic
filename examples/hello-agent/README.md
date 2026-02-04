# Hello Agent (E2E demo)

Goal: one reproducible end-to-end path that proves a Starknet agent can:
- connect to an RPC
- read state (balance)
- send a transaction (0-value self-transfer)

This is intentionally minimal and meant to be the target that contributors can improve.

## Setup

```bash
pnpm install
pnpm approve-builds
```

## Configure

Create `examples/hello-agent/.env`:

```env
STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
```

Notes:
- Use Sepolia for safety.
- The demo sends a 0-value STRK self-transfer, it should be harmless but still proves tx plumbing.

## Run

```bash
pnpm demo:hello-agent
```

## Expected output
- prints address
- prints STRK balance
- prints tx hash and waits for acceptance
