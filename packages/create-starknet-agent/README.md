# create-starknet-agent

Add Starknet capabilities to any AI agent. Works with OpenClaw, Claude Code, Cursor, or as a standalone agent.

Part of the [starknet-agentic](https://github.com/keep-starknet-strange/starknet-agentic) infrastructure.

## Quick Start

```bash
npx create-starknet-agent@latest
```

The CLI detects your environment and sets up Starknet accordingly:

| Environment | What happens |
|-------------|--------------|
| OpenClaw / MoltBook | Configures MCP server + installs skills |
| Claude Code | Adds MCP config + updates CLAUDE.md |
| Cursor | Configures MCP in Cursor settings |
| None detected | Scaffolds a full standalone agent |

## For OpenClaw / MoltBook Users

If you're already using OpenClaw, just run the CLI and it configures everything:

```bash
npx create-starknet-agent@latest

# Or let your agent do it:
# "Hey, I want you to be able to use Starknet"
# Agent runs: npx create-starknet-agent@latest --non-interactive
```

**What gets configured:**
- MCP server pointing to `@starknet-agentic/mcp-server`
- Skills: `starknet-wallet`, `starknet-defi`
- Environment template for credentials

**After setup:**
```
1. Add your credentials (private key, account address)
2. Restart your agent
3. Try: "What's my ETH balance on Starknet?"
```

## For Claude Code Users

```bash
npx create-starknet-agent@latest
```

**What gets configured:**
- MCP server in `.claude/settings.local.json`
- CLAUDE.md updated with Starknet skill references
- `.env.example` with required variables

## Standalone Mode

For developers building custom agents from scratch:

```bash
npx create-starknet-agent@latest my-agent
cd my-agent
cp .env.example .env
# Edit .env with your credentials
pnpm start
```

Your agent will be available at `http://localhost:3000`.

<details>
<summary><strong>Standalone Features</strong></summary>

- **Autonomous Agent Loop** — Event-driven processing with scheduled tasks
- **Web UI Dashboard** — Chat interface, balance display, transaction history
- **MCP Server Integration** — Starknet tools via [starknet-mcp-server](../starknet-mcp-server)
- **Skill System** — Load skills from starknet-agentic or custom GitHub URLs
- **Multi-LLM Support** — Claude API, OpenAI, Ollama, or Claude Code CLI
- **On-Chain Identity** — Optional ERC-8004 registration for trust and reputation
- **A2A Protocol** — Agent discovery via `/.well-known/agent.json`
- **SQLite Storage** — Persistent conversations, transactions, and logs
- **Docker Ready** — Production deployment with included Dockerfile

</details>

<details>
<summary><strong>Standalone Project Structure</strong></summary>

```
my-agent/
├── src/
│   ├── index.ts              # Entry point (starts server + agent)
│   ├── agent/
│   │   ├── runtime.ts        # Agent lifecycle management
│   │   ├── loop.ts           # Event-driven + scheduled task loop
│   │   ├── reasoning.ts      # LLM provider abstraction
│   │   └── actions.ts        # Action execution (MCP tool calls)
│   ├── server/
│   │   ├── routes/           # REST API + WebSocket handlers
│   │   └── middleware/       # Auth, logging, error handling
│   ├── mcp/
│   │   ├── client.ts         # MCP sidecar management
│   │   └── tools.ts          # Tool registry and execution
│   ├── skills/
│   │   ├── loader.ts         # Skill discovery and loading
│   │   └── installed/        # Local skill installations
│   ├── storage/
│   │   └── sqlite.ts         # SQLite persistence
│   └── utils/                # Logger, config, helpers
├── ui/                       # Next.js Web UI
├── data/                     # SQLite database, logs
├── agent.config.ts           # Agent configuration
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── CLAUDE.md                 # Customization guide
└── README.md
```

</details>

## CLI Options

```bash
# Platform integration (auto-detect)
npx create-starknet-agent@latest

# Force specific platform
npx create-starknet-agent@latest --platform openclaw
npx create-starknet-agent@latest --platform claude-code
npx create-starknet-agent@latest --platform standalone

# Select skills
npx create-starknet-agent@latest --skills starknet-wallet,starknet-defi

# Select network
npx create-starknet-agent@latest --network sepolia

# Non-interactive (for agent self-setup)
npx create-starknet-agent@latest --non-interactive --json

# Verify setup
npx create-starknet-agent verify

# Setup credentials securely
npx create-starknet-agent credentials
```

| Option | Description |
|--------|-------------|
| `--platform <name>` | Force platform: `openclaw`, `claude-code`, `cursor`, `standalone` |
| `--skills <list>` | Comma-separated skills to install |
| `--network <name>` | Network: `mainnet`, `sepolia` |
| `--non-interactive` | Skip all prompts (for agent self-setup) |
| `--json` | Output machine-readable JSON |
| `--yes`, `-y` | Accept defaults |
| `--help`, `-h` | Show help |

## Available Skills

| Skill | Description |
|-------|-------------|
| `starknet-wallet` | Balances, transfers, account management |
| `starknet-defi` | Swaps, quotes via AVNU aggregator |
| `starknet-identity` | ERC-8004 registration and reputation |
| `starknet-anonymous-wallet` | Privacy-focused wallet operations |

## MCP Tools

Once configured, your agent can use these Starknet tools:

| Tool | Description |
|------|-------------|
| `starknet_get_balance` | Get token balance |
| `starknet_get_balances` | Get multiple token balances |
| `starknet_transfer` | Transfer tokens |
| `starknet_swap` | Token swap via AVNU |
| `starknet_get_quote` | Get swap quote |
| `starknet_call_contract` | Read-only contract call |
| `starknet_invoke_contract` | State-changing contract call |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STARKNET_RPC_URL` | No | Starknet RPC (defaults to public RPC) |
| `STARKNET_ACCOUNT_ADDRESS` | Yes | Your Starknet account address |
| `STARKNET_PRIVATE_KEY` | Yes | Account private key |

## Agent Self-Setup

Agents can configure themselves by running the CLI in non-interactive mode:

```bash
npx create-starknet-agent@latest --non-interactive --json
```

Returns:
```json
{
  "success": true,
  "platform": "openclaw",
  "configured": {
    "mcp": "~/.openclaw/mcp/starknet.json",
    "skills": ["starknet-wallet", "starknet-defi"]
  },
  "pendingSetup": {
    "credentials": ["STARKNET_PRIVATE_KEY", "STARKNET_ACCOUNT_ADDRESS"]
  },
  "nextSteps": [
    "Add credentials to ~/.openclaw/secrets/starknet/",
    "Restart agent to load new MCP server"
  ]
}
```

## Verification

Confirm your setup is working:

```bash
npx create-starknet-agent verify
```

Checks:
- MCP server configuration exists
- Required credentials are set
- Skills are installed
- Can query Starknet (optional balance check)

## Requirements

- Node.js >= 18.0.0
- A Starknet account (Argent X, Braavos, or custom)
- Testnet funds for Sepolia (use a [faucet](https://starknet-faucet.vercel.app))

## Resources

- [Starknet Agentic Docs](https://starknet-agentic.vercel.app)
- [GitHub Repository](https://github.com/keep-starknet-strange/starknet-agentic)
- [Technical Specification](./docs/SPEC.md)
- [Feature Roadmap](./docs/ROADMAP.md)
- [starknet.js Documentation](https://www.starknetjs.com/)
- [AVNU SDK](https://github.com/avnu-labs/avnu-sdk)

## License

MIT
