# @starknetfoundation/starknet-agentic-mcp-server

## 0.2.0

### Minor Changes

- Move to starknet.js v10 (`starknet` ^10.8.0; 0.1.1 used ^9.4.2). `STARKNET_RPC_URL` must point at a node that serves Starknet JSON-RPC 0.9 or 0.10, the only spec versions starknet.js 10 supports.
- Add a `starknet-agentic-mcp-server` bin, so `npx -y @starknetfoundation/starknet-agentic-mcp-server` starts the server over stdio. `create-starknet-agent` already writes MCP client configs that use this command.

### Patch Changes

- Fix installation. 0.1.0 and 0.1.1 depend on `@starknetfoundation/starknet-agentic-x402-starknet@0.1.0`, which was never published, so `npm install` fails with a 404. The x402 signing helper and the shared Starknet constants are now bundled into `dist/`, and the package no longer depends on any unpublished package.
- Update `@modelcontextprotocol/sdk` to ^1.31.0, `zod` to ^4.6.5 and `@avnu/avnu-sdk` to ^4.2.0.
- Internal: each tool now lives in its own module under `src/tools/`. Tool names, input schemas and `tools/list` order are unchanged. Remove the unused `SessionKeySigner` helper, which the bundled entry point never loaded.

## 0.1.1

### Patch Changes

- e11d655: Add `license: MIT` and `author` metadata so npm shows the correct license on the package pages and downstream consumers can redistribute under MIT (matching the repo's LICENSE file). The first-published 0.1.0 versions inadvertently shipped without a license field.
