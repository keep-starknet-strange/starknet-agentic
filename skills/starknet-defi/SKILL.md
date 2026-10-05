---
name: starknet-defi
description: Execute DeFi operations on Starknet including token swaps via avnu aggregator, DCA recurring buys, STRK staking, and lending/borrowing. Supports gasless transactions.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [starknet, defi, swap, dca, staking, lending, avnu, ekubo, jediswap, zklend, nostra, aggregator, yield]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Starknet DeFi Skill

Execute DeFi operations on Starknet using avnu aggregator and native protocols.

## When to Use

- Swaps, DCA orders, staking, and lending or borrowing flows on Starknet.
- Agent workflows that need AVNU routing, paymaster support, or protocol-specific DeFi execution.

## When NOT to Use

- Plain wallet management without DeFi intent.
- Cairo contract authoring, deployment operations, or security auditing.

## Quick Start

1. Install the AVNU + starknet.js dependencies and point the skill at a funded Starknet account.
2. Use [skills catalog](../README.md) when the flow expands into wallet setup, deployment, or auditing.

## Prerequisites

```bash
# ethers is a required peer of @avnu/avnu-sdk (snippets use its parseUnits); moment builds DCA frequencies
npm install starknet@^10.8.0 @avnu/avnu-sdk@^4.2.0 ethers@^6.15.0 moment@^2.30.1
```

## Token Swaps (avnu SDK v4)

### Get Quote and Execute Swap

```typescript
import {
  getQuotes,
  executeSwap,
  fetchVerifiedTokenBySymbol,
  type QuoteRequest,
} from "@avnu/avnu-sdk";
import { Account, RpcProvider, ETransactionVersion } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

// starknet.js v10: Account uses an options object; provider calls go through account.provider
const account = new Account({
  provider,
  address,
  signer: privateKey,
  transactionVersion: ETransactionVersion.V3,
});

// Resolve token addresses via avnu SDK (or use MCP server's TokenService)
const eth = await fetchVerifiedTokenBySymbol("ETH");
const strk = await fetchVerifiedTokenBySymbol("STRK");
// Returns undefined when the symbol is not a verified/unruggable token
if (!eth || !strk) throw new Error("Token not found in avnu token list");

// SDK v4: getQuotes takes QuoteRequest object directly
const quoteParams: QuoteRequest = {
  sellTokenAddress: eth.address,
  buyTokenAddress: strk.address,
  sellAmount: BigInt(10 ** 17), // 0.1 ETH
  takerAddress: account.address,
};

const quotes = await getQuotes(quoteParams);
const bestQuote = quotes[0];

// SDK v4: executeSwap takes single object param
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01, // 1%
  executeApprove: true,
});
console.log("Tx:", result.transactionHash);
```

### Quote Response Fields (SDK v4)

```typescript
// Main fields of the SDK's exported `Quote` type
interface Quote {
  quoteId: string;
  chainId: string;            // executeSwap rejects a quote from another network
  sellTokenAddress: string;
  buyTokenAddress: string;
  sellAmount: bigint;
  buyAmount: bigint;
  sellAmountInUsd: number;
  buyAmountInUsd: number;
  priceImpact: number;        // In basis points (15 = 0.15%)
  gasFees: bigint;
  gasFeesInUsd?: number;
  expiry?: number | null;
  routes: Array<{
    name: string;             // e.g., "Ekubo", "JediSwap"
    address: string;
    percent: number;          // e.g., 0.8 = 80%
  }>;
  fee: {
    feeToken: string;
    avnuFees: bigint;
    integratorFees: bigint;
  };
}
```

### Build Swap Calls (for multicall composition)

```typescript
import { quoteToCalls } from "@avnu/avnu-sdk";

// Returns AvnuCalls: { chainId, calls }
const { calls } = await quoteToCalls({
  quoteId: bestQuote.quoteId,
  takerAddress: account.address,
  slippage: 0.01,
  executeApprove: true,
});
// `calls` can be combined with other calls in account.execute([...calls, ...otherCalls])
```

### Gasless Swap (Pay Gas in Token) - SDK v4 + PaymasterRpc

```typescript
import { getQuotes, executeSwap } from "@avnu/avnu-sdk";
import { PaymasterRpc } from "starknet";

const quotes = await getQuotes(quoteParams);
const bestQuote = quotes[0];

// SDK v4: Use PaymasterRpc from starknet.js
// Mainnet: https://starknet.paymaster.avnu.fi
// Sepolia: https://sepolia.paymaster.avnu.fi
const paymaster = new PaymasterRpc({
  nodeUrl: process.env.AVNU_PAYMASTER_URL || "https://starknet.paymaster.avnu.fi",
});

const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01,
  executeApprove: true,
  paymaster: {
    active: true,
    provider: paymaster,
    params: {
      version: "0x1",
      feeMode: {
        mode: "default",
        gasToken: "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb", // USDC
      },
    },
  },
});
```

## DCA (Dollar Cost Averaging)

### Create DCA Order

```typescript
import { executeCreateDca, type CreateDcaOrder } from "@avnu/avnu-sdk";
import { parseUnits } from "ethers";
import moment from "moment";

// Amounts are base-unit decimal strings; cycles = sellAmount / sellAmountPerCycle
const dcaOrder: CreateDcaOrder = {
  sellTokenAddress: usdcAddress,
  buyTokenAddress: strkAddress,
  sellAmount: parseUnits("100", 6).toString(),        // Total 100 USDC
  sellAmountPerCycle: parseUnits("10", 6).toString(), // 10 USDC per cycle -> 10 cycles
  frequency: moment.duration(1, "day"),               // moment.Duration object, not string
  pricingStrategy: {},                                // Market order; or { tokenToMinAmount, tokenToMaxAmount } (hex)
  traderAddress: account.address,
};

const result = await executeCreateDca({
  provider: account,
  order: dcaOrder,
});
console.log("Tx:", result.transactionHash);
```

