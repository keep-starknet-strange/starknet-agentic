# DeFi Agent Example

A complete, production-ready example of an autonomous DeFi agent built on Starknet using the starknet-agentic infrastructure.

## What This Agent Does

This agent autonomously:

1. **Monitors Markets**: Continuously checks for arbitrage opportunities
2. **Executes Trades**: Automatically swaps tokens when profitable
3. **Manages Risk**: Enforces maximum trade sizes and minimum profit thresholds
4. **Tracks Performance**: Logs all trades and maintains statistics

## Strategy: Triangular Arbitrage

The agent looks for price discrepancies in the ETH ↔ STRK pair:

```
ETH → STRK → ETH
```

If the round-trip results in more ETH than started with (after fees), it executes the trade.

## Features

- ✅ Real-time opportunity detection
- ✅ Configurable profit thresholds
- ✅ Risk management (max trade size)
- ✅ Best-price routing via avnu aggregator
- ✅ Comprehensive error handling
- ✅ Graceful shutdown with statistics
- ✅ Low-balance warnings
- ✅ Detailed logging

## Setup

### 1. Install Dependencies

```bash
cd examples/defi-agent
npm install
```

### 2. Configure Environment

Create a `.env` file:

```env
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
```

### 3. Adjust Parameters (Optional)

Edit `index.ts` to customize:

```typescript
const CONFIG = {
  MIN_PROFIT_BPS: 50,        // Minimum 0.5% profit
  MAX_TRADE_AMOUNT_ETH: "0.01", // Max 0.01 ETH per trade
  CHECK_INTERVAL_MS: 30000,  // Check every 30 seconds
};
```

## Running the Agent

### Development Mode (with hot reload)

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

## Expected Output

```
🤖 DeFi Agent Starting...
📍 Address: 0x1234...5678
💰 ETH Balance: 0.0523 ETH
✅ Agent is now running
🔍 Monitoring for opportunities every 30s

[10:30:45] 🔍 Checking for opportunities...
   No profitable opportunities (best: 0.23%)

[10:31:15] 🔍 Checking for opportunities...

💎 OPPORTUNITY FOUND!
   Profit: 0.67%
   Path: ETH → STRK → ETH

📤 Executing first swap (ETH → STRK)...
   ✅ Swap 1 complete: 0xabc...def
📤 Executing second swap (STRK → ETH)...
   ✅ Swap 2 complete: 0x123...456

✅ Trade #1 completed

[10:31:45] 🔍 Checking for opportunities...
   No profitable opportunities (best: 0.12%)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         DeFi Agent                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │   Monitor     │  │   Arbitrage   │  │   Risk Manager    │   │
│  │   Loop        │──│   Detector    │──│   (limits/thresh) │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        avnu SDK                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  getQuotes()  │  │ executeSwap() │  │  Best-price       │   │
│  │  price check  │  │  trade exec   │  │  routing          │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      starknet.js                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  RpcProvider  │  │    Account    │  │    Contract       │   │
│  │  (read ops)   │  │  (signing)    │  │  (balance check)  │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Starknet L2                                 │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  ETH Token    │  │  STRK Token   │  │  DEX Liquidity    │   │
│  │  Contract     │  │  Contract     │  │  Pools            │   │
│  └───────────────┘  └───────────────┘  └───────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Monitor Loop (every 30s)
   │
   ├──► getQuotes(ETH → STRK) ──► avnu API
   │
   ├──► getQuotes(STRK → ETH) ──► avnu API
   │
   ├──► Calculate profit = (final - initial) / initial
   │
   └──► If profit >= MIN_PROFIT_BPS
        │
        ├──► executeSwap(ETH → STRK) ──► Starknet TX
        │
        └──► executeSwap(STRK → ETH) ──► Starknet TX
```

## How It Works

### 1. Market Monitoring

Every 30 seconds (configurable), the agent:
- Fetches quotes for ETH → STRK
- Fetches quotes for STRK → ETH
- Calculates net profit/loss

### 2. Opportunity Detection

Executes if:
- Round-trip profit ≥ 0.5% (50 basis points)
- Agent has sufficient balance
- Both swaps have available liquidity

