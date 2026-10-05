# @starknetfoundation/create-starknet-agent

## 1.2.0

### Minor Changes

- 3331e53: New projects and generated MCP configs now default `STARKNET_RPC_URL` to Cartridge's keyless public endpoints on RPC spec 0.10 (`https://api.cartridge.gg/x/starknet/{mainnet,sepolia}/rpc/v0_10`) instead of an Alchemy URL with a `YOUR_API_KEY` placeholder, so a freshly generated agent can reach Starknet without signing up for a provider. The public endpoints are shared and may be rate-limited; set `STARKNET_RPC_URL` to your own provider for production.
- 3331e53: `verify` no longer falls back to Blast API, which has shut down (`starknet-sepolia.public.blastapi.io` now returns HTTP 403). Without `STARKNET_RPC_URL`, the end-to-end balance check uses Cartridge's keyless public Sepolia endpoint on RPC spec 0.10 (`https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10`).
- 945f988: Generated `defi` and `full` projects on Sepolia now include `USDC` (Circle's native USDC on Sepolia, `0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343`) in `TOKENS` in `src/config.ts`, matching mainnet projects, which list native USDC. Previously Sepolia projects had only `ETH` and `STRK`. Mainnet and custom-network projects are unchanged.
- 3331e53: `verify` now checks that the MCP server actually works.
  
  - The MCP check starts the server from your MCP config (its `command`, `args` and `env`, with `${VAR}` placeholders expanded from your environment) and performs an MCP `initialize` handshake and `tools/list` over stdio. It reports the server's name, version and tool count. Before, it ran the server with `--help`, a flag the server does not have, so the check failed or proved nothing.
  - When the server refuses to start because environment variables are missing or invalid, `verify` names them and reports a configuration problem. `--verbose` shows the server's stderr, with private keys, API keys and RPC URL secrets redacted.
  - The check has a hard timeout (default 60s, `--timeout <seconds>`) and always stops the server and anything it started, also on Ctrl-C.
  - A server that does not complete the handshake, an MCP config that is not valid JSON, or a config without a `starknet` server now exit with code 1 (configuration error). Missing credentials still exit with code 2.
  - In `--json` output, `mcp.serverVersion` is now the version the server reports. The version pinned in the config moved to `mcp.configuredVersion`, and the handshake result is under `mcp.handshake`.

### Patch Changes

- 7f154cd: Generated mainnet projects now set `TOKENS.USDC` to Circle's native USDC
  (`0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb`) instead of
  the legacy bridged USDC.e address. Projects you already generated are not changed.

## 1.1.0

### Minor Changes

- a8c6eb9: Generated projects now target starknet.js v10 and zod 4.
  
  - New projects depend on `starknet` ^10.8.0, `@avnu/avnu-sdk` ^4.2.0,
    `dotenv` ^18.0.4 and (full template) `zod` ^4.6.5, with `typescript` ^6.0.3,
    `tsx` ^4.23.15 and `@types/node` ^26.6.3 as dev dependencies. They declare
    Node.js `>=22.0.0`, which starknet.js 10 and the avnu SDK require.
  - The default RPC URLs in `.env.example` and in generated MCP client configs now
    use Starknet RPC spec 0.10 (`/rpc/v0_10/`). starknet.js 10 only supports RPC
    0.9 and 0.10, and the previous `/rpc/v0_7/` endpoints no longer respond.
  - The generated `tsconfig.json` sets `rootDir` and `types`, so `npm run build`
    works with TypeScript 6.
  - The `defi` and `full` templates now load `.env` before reading their
    configuration. Before this, they exited with "Missing environment variables!"
    even when `.env` was filled in.
  - `create-starknet-agent --version` and the banner now show the installed
    version. They were hardcoded to `0.5.0`.
  
  Projects you already generated are not changed.

## 1.0.0

### Major Changes

- 7ae86c2: Raise the supported Node.js floor to `>=24.0.0`.

  The repository toolchain (CI, `.nvmrc`, and the root/website `engines` fields)
  has moved to Node 24, and the CLI now declares the same floor. This is a
  breaking change for anyone scaffolding on Node 18, 20, or 22 — upgrade to Node
  24 before running `create-starknet-agent`.
