# Signer-Proxy Key Rotation Runbook

## Overview
This document describes the safe rotation of the HMAC key used between the
MCP client and the signer-proxy.  The procedure is designed to be executed in
staging first and then promoted to production.

## Prerequisites
- Access to the `KeyRotator` API (imported from `starknet_agentic.proxy`)
- A secure channel to distribute the new key to MCP clients
- Redis instance reachable by the proxy

## Procedure

### 1. Generate new key
Create a fresh 256-bit random key using your preferred secure generator.
Store it in the secret manager (e.g. AWS Secrets Manager, HashiCorp Vault).

### 2. Load candidate key
```python
from starknet_agentic.proxy import KeyRotator

rotator = KeyRotator(current_key=old_key)
rotator.load_candidate(new_key)
```

### 3. Distribute new key to MCP clients
Push the new key via your configuration management / secret distribution
pipeline.  Clients should begin accepting both keys once step 4 starts.

### 4. Verify candidate verification works
```python
# Any signed request using the new key should be accepted
assert rotator.verify(new_signature, message_bytes)
```

### 5. Promote candidate to current
```python
promoted_old = rotator.promote_candidate()
# promoted_old is now the retired key — keep it only until drift window passes
```

### 6. Monitor and clean up
Watch proxy logs for any failed authentications using the old key.  After
the drift window (default 30 s) has elapsed with no new old-key traffic,
the old key can be discarded from active rotation state.

## Staging validation
Run the full test suite before promoting:
```bash
pytest tests/test_proxy_auth.py -v
```
All tests in `TestKeyRotation` and `TestSignerProxy` must pass.

## Rollback
If issues are detected after promotion:
1. Generate a *new* candidate key (do NOT reuse the old one).
2. Load it and promote — the previous "old" key will be safely abandoned.
3. Never revert to a key that was already `current`, as nonces may have
   expired and replay risk increases.

## Contact
For questions, reach out to the Starknet Agentic core team.
