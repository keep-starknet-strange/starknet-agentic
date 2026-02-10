# OpenClaw / MoltBook Quickstart

This is the shortest path to give an OpenClaw (MoltBook) agent Starknet capabilities via Agent Skills + the Starknet MCP server.

## 1) Install a Starknet skill

Pick one (start with `starknet-wallet`):

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/starknet-wallet
# or: npx skills add keep-starknet-strange/starknet-agentic   # installs all skills
```

## 2) Configure the Starknet MCP server

Add the MCP server to your agent runtime config and set env vars:

```json
{
  "mcpServers": {
    "starknet": {
      "command": "npx",
      "args": ["@starknet-agentic/mcp-server"],
      "env": {
        "STARKNET_RPC_URL": "https://starknet-sepolia-rpc.publicnode.com",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_PRIVATE_KEY": "0x...",
        "AVNU_PAYMASTER_URL": "https://sepolia.paymaster.avnu.fi",
        "AVNU_PAYMASTER_API_KEY": "..."
      }
    }
  }
}
```

Notes:
- `AVNU_*` is optional, but recommended if you want gasless/sponsored flows.
- Use a testnet account for demos.

## 3) Verify the integration

From any MCP-capable runtime, call one tool:

- `starknet_get_balance` (ETH)
- `starknet_get_balances` (ETH + STRK)

If you get a balance response, your OpenClaw/MoltBook agent can now use Starknet tools through MCP.

## Skill Discovery (Machine-Readable)

For tooling/indexers, we publish a machine-readable list of skills in:
- `skills/manifest.json`

