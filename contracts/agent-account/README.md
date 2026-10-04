# Agent Account Contract

Purpose-built Starknet account contract for AI agents with session keys, spending limits, and autonomous operation.

## Features

- **Session Keys** - Delegate permissions with configurable policies
- **Spending Limits** - Daily limits per token
- **Time Bounds** - Keys valid only in specific time ranges
- **Emergency Revoke** - Kill switch revokes all session keys
- **Agent Identity** - Link to on-chain ERC-8004 identity

## Quick Start

```bash
scarb build
scarb test
```

## Usage

### Deploy Agent Account

Accounts are normally deployed through `AgentAccountFactory`. To deploy one
directly with Starknet Foundry's `sncast` (Sepolia shown):

```bash
# One-time deployer: creates account.json + an encrypted keystore.json, fund it, deploy it
sncast --keystore keystore.json --account account.json account create --type oz --network sepolia
sncast --keystore keystore.json --account account.json account deploy --network sepolia

# Declare AgentAccount (sncast builds the package; run from contracts/agent-account)
sncast --keystore keystore.json --account account.json --wait declare \
  --contract-name AgentAccount --network sepolia

# Deploy: constructor(public_key: felt252, factory: ContractAddress)
sncast --keystore keystore.json --account account.json --wait deploy \
  --class-hash <class_hash> --constructor-calldata <public_key> <factory_address> --network sepolia
```

### Register Session Key

```cairo
let policy = SessionPolicy {
    valid_after: now,
    valid_until: now + 86400, // 24 hours
    spending_limit: 1000000000000000000, // 1 ETH
    spending_token: eth_address,
    allowed_contract: swap_router, // zero address = any contract
};

account.register_session_key(session_key, policy);
```

## Security

- Owner-only session key management
- Automatic spending limit resets (24h periods)
- Time-based key expiration
- Emergency revoke for all keys

## Integration

Links to Agent Registry (#5) for on-chain identity:

```cairo
account.set_agent_id(registry_address, agent_id);
```

Works with MCP Server (#4) for autonomous operations.

## Related

- Issue: #10
- MCP Server: #4
- A2A Adapter: #5
