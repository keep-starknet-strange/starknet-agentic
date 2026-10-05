# Starknet MCP Server

An MCP (Model Context Protocol) server that exposes Starknet blockchain operations as tools for AI agents.

## Features

- **Wallet Operations**: Check balances, transfer tokens
- **Contract Interactions**: Call read/write functions on any Starknet contract
- **DeFi Operations**: Execute swaps via avnu aggregator with best-price routing
- **Fee Estimation**: Estimate transaction costs before execution
- **Multi-token Support**: ETH, STRK, USDC (Circle native), USDC.e (legacy bridged USDC), USDT, and custom ERC20 tokens

## Installation

From npm, run the published server with `npx` (this is the command
`create-starknet-agent` writes into MCP client configs):

```bash
npx -y @starknetfoundation/starknet-agentic-mcp-server
```

From source (pnpm workspace, run at the repository root):

```bash
pnpm install
pnpm --filter @starknetfoundation/starknet-agentic-mcp-server build
# then: node packages/starknet-mcp-server/dist/index.js
```

## Configuration

Create a `.env` file with your Starknet credentials.

Direct signer mode (development/local only):

```bash
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_SIGNER_MODE=direct
STARKNET_PRIVATE_KEY=0x...

# avnu URLs (optional -- defaults shown)
AVNU_BASE_URL=https://starknet.api.avnu.fi
AVNU_PAYMASTER_URL=https://starknet.paymaster.avnu.fi
# Optional for Vesu on non-mainnet deployments (e.g. Sepolia V2):
# STARKNET_VESU_POOL_FACTORY=0x...
#
# Paymaster fee mode:
# - sponsored: dApp pays gas (requires AVNU to authorize your API key for sponsored builds)
# - default: user pays gas in `gasToken` via paymaster
# Defaults to "sponsored" when AVNU_PAYMASTER_API_KEY is set; otherwise "default".
# You can force "default" to avoid failures when your key is not sponsor-authorized.
AVNU_PAYMASTER_FEE_MODE=default
```

Proxy signer mode (recommended for production):

```bash
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_SIGNER_MODE=proxy
KEYRING_PROXY_URL=https://signer.internal:8545
KEYRING_HMAC_SECRET=replace-with-long-random-secret
KEYRING_CLIENT_ID=starknet-mcp-server
# mTLS client material (required in production for non-loopback signer URLs)
# KEYRING_TLS_CLIENT_CERT_PATH=/etc/starknet-mcp/tls/client.crt
# KEYRING_TLS_CLIENT_KEY_PATH=/etc/starknet-mcp/tls/client.key
# KEYRING_TLS_CA_PATH=/etc/starknet-mcp/tls/ca.crt
# Optional:
# KEYRING_SIGNING_KEY_ID=default
# KEYRING_REQUEST_TIMEOUT_MS=5000
# KEYRING_SESSION_VALIDITY_SECONDS=300
```

Signer boundary contract:
- OpenAPI: `spec/signer-api-v1.openapi.yaml`
- JSON Schema: `spec/signer-api-v1.schema.json`
- Auth vectors: `spec/signer-auth-v1.json`
- Auth vectors schema: `spec/signer-auth-v1.schema.json`
- Security notes: `docs/security/SIGNER_API_SPEC.md`
- Rotation runbook: `docs/security/SIGNER_PROXY_ROTATION_RUNBOOK.md`

Interop note:
- `spec/interop-version.json` remains at `0.1.0` until cross-repo conformance updates land.
- Proxy clients should follow the signer API v1 contract above, including `X-Keyring-Client-Id`.

SISNA server-side production key-custody guard:
- Current SISNA builds fail production startup unless
  `KEYRING_ALLOW_INSECURE_IN_PROCESS_KEYS_IN_PRODUCTION=true` is explicitly set
  while in-process key custody is still used.
- This is a temporary explicit-risk acknowledgement until external KMS/HSM
  signing mode is available in SISNA.

Production startup guard: `KEYRING_PROXY_URL` must use `https://` unless loopback is used (`http://127.0.0.1`, `http://localhost`, or `http://[::1]`).
Production startup guard (non-loopback signer URLs): `KEYRING_TLS_CLIENT_CERT_PATH`, `KEYRING_TLS_CLIENT_KEY_PATH`, and `KEYRING_TLS_CA_PATH` are required.

## Usage

