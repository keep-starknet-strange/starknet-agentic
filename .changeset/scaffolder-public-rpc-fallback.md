---
"@starknetfoundation/create-starknet-agent": minor
---

`verify` no longer falls back to Blast API, which has shut down (`starknet-sepolia.public.blastapi.io` now returns HTTP 403). Without `STARKNET_RPC_URL`, the end-to-end balance check uses Cartridge's keyless public Sepolia endpoint on RPC spec 0.10 (`https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10`).
