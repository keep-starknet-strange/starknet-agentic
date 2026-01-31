---
name: starknet-defi
description: >
  Execute DeFi operations on Starknet: token swaps with best-price routing
  via AVNU aggregator, DCA recurring buys, STRK staking, lending/borrowing,
  and liquidity provision. Supports gasless and gasfree transactions.
keywords:
  - starknet
  - defi
  - swap
  - dca
  - staking
  - lending
  - avnu
  - ekubo
  - jediswap
  - zklend
  - nostra
  - aggregator
  - yield
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---

# Starknet DeFi Skill

Execute DeFi operations on Starknet using AVNU aggregator and native protocols.

## Prerequisites

```bash
npm install starknet @avnu/avnu-sdk ethers
```

## Token Swaps (AVNU)

### Get Quote and Execute Swap

```typescript
import { getQuotes, executeSwap, QuoteRequest } from "@avnu/avnu-sdk";
import { Account, RpcProvider, constants } from "starknet";
import { parseUnits } from "ethers";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
const account = new Account(provider, address, privateKey, undefined, constants.TRANSACTION_VERSION.V3);

const AVNU_BASE_URL = "https://starknet.api.avnu.fi";

// Get best quote
const quoteRequest: QuoteRequest = {
  sellTokenAddress: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", // ETH
  buyTokenAddress: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",  // STRK
  sellAmount: parseUnits("0.1", 18),
  takerAddress: account.address,
};

const quotes = await getQuotes(quoteRequest, { baseUrl: AVNU_BASE_URL });
const bestQuote = quotes[0];

// Execute swap
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01, // 1%
  executeApprove: true,
});
console.log("Tx:", result.transactionHash);
```

### Build Swap Calls (for multicall composition)

```typescript
import { quoteToCalls } from "@avnu/avnu-sdk";

const calls = await quoteToCalls({
  quote: bestQuote,
  takerAddress: account.address,
  slippage: 0.01,
  includeApprove: true,
});
// `calls` can be combined with other calls in account.execute([...calls, ...otherCalls])
```

### Gasless Swap (Pay Gas in Token)

```typescript
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01,
  executeApprove: true,
  paymaster: {
    apiBaseUrl: "https://starknet.api.avnu.fi/paymaster/v1",
    gasTokenAddress: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", // USDC
  },
});
```

## DCA (Dollar Cost Averaging)

### Create DCA Order

```typescript
import { executeCreateDca } from "@avnu/avnu-sdk";
import moment from "moment";

const dcaOrder = {
  sellTokenAddress: usdcAddress,
  buyTokenAddress: strkAddress,
  totalAmount: parseUnits("100", 6),   // Total 100 USDC
  numberOfOrders: 10,                   // Split into 10 orders
  frequency: moment.duration(1, "day").asSeconds(), // Daily
  startAt: Math.floor(Date.now() / 1000),
};

const result = await executeCreateDca({
  provider: account,
  order: dcaOrder,
});
```

### Check and Cancel DCA

```typescript
import { getDcaOrders, executeCancelDca } from "@avnu/avnu-sdk";

const orders = await getDcaOrders({
  traderAddress: account.address,
  status: "OPEN",
});

// Cancel an order
await executeCancelDca({
  provider: account,
  orderAddress: orders[0].orderAddress,
});
```

## STRK Staking

### Stake STRK

```typescript
import { executeStake, getAvnuStakingInfo } from "@avnu/avnu-sdk";

// Get pool info
const stakingInfo = await getAvnuStakingInfo();
// stakingInfo.pools[0] = { address, apy, tvl, token, minStake }

const result = await executeStake({
  provider: account,
  poolAddress: stakingInfo.pools[0].address,
  amount: parseUnits("100", 18), // 100 STRK
});
```

### Claim Rewards

```typescript
import { executeClaimRewards } from "@avnu/avnu-sdk";

// Claim and restake (compound)
await executeClaimRewards({
  provider: account,
  poolAddress: poolAddress,
  restake: true,
});
```

### Unstake

```typescript
import { executeInitiateUnstake, executeUnstake } from "@avnu/avnu-sdk";

// Step 1: Initiate (starts cooldown -- 21 days for STRK)
await executeInitiateUnstake({
  provider: account,
  poolAddress: poolAddress,
  amount: parseUnits("50", 18),
});

// Step 2: Complete unstake (after cooldown period)
await executeUnstake({
  provider: account,
  poolAddress: poolAddress,
});
```

## Market Data

### Token Prices

```typescript
import { getPrices, fetchTokens, fetchVerifiedTokenBySymbol } from "@avnu/avnu-sdk";

// Get token by symbol
const strk = await fetchVerifiedTokenBySymbol("STRK");

// Get prices for multiple tokens
const prices = await getPrices([ethAddress, strkAddress, usdcAddress]);
// prices = { "0x049d...": 3200.50, "0x047...": 1.23, ... }

// Browse tokens with pagination
const tokens = await fetchTokens({ page: 0, size: 20, tags: ["verified"] });
```

## Protocol Reference

| Protocol | Operations | Notes |
|----------|-----------|-------|
| **AVNU** | Swap aggregation, DCA, gasless | Best-price routing across all DEXs |
| **Ekubo** | AMM, concentrated liquidity | Highest TVL on Starknet |
| **JediSwap** | AMM, classic pools | V2 with concentrated liquidity |
| **zkLend** | Lending, borrowing | Variable and stable rates |
| **Nostra** | Lending, borrowing | Multi-asset pools |

## Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `STARKNET_RPC_URL` | Starknet JSON-RPC endpoint | Required |
| `STARKNET_ACCOUNT_ADDRESS` | Agent's account address | Required |
| `STARKNET_PRIVATE_KEY` | Agent's signing key | Required |
| `AVNU_API_KEY` | Optional AVNU integrator key | None |
| `AVNU_BASE_URL` | API base URL | `https://starknet.api.avnu.fi` |

## Error Handling

```typescript
async function safeSwap(account, quote, slippage = 0.01) {
  try {
    return await executeSwap({ provider: account, quote, slippage, executeApprove: true });
  } catch (error) {
    if (error.message?.includes("INSUFFICIENT_BALANCE")) {
      throw new Error("Not enough tokens for swap");
    }
    if (error.message?.includes("SLIPPAGE")) {
      // Retry with higher slippage
      return await executeSwap({ provider: account, quote, slippage: slippage * 2, executeApprove: true });
    }
    throw error;
  }
}
```

## References

- [AVNU SDK Documentation](https://docs.avnu.fi/)
- [AVNU Skill (detailed)](https://github.com/avnu-labs/avnu-skill)
- [Ekubo Protocol](https://docs.ekubo.org/)
- [zkLend Documentation](https://docs.zklend.com/)
- [Nostra Finance](https://docs.nostra.finance/)
