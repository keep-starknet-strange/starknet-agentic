---
"@starknetfoundation/create-starknet-agent": minor
---

New projects and generated MCP configs now default `STARKNET_RPC_URL` to Cartridge's keyless public endpoints on RPC spec 0.10 (`https://api.cartridge.gg/x/starknet/{mainnet,sepolia}/rpc/v0_10`) instead of an Alchemy URL with a `YOUR_API_KEY` placeholder, so a freshly generated agent can reach Starknet without signing up for a provider. The public endpoints are shared and may be rate-limited; set `STARKNET_RPC_URL` to your own provider for production.
