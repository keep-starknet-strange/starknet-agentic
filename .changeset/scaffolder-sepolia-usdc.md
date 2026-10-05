---
"@starknetfoundation/create-starknet-agent": minor
---

Generated `defi` and `full` projects on Sepolia now include `USDC` (Circle's native USDC on Sepolia, `0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343`) in `TOKENS` in `src/config.ts`, matching mainnet projects, which list native USDC. Previously Sepolia projects had only `ETH` and `STRK`. Mainnet and custom-network projects are unchanged.
