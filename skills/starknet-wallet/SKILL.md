---
name: starknet-wallet
description: >
  Create and manage Starknet wallets for AI agents. Transfer tokens,
  check balances, manage session keys, deploy accounts, and interact
  with smart contracts on Starknet using native Account Abstraction.
keywords:
  - starknet
  - wallet
  - transfer
  - balance
  - session-keys
  - account-abstraction
  - paymaster
  - gasless
  - agent-wallet
  - strk
  - eth
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---

# Starknet Wallet Skill

Manage Starknet wallets for AI agents with native Account Abstraction support.

## Prerequisites

```bash
npm install starknet@^8.9.1 @avnu/avnu-sdk@^4.0.1
```

Environment variables:
```
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
```

## Core Operations

### Check Balance

```typescript
import { RpcProvider, Contract } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

// ETH balance (starknet.js v8 uses options object for Contract)
const ethAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const ethContract = new Contract({
  abi: erc20Abi,
  address: ethAddress,
  providerOrAccount: provider,
});
const balance = await ethContract.balanceOf(accountAddress);

// starknet.js v8: Convert uint256 to bigint
const balanceBigInt = BigInt(balance.low) + (BigInt(balance.high) << 128n);
// Format: (balanceBigInt / 10n ** 18n).toString() for whole units
```

### Transfer Tokens

```typescript
import { Account, RpcProvider, CallData, cairo, ETransactionVersion } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

// starknet.js v8: Account uses options object
const account = new Account({
  provider,
  address: process.env.STARKNET_ACCOUNT_ADDRESS,
  signer: process.env.STARKNET_PRIVATE_KEY,
  transactionVersion: ETransactionVersion.V3,
});

const tokenAddress = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"; // STRK

// starknet.js v8: Use cairo.uint256() instead of uint256.bnToUint256()
const { transaction_hash } = await account.execute({
  contractAddress: tokenAddress,
  entrypoint: "transfer",
  calldata: CallData.compile({
    recipient: recipientAddress,
    amount: cairo.uint256(amountInWei),
  }),
});
await account.waitForTransaction(transaction_hash);
```

### Estimate Fees

```typescript
const estimatedFee = await account.estimateInvokeFee({
  contractAddress: tokenAddress,
  entrypoint: "transfer",
  calldata: CallData.compile({
    recipient: recipientAddress,
    amount: cairo.uint256(amountInWei),
  }),
});
// estimatedFee.overall_fee -- total fee in STRK (V3 transactions)
```

### Multi-Call (Batch Transactions)

```typescript
// Execute multiple operations in a single transaction
const { transaction_hash } = await account.execute([
  {
    contractAddress: tokenA,
    entrypoint: "approve",
    calldata: CallData.compile({
      spender: routerAddress,
      amount: cairo.uint256(amount),
    }),
  },
  {
    contractAddress: routerAddress,
    entrypoint: "swap",
    calldata: CallData.compile({ /* swap params */ }),
  },
]);
```

### Gasless Transfer (Pay Gas in Token) - SDK v4 + PaymasterRpc

```typescript
import { getQuotes, executeSwap } from "@avnu/avnu-sdk";
import { PaymasterRpc } from "starknet";

// SDK v4: Use PaymasterRpc from starknet.js
// Mainnet: https://starknet.paymaster.avnu.fi
// Sepolia: https://sepolia.paymaster.avnu.fi
const paymaster = new PaymasterRpc({
  nodeUrl: process.env.AVNU_PAYMASTER_URL || "https://starknet.paymaster.avnu.fi",
});

// Any swap can be made gasless by adding paymaster option
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01,
  executeApprove: true,
  paymaster: {
    active: true,
    provider: paymaster,
    params: {
      feeMode: {
        mode: "default",
        gasToken: usdcAddress, // Pay gas in USDC instead of ETH/STRK
      },
    },
  },
});
```

## Token Addresses

| Token | Mainnet Address |
|-------|----------------|
| ETH | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` |
| STRK | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| USDC | `0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8` |
| USDT | `0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8` |
| DAI | `0x00da114221cb83fa859dbdb4c44beeaa0bb37c7537ad5ae66fe5e0efd20e6eb3` |
| WBTC | `0x03fe2b97c1fd336e750087d68b9b867997fd64a2661ff3ca5a7c771641e8e7ac` |

## Session Keys (Agent Autonomy)

Session keys allow agents to execute pre-approved transactions without per-action human approval:

1. Human owner creates a session key with policies:
   - Allowed contract addresses and methods
   - Maximum spending per transaction/period
   - Expiry timestamp
2. Agent uses the session key for autonomous operations
3. Owner can revoke at any time

Reference implementation: [Cartridge Controller](https://docs.cartridge.gg/controller/getting-started)

## Configuration

| Variable | Purpose | Default |
|----------|---------|---------|
| `STARKNET_RPC_URL` | Starknet JSON-RPC endpoint | Required |
| `STARKNET_ACCOUNT_ADDRESS` | Agent's account address | Required |
| `STARKNET_PRIVATE_KEY` | Agent's signing key | Required |
| `AVNU_BASE_URL` | avnu API base URL | `https://starknet.api.avnu.fi` |
| `AVNU_PAYMASTER_URL` | avnu paymaster URL | `https://starknet.paymaster.avnu.fi` |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `INSUFFICIENT_BALANCE` | Not enough tokens | Check balance before transfer |
| `INVALID_NONCE` | Nonce mismatch | Retry with fresh nonce |
| `TRANSACTION_REVERTED` | Contract execution failed | Check calldata and allowances |
| `FEE_TRANSFER_FAILURE` | Can't pay gas fee | Use paymaster or add ETH/STRK |

## References

- [starknet.js Documentation](https://www.starknetjs.com/)
- [Starknet Account Abstraction](https://www.starknet.io/blog/native-account-abstraction/)
- [Session Keys Guide](https://www.starknet.io/blog/session-keys-on-starknet-unlocking-gasless-secure-transactions/)
- [avnu Paymaster](https://docs.avnu.fi/paymaster)
