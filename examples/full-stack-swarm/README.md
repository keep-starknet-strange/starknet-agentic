# Full Stack Swarm (Sepolia)

This is an end-to-end demo that shows the “whole stack” working together:

- **On-chain session keys + spending caps**: `contracts/session-account`
- **Hardened signer boundary**: [SISNA](https://github.com/omarespejel/SISNA) (session keys never touch the agent runtime)
- **Agent tool surface**: `@starknet-agentic/mcp-server` (MCP tools)
- **Gasless execution**: AVNU Paymaster (sponsored)
- **On-chain identity**: ERC-8004 (IdentityRegistry)

## What You’ll Get (Screenshot-Friendly)

One run produces:

- 5 deployed SessionAccount addresses (Sepolia)
- 5 ERC-8004 agent IDs minted via `starknet_register_agent`
- 5 AVNU swaps executed via MCP tools in **proxy signer mode**
- a deliberate “oversized swap” attempt that gets **denied on-chain** by spending policy

## Setup

1. Install deps (from repo root):

```bash
pnpm install
```

2. Clone SISNA next to this repo (or anywhere) and install it:

```bash
git clone https://github.com/omarespejel/SISNA
cd SISNA && npm ci
```

3. Configure env:

```bash
cd examples/full-stack-swarm
cp .env.example .env
```

Fill in:

- `DEPLOYER_ADDRESS`, `DEPLOYER_PRIVATE_KEY` (funded Sepolia account)
- `AVNU_PAYMASTER_API_KEY`
- `KEYRING_HMAC_SECRET` (use `openssl rand -hex 32`)

Signer provider options:

- Local session keys (default):
  - `SISNA_SIGNER_PROVIDER=local`
- DFNS signer mode:
  - `SISNA_SIGNER_PROVIDER=dfns`
  - `DFNS_AUTH_TOKEN`
  - `DFNS_CREDENTIAL_ID`
  - `DFNS_CREDENTIAL_PRIVATE_KEY_PEM`
  - `DFNS_NETWORK=StarknetSepolia`
  - `KEYRING_DFNS_KEYS_JSON` (must include one entry per `sessionKeyId`, e.g. `agent-1`)

`KEYRING_DFNS_KEYS_JSON` format:

```json
[
  {
    "keyId": "agent-1",
    "dfnsKeyId": "key_xxx",
    "sessionPublicKey": "0xabc...",
    "verificationPublicKey": "0x03..."
  }
]
```

Tip: SISNA includes `build-dfns-keys-json.mjs` to transform DFNS `/keys` API output into `KEYRING_DFNS_KEYS_JSON`.
For this demo, create entries for all `agent-1..agent-N`.

Example:

```bash
curl -sS -H "Authorization: Bearer $DFNS_AUTH_TOKEN" https://api.dfns.io/keys \
  | pnpm --filter @starknet-agentic/full-stack-swarm-example run dfns:keys-json > /tmp/dfns-keys.json
```

Then copy the JSON into `.env` as `KEYRING_DFNS_KEYS_JSON=...` (single-line JSON).

## Run

```bash
pnpm --filter @starknet-agentic/full-stack-swarm-example run
```

The script writes a local `state.json` (contains keys; do not share) and prints a JSON report you can screenshot.

## Notes

- This demo is designed for Sepolia. Don’t use real mainnet keys.
- If AVNU rate-limits, lower `CONCURRENCY`.
- If you want to declare the SessionAccount class from source, set `DECLARE_SESSION_ACCOUNT_CLASS=1` (requires `scarb`).
- In DFNS mode, session keys are pinned by keyId and must match on-chain registered session pubkeys.