### 3. Trade Execution

When opportunity found:
1. Execute swap 1: ETH → STRK (via avnu best route)
2. Wait for confirmation
3. Execute swap 2: STRK → ETH (via avnu best route)
4. Wait for confirmation
5. Log results

### 4. Risk Management

- **Max Trade Size**: Limits exposure per trade
- **Slippage Protection**: 1% max slippage on swaps
- **Balance Checks**: Warns if ETH balance too low
- **Error Handling**: Continues monitoring even if trade fails

## Safety Features

### Mainnet Safety

⚠️ **This example uses REAL MONEY on Starknet Mainnet**

Recommended for learning:
1. Use testnet first (change RPC_URL to Sepolia)
2. Start with very small trade amounts
3. Increase MIN_PROFIT_BPS to be more selective
4. Monitor closely for first few trades

### Testnet Configuration

```env
STARKNET_RPC_URL=https://starknet-sepolia.public.blastapi.io
# Use testnet account
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
```

## Understanding the Code

### Key Components

```typescript
// Main agent class
class DeFiAgent {
  start()                    // Begin monitoring
  stop()                     // Stop agent
  checkOpportunities()       // Find profitable trades
  findArbitrage()           // Calculate profitability
  executeArbitrage()        // Execute the trade
}
```

### Profitability Calculation

```typescript
// If we start with 1 ETH:
1. Swap to STRK → get X STRK
2. Swap back to ETH → get Y ETH
3. Profit = (Y - 1) / 1 * 10000 basis points

// Example: 0.67% profit
// Started: 1.0000 ETH
// Ended:   1.0067 ETH
// Profit:  67 basis points
```

## Extending the Agent

### Add More Trading Pairs

```typescript
// Add USDC arbitrage
await this.findArbitrage(TOKENS.ETH, TOKENS.USDC, amount);
await this.findArbitrage(TOKENS.STRK, TOKENS.USDC, amount);
```

### Add On-Chain Identity

```typescript
import { createStarknetA2AAdapter } from "@starknetfoundation/starknet-agentic-a2a";

const adapter = createStarknetA2AAdapter({ ... });
await adapter.registerAgent(account, {
  name: "DeFi Arbitrage Agent",
  description: "Autonomous triangular arbitrage on Starknet",
  capabilities: ["arbitrage", "swap", "monitor"],
});
```

### Add MCP Integration

The agent can be wrapped as an MCP server to allow AI assistants to control it:

```typescript
// Add to MCP server tools
{
  name: "agent_start",
  description: "Start the DeFi agent",
  // ... implementation
}
```

## Performance Tips

1. **Lower Check Interval**: Check every 10s instead of 30s for more opportunities
2. **Multiple Pairs**: Monitor ETH/STRK, ETH/USDC, STRK/USDC simultaneously
3. **Dynamic Thresholds**: Adjust MIN_PROFIT_BPS based on gas costs
4. **Flashbots**: Use private mempools to avoid front-running

## Troubleshooting

### "No profitable opportunities"

- **Normal**: Most of the time, arbitrage isn't profitable
- **Try**: Lower MIN_PROFIT_BPS (but increases risk)
- **Try**: Check during high volatility periods

### "Low balance warning"

- **Problem**: Not enough ETH for trades
- **Solution**: Send more ETH to agent's address

### "Transaction reverted"

- **Cause**: Slippage too high or liquidity changed
- **Solution**: Increase slippage tolerance or reduce trade size

### "Rate limited"

- **Cause**: Too many API calls to avnu
- **Solution**: Increase CHECK_INTERVAL_MS

## Resources

- [avnu Documentation](https://docs.avnu.fi/)
- [Starknet.js Docs](https://www.starknetjs.com/)
- [Arbitrage Strategies](https://www.investopedia.com/terms/a/arbitrage.asp)

## Disclaimer

This is an educational example. Cryptocurrency trading involves substantial risk of loss. The agent may:
- Lose money due to market volatility
- Fail to execute profitable trades
- Encounter bugs or errors

**Use at your own risk. Start small. Test on testnet first.**

## License

MIT
