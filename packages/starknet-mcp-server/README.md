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

Create a `.env` file with your Starknet credentials:

```bash
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
AVNU_BASE_URL=https://starknet.api.avnu.fi  # Optional
```

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

- Private keys are loaded from environment variables only
- All inputs are validated before execution
- Transactions wait for confirmation before returning
- Comprehensive error handling for all operations

## License

MIT
