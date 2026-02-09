# create-starknet-agent

CLI tool to scaffold a Starknet AI agent project. Part of the [starknet-agentic](https://github.com/keep-starknet-strange/starknet-agentic) infrastructure.

## Quick Start

```bash
npx create-starknet-agent@latest my-agent
```

## Usage

### Interactive Mode

Simply run the command and follow the prompts:

```bash
npx create-starknet-agent@latest
```

### With Arguments

```bash
# Specify project name
npx create-starknet-agent@latest my-agent

# Choose a template
npx create-starknet-agent@latest my-agent --template defi

# Choose network
npx create-starknet-agent@latest my-agent --network sepolia

# Skip prompts (use defaults)
npx create-starknet-agent@latest my-agent -y
```

## Templates

### minimal

Basic wallet operations: balance checks, transfers.

```bash
npx create-starknet-agent@latest my-agent --template minimal
```

### defi

Wallet + DeFi capabilities via AVNU aggregator: swaps, price monitoring, arbitrage detection.

```bash
npx create-starknet-agent@latest my-agent --template defi
```

### full

Complete agent with wallet, DeFi, on-chain identity (ERC-8004), and A2A protocol support.

```bash
npx create-starknet-agent@latest my-agent --template full
```

## Options

| Option | Description |
|--------|-------------|
| `--template <name>` | Template: `minimal`, `defi`, or `full` |
| `--network <name>` | Network: `mainnet`, `sepolia`, or `custom` |
| `--yes`, `-y` | Skip prompts, use defaults |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

## Generated Project Structure

```
my-agent/
├── src/
│   ├── index.ts      # Agent entry point
│   ├── config.ts     # Configuration (defi/full templates)
│   ├── identity.ts   # Identity module (full template)
│   └── utils.ts      # Shared utilities
├── .env.example      # Environment template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## After Generation

1. Navigate to your project:
   ```bash
   cd my-agent
   ```

2. Install dependencies (if not done automatically):
   ```bash
   pnpm install
   ```

3. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your Starknet account address and private key
   ```

4. Run your agent:
   ```bash
   pnpm start
   ```

## Requirements

- Node.js >= 18.0.0
- A Starknet account (create with Argent X or Braavos)
- Testnet funds (get from faucet for Sepolia)

## Resources

- [Starknet Agentic Docs](https://starknet-agentic.vercel.app)
- [GitHub Repository](https://github.com/keep-starknet-strange/starknet-agentic)
- [starknet.js Documentation](https://www.starknetjs.com/)
- [AVNU SDK](https://github.com/avnu-labs/avnu-sdk)

## License

MIT
