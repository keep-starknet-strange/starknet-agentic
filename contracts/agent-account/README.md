# Agent Account Contract

Purpose-built Starknet account contract for AI agents with session keys, spending limits, and autonomous operation.

> Status: **experimental**. Use on testnet until audited.

## Features

- **Session Keys** - Enforced in `__validate__` with policy checks
- **Spending Limits** - Period-based limits per token (configurable)
- **Time Bounds** - Keys valid only in specific time ranges
- **Contract Allowlist** - Session keys restricted to a single target contract
- **Max Calls Per Tx** - Hard cap on per-transaction calls
- **Emergency Revoke** - Kill switch revokes all session keys
- **Agent Identity** - Link to on-chain ERC-8004 identity
- **Timelocked Upgrades** - 5-minute default delay (testnet-ready)

## Quick Start

```bash
scarb build
scarb test
```

## Usage

### Deploy Agent Account

```bash
starkli account oz init --keystore keystore.json
starkli declare target/dev/agent_account_AgentAccount.contract_class.json
starkli deploy <class_hash> <public_key> <factory_address>
```

Pass `0x0` as the factory address for direct deployments without a factory.

### Register Session Key

```cairo
let policy = SessionPolicy {
    valid_after: now,
    valid_until: now + 86400, // 24 hours
    spending_limit: 1000000000000000000, // 1 ETH
    spending_token: eth_address,
    allowed_contract: swap_router, // 0 = any
    max_calls_per_tx: 5, // 0 = unlimited
    spending_period_secs: 86400,
};

account.register_session_key(session_key, policy);
```

### Upgrade (Timelocked)

```cairo
// Schedule upgrade (owner only)
account.schedule_upgrade(new_class_hash);

// Execute after delay (default: 5 minutes)
account.execute_upgrade();
```

## Security

- Owner-only session key management
- Session keys cannot call the account contract itself
- Spending limits reset after `spending_period_secs` (default 24h)
- Time-based key expiration
- Emergency revoke for all keys
- Timelocked upgrades (configurable delay)
- Hard multicall cap enforced in `__execute__` (MAX_MULTICALL_SIZE = 20)
- `__validate_declare__` / `__validate_deploy__` supported (owner signature only, protocol-only caller, v1+ tx)
- Public key updates require a signature from the new key (lockout protection)

## Factory Integration

AgentAccount supports factory-based deployment and identity binding:

- Constructor now takes `public_key` and `factory` (pass `0` for direct deployments).
- Factory can call `init_agent_id_from_factory` once to link ERC-8004 identity.

## Integration

Links to Agent Registry (#5) for on-chain identity:

```cairo
account.set_agent_id(registry_address, agent_id);
```

`set_agent_id` verifies that this account owns the ERC-8004 NFT.

Works with MCP Server (#4) for autonomous operations.

## Design Notes

- Session keys are public keys only; keep private keys off-chain (TEE/HSM preferred).
- ERC-8004 identity is NFT-based, making agent profiles portable and indexable.
- For mainnet, increase upgrade delay or freeze upgrades after audits.

## Migration Notes

- Added `session_key_index`, `session_key_in_list`, and `executing` as new storage fields (appended at the end of storage for upgrade safety).
- Upgrades from older deployments are supported: the first revoke/remove will fall back to a linear scan of `active_session_keys` to backfill the index.

## Related

- Issue: #10
- MCP Server: #4
- A2A Adapter: #5
