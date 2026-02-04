# Getting Started with Starknet Agentic

Get your AI agent running on Starknet in **less than 10 minutes**. This guide walks you through setup, your first balance query, and deploying a simple autonomous agent.

## Prerequisites

- Node.js 18+ installed
- A Starknet wallet with some testnet ETH/STRK ([get testnet tokens](https://faucet.goerli.starknet.io/))
- Basic familiarity with TypeScript

## Quick Start (5 Minutes)

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/keep-starknet-strange/starknet-agentic.git
cd starknet-agentic

# Install dependencies
pnpm install

# Build packages
pnpm build
```

### 2. Set Up Environment

Create a `.env` file in the repository root:

```bash
# Copy example environment file
cp .env.example .env
```

Edit `.env` with your Starknet credentials:

```env
# Starknet RPC endpoint (get free key from Alchemy/Infura)
STARKNET_RPC_URL=https://starknet-sepolia.g.alchemy.com/v2/YOUR_KEY

# Your Starknet account address
STARKNET_ACCOUNT_ADDRESS=0x...

# Your account private key (DO NOT share or commit this!)
STARKNET_PRIVATE_KEY=0x...

# Optional: AVNU API for DeFi operations
AVNU_BASE_URL=https://sepolia.api.avnu.fi
AVNU_PAYMASTER_URL=https://sepolia.paymaster.avnu.fi
```

**Getting Your Credentials:**

<details>
<summary>Click to expand: How to get Starknet credentials</summary>

#### Option 1: Use ArgentX Wallet (Recommended)
1. Install [ArgentX browser extension](https://www.argent.xyz/argent-x/)
2. Create a new wallet or import existing one
3. Switch to Sepolia testnet in settings
4. Export private key: Settings → Account → Export Private Key
5. Copy your account address from the wallet

#### Option 2: Use Starknet CLI
```bash
# Install starknet CLI
pip install cairo-lang

# Create new account
starknet new_account --network sepolia

# Follow prompts to get address and private key
```

</details>

### 3. Run Your First Example

Check your ETH balance:

```bash
cd skills/starknet-wallet
npm install
npm run check-balance
```

You should see output like:

```
✅ Balance: 0.5 ETH
Raw: 500000000000000000
Token: 0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7
```

**🎉 Congratulations!** Your agent can now interact with Starknet.

---

## What You Can Build

### 1. Wallet Agent (5 minutes)

Create an agent that manages token balances:

```typescript
// examples/simple-wallet-agent.ts
import { RpcProvider, Account } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

const account = new Account({
  provider,
  address: process.env.STARKNET_ACCOUNT_ADDRESS!,
  signer: process.env.STARKNET_PRIVATE_KEY!,
});

// Check multiple balances efficiently
async function checkPortfolio() {
  const tokens = ["ETH", "STRK", "USDC", "USDT"];
  console.log("📊 Portfolio:");

  // Uses starknet_get_balances MCP tool (batch query)
  // Implementation in skills/starknet-wallet/scripts/check-balances.ts
}

checkPortfolio();
```

### 2. DeFi Agent (15 minutes)

Create an agent that monitors prices and executes swaps:

```typescript
// examples/defi-agent.ts
import { getQuotes, executeSwap } from "@avnu/avnu-sdk";

// Get best quote for swapping 1 ETH to STRK
const quotes = await getQuotes({
  sellTokenAddress: ETH_ADDRESS,
  buyTokenAddress: STRK_ADDRESS,
  sellAmount: BigInt(1e18), // 1 ETH
});

const bestQuote = quotes[0];
console.log(`Best rate: 1 ETH = ${bestQuote.buyAmount} STRK`);

// Execute swap
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01, // 1% slippage
  executeApprove: true,
});

console.log(`✅ Swap complete: ${result.transactionHash}`);
```

**Full example:** See `examples/defi-agent/` for a production-ready arbitrage bot.

### 3. Identity Agent (10 minutes)

Register your agent on-chain with ERC-8004:

```typescript
// Register agent identity
const agentCard = await registerAgent({
  name: "My Trading Bot",
  description: "Autonomous DeFi agent",
  capabilities: ["swap", "arbitrage", "rebalance"],
  owner: account.address,
});

console.log(`✅ Agent registered: ${agentCard.tokenId}`);
```

---

## Using MCP Tools (Claude, ChatGPT, Cursor)

The Starknet MCP Server lets AI assistants interact with Starknet directly.

### Setup MCP Server

```bash
cd packages/starknet-mcp-server
pnpm build

# Run the server
node dist/index.js
```

### Configure with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "starknet": {
      "command": "node",
      "args": ["/path/to/starknet-agentic/packages/starknet-mcp-server/dist/index.js"],
      "env": {
        "STARKNET_RPC_URL": "https://starknet-sepolia.g.alchemy.com/v2/YOUR_KEY",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

**Available Tools:**

| Tool | What It Does |
|------|-------------|
| `starknet_get_balance` | Check single token balance |
| `starknet_get_balances` | Check multiple balances (batch) |
| `starknet_transfer` | Send tokens (with gasless option) |
| `starknet_swap` | Execute token swaps via AVNU |
| `starknet_get_quote` | Get swap price quotes |
| `starknet_call_contract` | Read contract state |
| `starknet_invoke_contract` | Call contract functions |
| `starknet_register_agent` | Register ERC-8004 identity |

**Example Claude conversation:**

```
You: Check my STRK balance
Claude: [calls starknet_get_balance]
Claude: You have 100.5 STRK

