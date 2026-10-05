---
"@starknetfoundation/starknet-agentic-mcp-server": patch
---

Unknown token symbols now get a readable error. Asking for a symbol that is neither built in for the server's network nor in avnu's verified list (for example `USDT` on Sepolia) previously returned `Failed to fetch token by symbol "USDT": undefined`, because avnu-sdk rejects with `undefined` when nothing matches. The message is now `Unknown token "USDT": not a built-in token on sepolia (built-ins: ETH, STRK, USDC, USDC.e) and not in avnu's verified list`. When the avnu lookup itself fails, the message says the list could not be checked and includes avnu's error, which is also attached as the error's `cause`.

Tool descriptions for `starknet_get_balance`, `starknet_get_balances`, `starknet_transfer`, `starknet_vesu_deposit`, `starknet_vesu_withdraw` and `starknet_vesu_positions` now say `USDT` is a built-in symbol on mainnet only.
