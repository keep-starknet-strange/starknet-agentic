---
"@starknetfoundation/starknet-agentic-mcp-server": minor
---

Built-in token symbols now follow the server's network. On Sepolia, `USDC`, `USDC.e` and `USDT` previously resolved to their mainnet addresses, which have no contract on Sepolia, so balances, transfers, swaps and paymaster gas tokens requested by symbol hit a non-existent token. `USDC` and `USDC.e` now resolve to Circle's native USDC (`0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343`) and the legacy bridged USDC.e (`0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080`), both 6 decimals. Sepolia has no built-in `USDT`; that symbol now goes to avnu's Sepolia token list like any other unknown symbol. Mainnet resolution is unchanged.

The network is taken from `STARKNET_RPC_URL` (as the avnu URL defaults already were) and checked against the RPC chain id at startup, before the server accepts requests. If the two disagree, symbol resolution follows the chain id (built-in tokens, and avnu lookups for other symbols unless `AVNU_BASE_URL` is set) and a `token_service.network_from_chain_id` warning is logged; swaps, quotes and the paymaster keep their configured or URL-derived avnu URLs. If the chain id cannot be read within 10 seconds, or is neither `SN_MAIN` nor `SN_SEPOLIA`, the URL-derived network is kept and a warning is logged.

`x402_starknet_sign_payment_required` now takes the token symbol it trusts for `allowedTokens`, and the decimals it uses for `maxAmountPerCall`, from the built-in tokens of the chain being paid on. `starknet_build_transfer_calls` and `starknet_build_swap_calls` label tokens with the configured network's symbols.
