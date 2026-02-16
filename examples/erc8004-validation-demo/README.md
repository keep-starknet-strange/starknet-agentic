# ERC-8004 Validation Demo (Starknet)

A small, reproducible demo for the ERC-8004 Validation Registry on Starknet.

What it does:
1. Reads `total_agents()` from the IdentityRegistry and predicts the next agent ID.
2. Registers a new agent with `register_with_token_uri()`.
3. Creates a `validation_request()` for that agent (validator = your deployer account).
4. Parses the emitted `ValidationRequest` event to recover the request hash.
5. Submits a `validation_response()` (0..100).
6. Reads `get_summary()` and writes a machine-readable `validation_receipt.json`.

## Run

```bash
cd examples/erc8004-validation-demo
cp .env.example .env
# edit .env
pnpm demo
```

Notes:
- This demo does not print or persist secrets.
- It writes `validation_receipt.json` (safe to share: addresses + tx hashes).
