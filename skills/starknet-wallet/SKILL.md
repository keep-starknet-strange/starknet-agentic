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
npm install starknet @avnu/avnu-sdk ethers
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
import { RpcProvider, Contract, uint256 } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

// ETH balance
const ethAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
const ethContract = new Contract(erc20Abi, ethAddress, provider);
const balance = await ethContract.balanceOf(accountAddress);
// balance is a uint256 -- use ethers.formatUnits(balance, 18)
```

### Transfer Tokens

```typescript
import { Account, RpcProvider, constants, CallData } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
const account = new Account(
  provider,
  process.env.STARKNET_ACCOUNT_ADDRESS,
  process.env.STARKNET_PRIVATE_KEY,
  undefined,
  constants.TRANSACTION_VERSION.V3
);

const tokenAddress = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"; // STRK
const { transaction_hash } = await account.execute({
  contractAddress: tokenAddress,
  entrypoint: "transfer",
  calldata: CallData.compile({
    recipient: recipientAddress,
    amount: uint256.bnToUint256(amountInWei),
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
    amount: uint256.bnToUint256(amountInWei),
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
    calldata: CallData.compile({ spender: routerAddress, amount: uint256.bnToUint256(amount) }),
  },
  {
    contractAddress: routerAddress,
    entrypoint: "swap",
    calldata: CallData.compile({ /* swap params */ }),
  },
]);
```

### Gasless Transfer (User Pays in Token)

```typescript
import { executeSwap, getQuotes } from "@avnu/avnu-sdk";

// Any swap or transfer can be made gasless by adding paymaster option
const result = await executeSwap({
  provider: account,
  quote: bestQuote,
  slippage: 0.01,
  executeApprove: true,
  paymaster: {
    apiBaseUrl: "https://starknet.api.avnu.fi/paymaster/v1",
    gasTokenAddress: usdcAddress, // Pay gas in USDC instead of ETH
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
- [AVNU Paymaster](https://docs.avnu.fi/paymaster)
