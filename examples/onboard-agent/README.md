# Agent Onboarding (E2E)

One-command path to deploy a Starknet agent account with ERC-8004 identity registration.

## What this does

1. **Preflight** -- validates env, RPC, chain ID, deployer balance
2. **Deploy** -- generates a new Stark keypair locally, calls `AgentAccountFactory.deploy_account()` which atomically deploys an account contract and registers an ERC-8004 identity
3. **Verify** -- reads the new account's balances; optionally sends a 0-value self-transfer to prove tx plumbing
4. **Receipt** -- emits `onboarding_receipt.json` with all addresses, tx hashes, and credentials

## Prerequisites

- Node.js 20+
- An existing Starknet account with funds (to pay gas for the deploy)
- Contracts deployed (AgentAccountFactory + IdentityRegistry). See `contracts/agent-account/scripts/deploy.js`
- Optional for gasfree deploy: AVNU paymaster key (`AVNU_PAYMASTER_API_KEY`)

## Get funds on Starknet

- **Sepolia faucet**: https://starknet-faucet.vercel.app/
- **StarkGate bridge** (Ethereum -> Starknet): https://starkgate.starknet.io/
- **AVNU bridge** (multi-chain): https://app.avnu.fi/bridge

## Setup

```bash
# From repo root
cd examples/onboard-agent
cp .env.example .env
# Edit .env with your deployer account credentials
```

## Run

```bash
# Default: Sepolia, balance check only
pnpm onboard

# With options
npx tsx run.ts --network sepolia --token-uri "ipfs://QmYourMetadata" --verify-tx

# Gasfree deploy (sponsored paymaster)
npx tsx run.ts --network sepolia --token-uri "ipfs://QmYourMetadata" --gasfree

# Custom salt (deterministic address)
npx tsx run.ts --token-uri "ipfs://QmYourMetadata" --salt 0x1234
```

## Output

The script prints credentials to stdout and saves `onboarding_receipt.json`:

```json
{
  "version": "1",
  "chain_id": "SN_SEPOLIA",
  "network": "sepolia",
  "account_address": "0x...",
  "agent_id": "1",
  "public_key": "0x...",
  "identity_registry": "0x...",
  "factory_address": "0x...",
  "deploy_tx_hash": "0x...",
  "first_action_tx_hash": null,
  "balances": { "ETH": "0", "STRK": "0" },
  "token_uri": "ipfs://QmYourMetadata",
  "timestamp": "2026-02-05T..."
}
```

**Save the private key securely!** It is printed once and not stored anywhere.

## Next steps

1. **Fund the new account** with ETH or STRK for gas
2. **Set up session keys** for delegated operations (see `contracts/agent-account/`)
3. **Publish capabilities** via `@starknet-agentic/agent-passport`
4. **Connect to MCP server** for AI-agent operations (see `packages/starknet-mcp-server/`)

## Architecture

```
Deployer Account (pays gas)
       |
       v
AgentAccountFactory.deploy_account(pubkey, salt, token_uri)
       |
       +---> Deploy AgentAccount contract (new keypair)
       +---> IdentityRegistry.register_with_token_uri()
       +---> Transfer identity NFT to new account
       +---> Link agent_id to account
       |
       v
New Agent Account (own keys, own identity, ready to transact)
```
