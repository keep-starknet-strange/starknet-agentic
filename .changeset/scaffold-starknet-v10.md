---
"@starknetfoundation/create-starknet-agent": minor
---

Generated projects now target starknet.js v10 and zod 4.

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