You: Swap 10 STRK for ETH
Claude: [calls starknet_get_quote, then starknet_swap]
Claude: ✅ Swapped 10 STRK for 0.023 ETH. Transaction: 0xabc...
```

---

## Project Structure

```
starknet-agentic/
├── packages/
│   ├── starknet-mcp-server/     # MCP tools for AI agents
│   ├── starknet-a2a/            # Agent-to-Agent protocol
│   └── starknet-identity/       # ERC-8004 Cairo contracts
│
├── skills/                      # Reusable agent skills
│   ├── starknet-wallet/        # Wallet management
│   ├── starknet-defi/          # DeFi operations
│   └── starknet-identity/      # On-chain identity
│
├── examples/
│   └── defi-agent/             # Production DeFi bot example
│
├── docs/
│   ├── GETTING_STARTED.md      # This file
│   ├── SPECIFICATION.md        # Technical architecture
│   └── TROUBLESHOOTING.md      # Common issues & solutions
│
└── contracts/                   # Agent Account contracts
```

---

## Next Steps

### Learn More

1. **[Skills Documentation](../skills/README.md)** - Discover reusable agent capabilities
2. **[MCP Tools Reference](../skills/starknet-wallet/SKILL.md)** - All available operations
3. **[DeFi Agent Example](../examples/defi-agent/README.md)** - Production-ready bot
4. **[Architecture Spec](SPECIFICATION.md)** - Deep dive into design

### Build Your Agent

1. **Clone an example** - Start from `examples/defi-agent/`
2. **Customize behavior** - Modify trading strategy
3. **Add session keys** - Enable autonomous execution
4. **Deploy to mainnet** - Switch RPC endpoint to mainnet

### Get Help

- **Issues:** [GitHub Issues](https://github.com/keep-starknet-strange/starknet-agentic/issues)
- **Discussions:** [GitHub Discussions](https://github.com/keep-starknet-strange/starknet-agentic/discussions)
- **Discord:** Join #starknet-agentic channel

---

## Common Patterns

### Error Handling

```typescript
try {
  const result = await transfer(recipient, "ETH", "1.0");
  console.log("✅ Transfer successful:", result.transactionHash);
} catch (error) {
  if (error.message.includes("INSUFFICIENT_BALANCE")) {
    console.error("❌ Not enough tokens");
  } else if (error.message.includes("INVALID_NONCE")) {
    console.error("❌ Nonce mismatch - retrying...");
    // Retry with fresh nonce
  } else {
    console.error("❌ Transfer failed:", error.message);
  }
}
```

### Gas Optimization

```typescript
// ❌ Bad: Multiple separate transactions
await account.execute({ contractAddress: token, entrypoint: "approve", ... });
await account.execute({ contractAddress: router, entrypoint: "swap", ... });

// ✅ Good: Single multi-call transaction
await account.execute([
  { contractAddress: token, entrypoint: "approve", ... },
  { contractAddress: router, entrypoint: "swap", ... },
]);
```

### Gasless Transactions

```typescript
// Pay gas in USDC instead of ETH/STRK
const result = await mcpClient.callTool({
  name: "starknet_transfer",
  arguments: {
    recipient: "0x...",
    token: "STRK",
    amount: "100",
    gasfree: true,
    gasToken: "USDC",  // Agent pays gas in USDC
  }
});
```

---

## FAQs

<details>
<summary><b>Q: Can I use this on mainnet?</b></summary>

Yes! Just change your `STARKNET_RPC_URL` to a mainnet endpoint and use mainnet account credentials. **Start with small amounts on testnet first.**

</details>

<details>
<summary><b>Q: How much does it cost to run an agent?</b></summary>

Gas costs on Starknet are very low:
- Balance query: Free (read-only)
- Token transfer: ~$0.01-0.05
- Swap: ~$0.05-0.20

Use gasless mode to pay gas in tokens instead of ETH.

</details>

<details>
<summary><b>Q: Is this production-ready?</b></summary>

**Smart contracts:** Yes, ERC-8004 contracts are audited and tested (121 tests).

**MCP Server:** Yes, but always test thoroughly before mainnet.

**Examples:** The DeFi agent example is production-ready with risk management.

</details>

<details>
<summary><b>Q: How do I debug issues?</b></summary>

1. Check the [Troubleshooting Guide](TROUBLESHOOTING.md)
2. Enable debug logging: `export DEBUG=starknet:*`
3. Verify RPC endpoint is working: `curl $STARKNET_RPC_URL`
4. Check account balance has enough gas

</details>

<details>
<summary><b>Q: Can my agent execute transactions autonomously?</b></summary>

Yes! Use **session keys** to grant your agent pre-approved transaction permissions:

1. Create a session key with spending limits
2. Agent uses session key for autonomous operations
3. Owner can revoke at any time

See [Agent Account documentation](../contracts/agent-account/README.md) for details.

</details>

---

## Security Best Practices

⚠️ **Never commit private keys to version control**

✅ Use environment variables for secrets

✅ Start with testnet and small amounts

✅ Set spending limits on session keys

✅ Monitor agent activity regularly

✅ Use hardware wallets for large amounts

---

**Ready to build?** Start with the [wallet examples](../skills/starknet-wallet/scripts/) and scale up from there! 🚀
