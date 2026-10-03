# Audit Dashboard & Query Examples

## Overview

All audit events are tagged with `correlation_id`, enabling end-to-end tracing across MCP → signer → chain execution.

## Incident Reconstruction

```bash
# Get the full trace for a given correlation ID
curl -X POST http://localhost:3000/audit/trace \
  -H "Content-Type: application/json" \
  -d '{"correlation_id": "<cid>"}'
```

## Sample Queries

### Find all auth failures in the last hour
```
Events where type = "auth_failure" AND timestamp > now() - 1h
```

### Trace a specific transaction from request to chain
```
All events where tx_hash = "0x..." ordered by timestamp
```

### Count policy blocks per signer
```
Group events where type = "policy_block" by signer_id
```

### Reconstruct a full request lifecycle
```
All events where correlation_id = "<cid>" ORDER BY timestamp ASC
```

## Event Taxonomy

| Event Type      | Description                              |
|-----------------|------------------------------------------|
| `auth_failure`  | Invalid credentials or unauthorized signer |
| `policy_block`  | Request blocked by policy engine         |
| `sign_success`  | Signature produced successfully          |
| `chain_revert`  | Transaction reverted on-chain            |
| `tx_submitted`  | Transaction submitted to chain           |
| `info`          | General informational log                |
