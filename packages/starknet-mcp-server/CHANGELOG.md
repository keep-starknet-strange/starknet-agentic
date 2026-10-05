# @starknetfoundation/starknet-agentic-mcp-server

## 0.3.0

### Minor Changes

- 7f154cd: The `USDC` token symbol now resolves to Circle's native USDC on Starknet mainnet
  (`0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb`), matching
  avnu's token list. It previously resolved to the StarkGate-bridged token
  (`0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8`), which
  avnu and explorers now list as `USDC.e`, so balances, transfers, swaps, Vesu
  deposits and paymaster gas tokens requested as "USDC" acted on the legacy token.
  
  The legacy token stays reachable as the new built-in `USDC.e` symbol (or by
  address). Both tokens use 6 decimals. Agents that hold bridged USDC should query
  `USDC.e`; a `USDC` balance now reports native USDC only.
- 945f988: Built-in token symbols now follow the server's network. On Sepolia, `USDC`, `USDC.e` and `USDT` previously resolved to their mainnet addresses, which have no contract on Sepolia, so balances, transfers, swaps and paymaster gas tokens requested by symbol hit a non-existent token. `USDC` and `USDC.e` now resolve to Circle's native USDC (`0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343`) and the legacy bridged USDC.e (`0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080`), both 6 decimals. Sepolia has no built-in `USDT`; that symbol now goes to avnu's Sepolia token list like any other unknown symbol. Mainnet resolution is unchanged.
  
  The network is taken from `STARKNET_RPC_URL` (as the avnu URL defaults already were) and checked against the RPC chain id at startup, before the server accepts requests. If the two disagree, symbol resolution follows the chain id (built-in tokens, and avnu lookups for other symbols unless `AVNU_BASE_URL` is set) and a `token_service.network_from_chain_id` warning is logged; swaps, quotes and the paymaster keep their configured or URL-derived avnu URLs. If the chain id cannot be read within 10 seconds, or is neither `SN_MAIN` nor `SN_SEPOLIA`, the URL-derived network is kept and a warning is logged.
  
  `x402_starknet_sign_payment_required` now takes the token symbol it trusts for `allowedTokens`, and the decimals it uses for `maxAmountPerCall`, from the built-in tokens of the chain being paid on. `starknet_build_transfer_calls` and `starknet_build_swap_calls` label tokens with the configured network's symbols.
- de09ee7: **Breaking (security):** `x402_starknet_sign_payment_required` now implements the x402 v2 `exact` scheme on Starknet and no longer signs typed data supplied by the server. Previously it signed whatever `typedData` a `PAYMENT-REQUIRED` header contained, so a malicious server could obtain the agent's signature on an `OutsideExecution` authorizing arbitrary calls (#554).
  
  The tool now builds the payment itself from the server's payment requirements: exactly one `transfer` of the required amount of the required token to `payTo`, executable only by the server's `extra.feePayer`, valid for `maxTimeoutSeconds` (at most 3600). It checks the built document against that intent before signing, and holds the payment to the `transfer` policy (`maxAmountPerCall`, `allowedRecipients`, `blockedRecipients`, `allowedTokens`) like a `starknet_transfer`.
  
  What changes for callers:
  
  - Input: `paymentRequiredHeader` must be a standard-base64 x402 v2 `PaymentRequired` (`x402Version: 2`, `resource`, `accepts[]` with `scheme: "exact"`, `network: "starknet:SN_MAIN" | "starknet:SN_SEPOLIA"`, `amount`, `asset`, `payTo`, `maxTimeoutSeconds`, `extra.feePayer`). Headers carrying `{ scheme, typedData }` and base64url headers are rejected. New optional `acceptIndex` picks the `accepts` entry; by default the first `exact` entry on the account's chain is paid.
  - Output: `{ paymentSignatureHeader, summary }`. The header is standard base64 of `{ x402Version: 2, resource, accepted, payload: { from, outsideExecution: { typedData, signature } } }`; `summary` states the token, exact amount, recipient, fee payer and expiry. The old `payload` field is gone.
  - The tool now reads the chain id from the RPC and only pays offers on that chain.

### Patch Changes

- fa9570f: Unknown token symbols now get a readable error. Asking for a symbol that is neither built in for the server's network nor in avnu's verified list (for example `USDT` on Sepolia) previously returned `Failed to fetch token by symbol "USDT": undefined`, because avnu-sdk rejects with `undefined` when nothing matches. The message is now `Unknown token "USDT": not a built-in token on sepolia (built-ins: ETH, STRK, USDC, USDC.e) and not in avnu's verified list`. When the avnu lookup itself fails, the message says the list could not be checked and includes avnu's error, which is also attached as the error's `cause`.
  
  Tool descriptions for `starknet_get_balance`, `starknet_get_balances`, `starknet_transfer`, `starknet_vesu_deposit`, `starknet_vesu_withdraw` and `starknet_vesu_positions` now say `USDT` is a built-in symbol on mainnet only.
- de09ee7: Fix `x402_starknet_sign_payment_required`, which failed on every signing request with "Do not know how to serialize a BigInt"; the signature is now returned as hex felts `[r, s]`.
- dc7723c: Fix a policy bypass: the policy guard compared addresses as lowercase strings, so an address on a blocklist (or missing from an allowlist) got through when written with a different number of leading zeros, e.g. `0x49d3…` vs `0x049d3…`. Recipient, contract and token addresses in `transfer`, `invoke`, `swap` and `build_calls` policies are now compared by numeric value; token symbols are still matched case-insensitively.

## 0.2.0

### Minor Changes

- 47daf08: The package installs from npm again, moves to starknet.js v10 and adds an
  `npx`-runnable bin.
  
  - Fix installation. 0.1.0 and 0.1.1 depend on
    `@starknetfoundation/starknet-agentic-x402-starknet@0.1.0`, which was never
    published, so `npm install` fails with a 404. The x402 signing helper and the
    shared Starknet constants are now bundled into `dist/`, and the package no
    longer depends on any unpublished package.
  - Move to starknet.js v10 (`starknet` ^10.8.0; 0.1.1 used ^9.4.2).
    `STARKNET_RPC_URL` must point at a node that serves Starknet JSON-RPC 0.9 or
    0.10, the only spec versions starknet.js 10 supports.
  - Add a `starknet-agentic-mcp-server` bin, so
    `npx -y @starknetfoundation/starknet-agentic-mcp-server` starts the server
    over stdio. `create-starknet-agent` already writes MCP client configs that use
    this command.
  - Update `@modelcontextprotocol/sdk` to ^1.31.0, `zod` to ^4.6.5 and
    `@avnu/avnu-sdk` to ^4.2.0.
  - Internal: each tool now lives in its own module under `src/tools/`. Tool
    names, input schemas and `tools/list` order are unchanged. Remove the unused
    `SessionKeySigner` helper, which the bundled entry point never loaded.

### Patch Changes

- 01506f2: Report the package's own version to MCP clients. `serverInfo.version` in the `initialize` response was hardcoded to `0.1.0`; it is now read from the package's `package.json`, so it matches the installed release.

## 0.1.1

### Patch Changes

- e11d655: Add `license: MIT` and `author` metadata so npm shows the correct license on the package pages and downstream consumers can redistribute under MIT (matching the repo's LICENSE file). The first-published 0.1.0 versions inadvertently shipped without a license field.
