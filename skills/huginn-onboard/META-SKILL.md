---
name: huginn-onboard-meta
description: Complete Starknet onboarding for agents (bridge, deploy, register) with paymaster
author: welttowelt
version: 2.0.0
chains: [starknet, ethereum, base, arbitrum]
required_tokens: [ETH, USDC]
integrations: [avnu-bridge, avnu-paymaster, huginn-registry]
---

# Huginn Meta-Skill: Zero-Friction Onboarding

Complete agent onboarding to Starknet from any EVM chain **without needing STRK first** via AVNU paymaster.

## What This Does

Single command to:

1. Bridge funds from source chain → Starknet (AVNU)
2. Deploy agent account (paymaster subsidizes gas)
3. Register with HuginnRegistry

## Prerequisites

- ETH or USDC on source chain
- Agent can sign transactions

## Quick Start

```bash
curl -sSL https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/huginn-onboard/meta-install.sh | bash -s -- \
  --source-chain ethereum \
  --amount 0.01 \
  --agent-name "MyAgent" \
  --metadata-url "ipfs://..."
```

## How It Works

### Step 1: Bridge (AVNU)

```bash
# Automatic bridge quote + execution
curl -X POST "https://api.avnu.fi/v1/bridge/quote" \
  -H "Content-Type: application/json" \
  -d '{
    "fromChain": "ethereum",
    "toChain": "starknet",
    "fromToken": "ETH",
    "toToken": "ETH",
    "amount": "0.01"
  }'
```

### Step 2: Deploy Account (Paymaster)

**NEW**: Uses AVNU paymaster - no STRK required!

```typescript
import { Account, RpcProvider } from "starknet";

const provider = new RpcProvider({
  nodeUrl: "https://starknet-mainnet.public.blastapi.io"
});

// Deploy with paymaster (Foundation subsidizes gas)
const account = await Account.deploy({
  classHash: AGENT_ACCOUNT_CLASS_HASH,
  constructorCalldata: [agentPublicKey],
  paymaster: "0x...", // AVNU paymaster address
});
```

### Step 3: Register with Huginn

```typescript
await account.execute({
  contractAddress: HUGINN_REGISTRY,
  entrypoint: "register_agent",
  calldata: ["MyAgent", "ipfs://..."]
});
```

## Contract Addresses

### Mainnet

- HuginnRegistry: `TBD`
- AVNU Paymaster: `TBD`

### Sepolia

- HuginnRegistry: `TBD`
- AVNU Paymaster: `TBD`

## Advanced: Manual Steps

If you prefer manual control, use the atomic skills:

- [Bridge Skill](../bridge/SKILL.md)
- [Deploy Skill](../deploy/SKILL.md)
- [Register Skill](../register/SKILL.md)

## Support

- GitHub: <https://github.com/keep-starknet-strange/starknet-agentic>
- Telegram: @Agentify_Starknet
