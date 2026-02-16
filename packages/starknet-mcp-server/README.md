# Starknet MCP Server

An MCP (Model Context Protocol) server that exposes Starknet blockchain operations as tools for AI agents.

## Features

- **Wallet Operations**: Check balances, transfer tokens
- **Contract Interactions**: Call read/write functions on any Starknet contract
- **DeFi Operations**: Execute swaps via avnu aggregator with best-price routing
- **Fee Estimation**: Estimate transaction costs before execution
- **Multi-token Support**: ETH, STRK, USDC, USDT, and custom ERC20 tokens

## Installation

```bash
cd packages/starknet-mcp-server
npm install
npm run build
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
```

Proxy signer mode (recommended for production):

```bash
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_SIGNER_MODE=proxy
KEYRING_PROXY_URL=https://signer.internal:8545
KEYRING_HMAC_SECRET=replace-with-long-random-secret
# mTLS client material (required in production for non-loopback signer URLs)
# KEYRING_TLS_CLIENT_CERT_PATH=/etc/starknet-mcp/tls/client.crt
# KEYRING_TLS_CLIENT_KEY_PATH=/etc/starknet-mcp/tls/client.key
# KEYRING_TLS_CA_PATH=/etc/starknet-mcp/tls/ca.crt
# Optional:
# KEYRING_CLIENT_ID=starknet-mcp-server
# KEYRING_SIGNING_KEY_ID=default
# KEYRING_REQUEST_TIMEOUT_MS=5000
# KEYRING_SESSION_VALIDITY_SECONDS=300
```

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
  "token": "ETH",  // or "STRK", "USDC", "USDT", or contract address
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
- SISNA currently requires explicit production acknowledgement for in-process
  key custody: `KEYRING_ALLOW_INSECURE_IN_PROCESS_KEYS_IN_PRODUCTION=true`
- Direct private key mode is intended for local development only
- All inputs are validated before execution
- Transactions wait for confirmation before returning
- Comprehensive error handling for all operations

## License

MIT