### With Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "starknet": {
      "command": "node",
      "args": [
        "/path/to/starknet-agentic/packages/starknet-mcp-server/dist/index.js"
      ],
      "env": {
        "STARKNET_RPC_URL": "https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_SIGNER_MODE": "proxy",
        "KEYRING_PROXY_URL": "http://127.0.0.1:8545",
        "KEYRING_HMAC_SECRET": "replace-with-long-random-secret"
      }
    }
  }
}
```

If you run direct mode locally instead:

```json
{
  "mcpServers": {
    "starknet": {
      "command": "node",
      "args": [
        "/path/to/starknet-agentic/packages/starknet-mcp-server/dist/index.js"
      ],
      "env": {
        "STARKNET_RPC_URL": "https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_SIGNER_MODE": "direct",
        "STARKNET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### With Other MCP Clients

Any MCP-compatible client can use this server via stdio transport.

## Available Tools

### `starknet_get_balance`

Get token balance for an address.

```typescript
{
  "token": "ETH",  // or "STRK", "USDC", "USDC.e", "USDT", or contract address
  "address": "0x..."  // optional, defaults to agent's address
}
```

### `starknet_transfer`

Transfer tokens to another address.

```typescript
{
  "recipient": "0x...",
  "token": "STRK",
  "amount": "10.5"  // human-readable format
}
```

### `starknet_call_contract`

Call a read-only contract function.

```typescript
{
  "contractAddress": "0x...",
  "entrypoint": "balanceOf",
  "calldata": ["0x..."]  // optional
}
```

### `starknet_invoke_contract`

Invoke a state-changing contract function.

```typescript
{
  "contractAddress": "0x...",
  "entrypoint": "approve",
  "calldata": ["0x...", "1000000"]
}
```

### `starknet_swap`

Execute a token swap using avnu aggregator.

```typescript
{
  "sellToken": "ETH",
  "buyToken": "STRK",
  "amount": "0.1",
  "slippage": 0.01  // optional, defaults to 1%
}
```

### `starknet_get_quote`

Get swap quote without executing.

```typescript
{
  "sellToken": "ETH",
  "buyToken": "USDC",
  "amount": "1.0"
}
```

### `starknet_estimate_fee`

Estimate transaction fee.

```typescript
{
  "contractAddress": "0x...",
  "entrypoint": "transfer",
  "calldata": ["0x...", "1000"]
}
```

## Development

```bash
# Watch mode for development
npm run dev

# Run tests
npm test

# Build
npm run build
```

### Source layout

```
src/
├── index.ts          # Bootstrap: env validation and production guards, provider/signer/account,
│                     # transaction submission, policy guard, tools/list + tools/call wiring
├── tools/
│   ├── index.ts      # Registry: TOOL_MODULES (order = tools/list order), listTools, getToolHandler
│   ├── _shared.ts    # ToolContext / ToolModule types and shared input validators
│   └── <tool>.ts     # One module per tool: definition + handler (+ optional isListed)
├── helpers/          # Balance, Vesu, keyring proxy signer, tx receipts, ...
├── middleware/       # policyGuard (evaluated before every tool call)
└── services/         # TokenService (symbol and decimals resolution)
```

### Adding a tool

1. Create `src/tools/<tool-name>.ts` (kebab-case, without the `starknet_` prefix) that exports:
   - `definition: Tool`: `name`, `description` and a JSON Schema `inputSchema`. `tools/list`
     returns this object as is, so it is the contract the agent sees.
   - `handler(args, ctx): Promise<ToolResult>`: validate `args` before using them. Reuse the
     validators in `_shared.ts` (`parseAddress`, `parseFelt`, `parseCalldata`,
     `validateEntrypoint`, `parseAmount`). For structured input, parse `args` with a Zod schema
     and keep it in sync with `inputSchema` (Zod 4's `z.toJSONSchema()` can generate it).
     Throw an `Error` on failure: the server returns it as an `isError` result (via
     `formatErrorMessage`) and logs the raw message to stderr.
   - `isListed(ctx)` (optional): return `false` to hide the tool from `tools/list` when its
     configuration is missing. Hidden tools can still be called, so the handler must also check
     its configuration and throw a clear "not configured" error.
2. Read runtime dependencies from `ctx` (`env`, `provider`, `account`, ...). Prefer
   `ctx.executeTransaction` + `ctx.waitForTransactionSuccess` for state-changing calls so gasfree
   (paymaster) mode and receipt checks behave like the other tools.
3. Register the module in `TOOL_MODULES` in `src/tools/index.ts`. Its position there is its
   position in `tools/list`.
4. If the tool moves funds or invokes arbitrary contracts, add a rule for it in
   `src/middleware/policyGuard.ts`. When `denyUnknownTools` is enabled, tools without a case in
   `PolicyGuard.evaluate` are rejected.
5. Add Vitest tests. `__tests__/handlers/tools.test.ts` mocks `starknet`, the avnu SDK and the MCP
   SDK, then calls tools through the real `tools/call` handler. Also add the tool name to
   `EXPECTED_ORDER` in `__tests__/tools/registry.test.ts`.
6. Document the tool under [Available Tools](#available-tools).

## Architecture

The server uses:
- `@modelcontextprotocol/sdk` for MCP protocol implementation
- `starknet.js` v6 for Starknet interactions
- `@avnu/avnu-sdk` for DeFi operations
- `zod` for input validation

## Security

- Production startup guard: `NODE_ENV=production` requires `STARKNET_SIGNER_MODE=proxy`
- Production startup guard: rejects `STARKNET_PRIVATE_KEY` when `STARKNET_SIGNER_MODE=proxy`
- Production startup guard: non-loopback proxy URLs require mTLS client cert/key/CA paths
- Proxy mode keeps signing outside MCP process (`starknet-keyring-proxy`)
- Signer boundary API is versioned at `/v1/sign/session-transaction`
- SISNA currently requires explicit production acknowledgement for in-process
  key custody: `KEYRING_ALLOW_INSECURE_IN_PROCESS_KEYS_IN_PRODUCTION=true`
- Direct private key mode is intended for local development only
- All inputs are validated before execution
- Transactions wait for confirmation before returning
- Comprehensive error handling for all operations

## License

MIT