### Check and Cancel DCA

```typescript
import { getDcaOrders, executeCancelDca, DcaOrderStatus } from "@avnu/avnu-sdk";

// Returns Page<DcaOrder>; the orders are in `content`
const { content: orders } = await getDcaOrders({
  traderAddress: account.address,
  status: DcaOrderStatus.ACTIVE, // INDEXING | ACTIVE | CLOSED
});

// Cancel an order (unspent funds return to the trader)
const [order] = orders;
if (order) {
  await executeCancelDca({
    provider: account,
    orderAddress: order.orderAddress,
  });
}
```

## STRK Staking

### Stake STRK

```typescript
import { executeStake, getAvnuStakingInfo } from "@avnu/avnu-sdk";
import { parseUnits } from "ethers";

// Get avnu's delegation pools
const stakingInfo = await getAvnuStakingInfo();
// stakingInfo.delegationPools[i] = { poolAddress, tokenAddress, stakedAmount, stakedAmountInUsd, apr }
const strkPool = stakingInfo.delegationPools.find(
  (pool) => BigInt(pool.tokenAddress) === BigInt(TOKENS.STRK),
);
if (!strkPool) throw new Error("avnu STRK delegation pool not found");

const result = await executeStake({
  provider: account,
  poolAddress: strkPool.poolAddress,
  amount: parseUnits("100", 18), // 100 STRK
});
```

### Get User Staking Info

```typescript
import { getUserStakingInfo } from "@avnu/avnu-sdk";

const userInfo = await getUserStakingInfo(TOKENS.STRK, account.address);
console.log("Staked:", userInfo.amount);
console.log("Unclaimed rewards:", userInfo.unclaimedRewards);
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
import { parseUnits } from "ethers";

// Step 1: Initiate (starts the 7-day unbonding period)
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

// Get token by symbol (undefined if not a verified/unruggable token)
const strk = await fetchVerifiedTokenBySymbol("STRK");
if (!strk) throw new Error("STRK not found in avnu token list");

// Get prices for multiple tokens (1-50 per request)
const prices = await getPrices([ethAddress, strk.address, usdcAddress]);
// prices = [{ address, decimals, starknetMarket: { usd } | null, globalMarket: { usd } | null }, ...]
const strkUsd = prices.find((p) => BigInt(p.address) === BigInt(strk.address))?.starknetMarket?.usd;

// Browse tokens with pagination (returns Page<Token>; tokens are in `content`)
const { content: tokens } = await fetchTokens({ page: 0, size: 20, tags: ["Verified"] });
```

## Protocol Reference

| Protocol | Operations | Notes |
|----------|-----------|-------|
| **avnu** | Swap aggregation, DCA, gasless | Best-price routing across all DEXs |
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
| `AVNU_BASE_URL` | avnu API base URL | `https://starknet.api.avnu.fi` |
| `AVNU_PAYMASTER_URL` | avnu paymaster URL | `https://starknet.paymaster.avnu.fi` |
| `AVNU_API_KEY` | Optional avnu integrator key | None |

### avnu URL Reference

| Network | API URL | Paymaster URL |
|---------|---------|---------------|
| Mainnet | `https://starknet.api.avnu.fi` | `https://starknet.paymaster.avnu.fi` |
| Sepolia | `https://sepolia.api.avnu.fi` | `https://sepolia.paymaster.avnu.fi` |

## Error Handling

```typescript
import { executeSwap, ContractError, type Quote } from "@avnu/avnu-sdk";
import type { AccountInterface } from "starknet";

async function safeSwap(account: AccountInterface, quote: Quote, slippage = 0.01) {
  try {
    return await executeSwap({
      provider: account,
      quote,
      slippage,
      executeApprove: true,
    });
  } catch (error) {
    // avnu API errors are plain Errors; contract reverts are ContractError with a revertError
    const message =
      error instanceof ContractError ? `${error.message} ${error.revertError}`
      : error instanceof Error ? error.message
      : String(error);
    if (message.includes("Invalid chainId")) {
      throw new Error("Quote and account are on different networks");
    }
    if (message.includes("INSUFFICIENT_BALANCE")) {
      throw new Error("Not enough tokens for swap");
    }
    if (message.includes("SLIPPAGE") || message.includes("Insufficient tokens received")) {
      // Retry with higher slippage
      return await executeSwap({
        provider: account,
        quote,
        slippage: slippage * 2,
        executeApprove: true,
      });
    }
    if (message.includes("QUOTE_EXPIRED")) {
      throw new Error("Quote expired. Please retry the operation.");
    }
    if (message.includes("INSUFFICIENT_LIQUIDITY")) {
      throw new Error("Insufficient liquidity. Try a smaller amount.");
    }
    throw error;
  }
}
```

## References

- [avnu SDK Documentation](https://docs.avnu.fi/)
- [avnu Skill (detailed)](https://github.com/avnu-labs/avnu-skill)
- [Ekubo Protocol](https://docs.ekubo.org/)
- [zkLend Documentation](https://docs.zklend.com/)
- [Nostra Finance](https://docs.nostra.finance/)
