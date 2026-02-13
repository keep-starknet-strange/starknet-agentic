# Quantum Vault Architecture

## Overview

Time-lock vault for AI agents on Starknet. Secure fund locking with scheduled release functionality.

## Components

### QuantumVault Contract

The main contract implementing IQuantumVault interface.

#### State Variables

| Variable | Type | Description |
|----------|------|-------------|
| `owner` | ContractAddress | Vault owner |
| `release_time` | u64 | Timestamp when funds can be released |
| `min_duration` | u64 | Minimum lock duration (default: 5 min) |
| `max_duration` | u64 | Maximum lock duration (default: 30 days) |
| `status` | QuantumVaultStatus | Current vault status |

#### QuantumVaultStatus Enum

```cairo
enum QuantumVaultStatus {
    Unlocked,   // Initial state
    Locked,     // Funds are locked
    Released,   // Funds released successfully
    Cancelled,  // Lock cancelled by owner
}
```

## Data Flow

```
1. Owner deploys vault with min/max duration
2. Owner calls lock_funds(duration)
3. Contract records release_time = block_timestamp + duration
4. Status = Locked
5. After release_time:
   - Owner calls release() → Status = Released
   - OR Owner calls cancel() → Status = Cancelled
```

## Security Considerations

1. **Only Owner**: All operations require owner authentication
2. **Duration Bounds**: Prevents unreasonably short/long locks
3. **State Machine**: Clear state transitions prevent double-spending
4. **Event Emission**: All operations emit events for auditing

## Integration

### MCP Tools

- `quantum_vault_lock` - Lock funds with timelock
- `quantum_vault_release` - Release locked funds
- `quantum_vault_cancel` - Cancel and refund
- `quantum_vault_status` - Check vault state

### A2A Protocol

Compatible with agent-to-agent communication.

## Deployment

```bash
# Deploy on Starknet
starkli deploy ./target/dev/quantum_vault_QuantumVault.contract_class_hash \
    --network mainnet \
    --constructor-args <owner> <min_duration> <max_duration>
```

## Future Improvements

- Multi-signature support (N-of-M)
- STARK proof verification
- Session keys for AI agents
- Emergency pause functionality
