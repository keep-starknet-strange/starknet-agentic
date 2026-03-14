---
name: starknet-tongo
description: Confidential ERC20 payments on Starknet using Tongo protocol. Fund, transfer, withdraw, and rollover encrypted token balances with zero-knowledge proofs. Use when the user needs privacy-preserving transactions, confidential payments, encrypted balances, or auditable private transfers on Starknet.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [starknet, tongo, privacy, confidential, encrypted, zk-proofs, elgamal, payments, erc20, audit, compliance]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Starknet Tongo Skill

Confidential ERC20 payments on Starknet using the [Tongo protocol](https://github.com/fatlabsxyz/tongo). Tongo wraps any ERC20 token into encrypted balances using ElGamal encryption and zero-knowledge proofs. No trusted setup required.

## When to Use

- Confidential ERC20 payment flows that require encrypted balances or private transfers.
- Compliance or auditor-enabled privacy flows built on top of Tongo accounts.

## When NOT to Use

- Standard transparent ERC20 transfers, swaps, or wallet management without privacy requirements.
- Cairo contract authoring, deployment-only tasks, or security auditing of unrelated code.

## Quick Start

1. Install the Tongo SDK, configure the Starknet/Tongo keys, and connect a funded Starknet account.
2. Use [skills catalog](../README.md) if the flow expands into wallet setup, deployment, or auditing.

## Prerequisites

```bash
npm install @fatsolutions/tongo-sdk starknet@^9.2.1
```

To run the demo script (`scripts/demo-e2e.ts`):

```bash
npm install dotenv && npm install -D tsx
```

Environment variables:

```dotenv
STARKNET_RPC_URL=https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
TONGO_CONTRACT_ADDRESS=0x...
TONGO_PRIVATE_KEY=0x...
TONGO_AUDITOR_PRIVATE_KEY=0x...  # Optional, only needed for auditor/compliance
```

The demo script additionally requires both sender and receiver keys (test-only):

```dotenv
TONGO_PRIVATE_KEY_SENDER=0x...
TONGO_PRIVATE_KEY_RECEIVER=0x...
```

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Fund** | Convert ERC20 tokens into encrypted Tongo balances |
| **Transfer** | Send encrypted amounts between Tongo accounts (ZK-proven) |
| **Rollover** | Merge pending received funds into usable balance |
| **Withdraw** | Convert Tongo balance back to ERC20 (public amount) |
| **Ragequit** | Emergency full withdrawal of entire balance |
| **Outside Fund** | Fund any Tongo account without needing their private key |
| **Auditor** | Optional compliance role that can decrypt all transactions |

Transfers land in the receiver's **pending balance** and must be rolled over before they can be spent.

## Setup

```typescript
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import { Account, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

// Starknet account for paying gas
const account = new Account({
  provider,
  address: process.env.STARKNET_ACCOUNT_ADDRESS,
  signer: process.env.STARKNET_PRIVATE_KEY,
});

// Tongo account for confidential operations
const tongo = new TongoAccount(
  process.env.TONGO_PRIVATE_KEY,
  process.env.TONGO_CONTRACT_ADDRESS,
  provider,
);

console.log("Tongo address:", tongo.tongoAddress()); // Base58-encoded public key
```

## Operations

### Check Encrypted Balance

```typescript
const state = await tongo.state();
console.log("Balance:", state.balance);   // Decrypted current balance
console.log("Pending:", state.pending);   // Funds received but not yet rolled over
console.log("Nonce:", state.nonce);
```

### Fund (ERC20 -> Tongo)

```typescript
const fundOp = await tongo.fund({
  amount: 100n,
  sender: account.address,
  fee_to_sender: 0n,  // Optional relayer fee
});

// Requires ERC20 approval + fund call
const response = await account.execute([fundOp.approve, fundOp.toCalldata()]);
await provider.waitForTransaction(response.transaction_hash);
```

### Transfer (Confidential)

```typescript
// Receiver shares their Tongo address (public -- safe to share)
const receiverTongoAddress = "Base58EncodedPublicKeyFromReceiver";

const transferOp = await tongo.transfer({
  amount: 50n,
  to: receiverTongoAddress, // Public Tongo address, never use receiver's private key
  sender: account.address,
  fee_to_sender: 0n,
});

const response = await account.execute(transferOp.toCalldata());
await provider.waitForTransaction(response.transaction_hash);
// Amount is encrypted on-chain; receiver sees it in pending balance
```

### Rollover (Activate Received Funds)

The receiver calls rollover on their own Tongo account to activate pending funds:

```typescript
const rolloverOp = await tongo.rollover({
  sender: account.address,
});

const response = await account.execute(rolloverOp.toCalldata());
await provider.waitForTransaction(response.transaction_hash);
// Pending balance moves to current balance
```

### Withdraw (Tongo -> ERC20)

```typescript
const withdrawOp = await tongo.withdraw({
  amount: 25n,
  to: "0x...", // Starknet address receiving ERC20
  sender: account.address,
  fee_to_sender: 0n,
});

const response = await account.execute(withdrawOp.toCalldata());
await provider.waitForTransaction(response.transaction_hash);
```

### Ragequit (Emergency Full Withdrawal)

```typescript
const ragequitOp = await tongo.ragequit({
  to: "0x...", // Starknet address receiving ERC20
  sender: account.address,
  fee_to_sender: 0n,
});

const response = await account.execute(ragequitOp.toCalldata());
await provider.waitForTransaction(response.transaction_hash);
// Entire balance withdrawn; more efficient than regular withdraw for full amount
```

### Outside Fund (Fund Any Account)

```typescript
const outsideFundOp = await tongo.outside_fund({
  amount: 100n,
  to: "Base58EncodedTongoAddressOfRecipient", // Tongo address of the receiver
});

const response = await account.execute([
  outsideFundOp.approve,
  outsideFundOp.toCalldata(),
]);
await provider.waitForTransaction(response.transaction_hash);
```

## Auditor Usage

An optional auditor can decrypt all transaction amounts for compliance:

```typescript
import { Auditor } from "@fatsolutions/tongo-sdk";

const auditor = new Auditor(
  process.env.TONGO_AUDITOR_PRIVATE_KEY,
  process.env.TONGO_CONTRACT_ADDRESS,
  provider,
);

// Tongo address of the user to audit (Base58, shared publicly by the user)
const userTongoAddress = "Base58EncodedTongoAddressOfUser";

// Get user balance
const balance = await auditor.getUserBalance(0, userTongoAddress);
console.log("Declared balance:", balance.amount);

// Get transfer history
const transfers = await auditor.getUserTransferOut(0, userTongoAddress);
transfers.forEach(t => console.log(`Transferred ${t.amount} to ${t.to}`));

// Get real balance including pending
const realBalance = await auditor.getRealuserBalance(0, userTongoAddress);
```

## Transaction History

```typescript
// All events for an account
// NOTE: Using 0 scans from genesis and will be slow on mainnet.
// In production, use the Tongo contract's deployment block instead.
const history = await tongo.getTxHistory(0, "latest", "all");

// Specific event types
const funds = await tongo.getEventsFund(0);
const transfersIn = await tongo.getEventsTransferIn(0);
const transfersOut = await tongo.getEventsTransferOut(0);
const withdrawals = await tongo.getEventsWithdraw(0);
const rollovers = await tongo.getEventsRollover(0);
const ragequits = await tongo.getEventsRagequit(0);
```

## Operation Parameters

| Operation | Required Fields | Optional Fields |
|-----------|----------------|-----------------|
| `fund` | `amount`, `sender` | `fee_to_sender` |
| `transfer` | `amount`, `to` (PubKey), `sender` | `fee_to_sender` |
| `withdraw` | `amount`, `to` (address), `sender` | `fee_to_sender` |
| `ragequit` | `to` (address), `sender` | `fee_to_sender` |
| `rollover` | `sender` | -- |
| `outside_fund` | `amount`, `to` (PubKey) | -- |

The `fee_to_sender` field enables relayer/paymaster patterns where a third party submits the transaction and receives a fee.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `You dont have enough balance` | Insufficient encrypted balance | Check `state().balance` before transfer/withdraw |
| `Your pending amount is 0` | Nothing to rollover | Wait for incoming transfer before rollover |
| `Decryption of Cipherbalance has failed` | Wrong private key or corrupted data | Verify Tongo private key matches account |
| `Malformed or tampered ciphertext` | Invalid encrypted data | Re-fetch state and retry |
| Transaction reverted on-chain | Invalid ZK proof | Ensure correct amounts and keys |

## Security Notes

- **Critical**: `TONGO_PRIVATE_KEY` is non-recoverable. There is no seed phrase or recovery mechanism. Loss of this key means permanent loss of all encrypted balances. Store it with the same care as an offline hardware wallet seed.
- Tongo private keys are separate from Starknet account keys
- Transfer amounts are encrypted on-chain; only sender, receiver, and optional auditor can see them
- Withdraw amounts are public (visible on-chain)
- No trusted setup: security based on discrete logarithm over the Stark curve
- Audited by ZKSECURITY
- ~120K Cairo steps per transfer verification

## References

- [Tongo GitHub](https://github.com/fatlabsxyz/tongo)
- [Tongo SDK npm](https://www.npmjs.com/package/@fatsolutions/tongo-sdk)
- [Academic paper (ePrint 2019/191)](https://eprint.iacr.org/2019/191)
- [SHE Library (Starknet Homomorphic Encryption)](https://github.com/keep-starknet-strange/she)
