---
name: quantum-vault
description: Time-lock vault for AI agents on Starknet with secure fund locking and scheduled release functionality. Lock funds for 5 min - 30 days, with owner-only release and emergency cancellation.
license: MIT
metadata: {"author":"Gaijin-01","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [starknet, vault, time-lock, security, funds, locking, release, schedule, ai-agents]
allowed-tools: [Bash, Read, Write, Task]
user-invocable: true
---

# Quantum Vault Skill

**Skill ID:** `quantum-vault`  
**Category:** Starknet • Security  
**Version:** 1.0.0

## Description

Time-lock vault for AI agents on Starknet. Secure fund locking with scheduled release functionality.

## Quick Reference

| Property | Value |
|----------|-------|
| **Primary Use** | Time-lock vault for AI agents |
| **Input** | Duration (seconds), vault address |
| **Platform** | Starknet (Cairo 1.0+) |
| **Min Duration** | 5 minutes (300s) |
| **Max Duration** | 30 days (2592000s) |
| **Security** | Owner-only release after timelock |

## Capabilities

- Lock funds with configurable time-lock duration
- Automatic release after timelock expires
- Emergency cancellation by owner
- Full audit trail of operations

## Integration

### MCP Server

Available tools:
- `quantum_vault_lock` - Lock funds with timelock
- `quantum_vault_release` - Release locked funds
- `quantum_vault_cancel` - Cancel and refund
- `quantum_vault_status` - Check vault state

### A2A Protocol

Compatible with agent-to-agent communication for secure fund transfers.

## Requirements

- Starknet RPC endpoint
- Starknet account (for signing transactions)

## Installation

```bash
# Part of starknet-agentic monorepo
pnpm -r build
```

## Usage Examples

### Python

```python
from starknet_agentic.skills.quantum_vault import QuantumVault

vault = QuantumVault(
    owner="0x...",
    min_duration=300,
    max_duration=2592000
)

# Lock funds
tx = vault.lockFunds(duration=3600)
await tx.wait()

# Check status
status = vault.getStatus()
print(f"Locked: {status['is_locked']}, Release at: {status['release_time']}")
```

## Error Codes and Recovery

| Error Code | Condition | Recovery |
|------------|-----------|----------|
| `ONLY_OWNER` | Caller is not the vault owner | Use owner account for signing |
| `NOT_LOCKED` | No funds currently locked | Lock funds first with `lock_funds` |
| `LOCKED` | Vault already has locked funds | Wait for release or cancel |
| `TIMELOCK_NOT_EXPIRED` | Attempted early release | Wait for lock period to end |
| `ZERO_DURATION` | Duration is zero or below minimum | Use duration >= 300 seconds |
| `MAX_LESS_THAN_MIN` | max_duration < min_duration | Set max_duration >= min_duration |
| `INSUFFICIENT_BALANCE` | Not enough balance to lock | Fund the vault before locking |

### Network Errors

| Error | Recovery |
|-------|----------|
| RPC unreachable | Check Starknet RPC endpoint, retry later |
| Transaction reverted | Check gas, nonce, contract state |
| Timeout | Increase timeout or use faster RPC |

## See Also

- [README.md](README.md) - Full documentation
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technical details
- [tests/](tests/) - Test suite
