---
"@starknetfoundation/starknet-agentic-mcp-server": minor
---

The `USDC` token symbol now resolves to Circle's native USDC on Starknet mainnet
(`0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb`), matching
avnu's token list. It previously resolved to the StarkGate-bridged token
(`0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8`), which
avnu and explorers now list as `USDC.e`, so balances, transfers, swaps, Vesu
deposits and paymaster gas tokens requested as "USDC" acted on the legacy token.

The legacy token stays reachable as the new built-in `USDC.e` symbol (or by
address). Both tokens use 6 decimals. Agents that hold bridged USDC should query
`USDC.e`; a `USDC` balance now reports native USDC only.
