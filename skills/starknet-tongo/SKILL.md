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
npm install @fatsolutions/tongo-sdk@^2.0.0 starknet@^10.8.0
```

`@fatsolutions/tongo-sdk` 2.0.0 pins and bundles its own starknet.js 9.4.2. Its `Account` class checks `provider instanceof RpcProvider` against that bundled copy, so pass Tongo classes the RPC URL string, not a starknet.js 10 `RpcProvider`. A v10 provider instance fails the check, and the SDK then throws `Failed to parse URL from [object Object]`. Sign and submit with your own starknet.js 10 `Account`: the `Call` objects the SDK builds work with it unchanged.

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

For testing, Tongo's Sepolia USDC instance is `0x2640a5752136d6201a33fc5b5c4d58b6bcefdbe6a902892ca20eced975c6ae3` (listed in the [Tongo relayer README](https://github.com/fatlabsxyz/tongo/blob/master/packages/contracts/src/relayer/README.md)). It was deployed at block `10394006`, so use that as `fromBlock` for event scans. The keyless `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10` endpoint is enough to read state and build operations; use a keyed RPC for anything beyond light testing.

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
| **Rate** | Conversion factor: 1 Tongo unit = `rate()` ERC20 base units |

Transfers land in the receiver's **pending balance** and must be rolled over before they can be spent.

Every `amount` and `feeToSender` in the SDK is in **Tongo units**, not ERC20 base units. Convert with `tongo.erc20ToTongo(x)` (rounds up) and `tongo.tongoToErc20(x)`. The Sepolia USDC instance uses `rate() = 10000n`, so 1 Tongo unit is 0.01 USDC. Balances are 32-bit (`tongo.bitSize()`), so no balance or amount can exceed 2^32 − 1 Tongo units.

## Setup

```typescript
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import { Account, RpcProvider } from "starknet";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const rpcUrl = env("STARKNET_RPC_URL");
const provider = new RpcProvider({ nodeUrl: rpcUrl });

// Starknet account for paying gas
const account = new Account({
  provider,
  address: env("STARKNET_ACCOUNT_ADDRESS"),
  signer: env("STARKNET_PRIVATE_KEY"),
});

// Tongo account for confidential operations. Pass the RPC URL string, not
// `provider`: the SDK builds its own starknet.js 9 provider from it.
const tongo = new TongoAccount(
  env("TONGO_PRIVATE_KEY"),
  env("TONGO_CONTRACT_ADDRESS"),
  rpcUrl,
);

console.log("Tongo address:", tongo.tongoAddress()); // Base58-encoded public key
console.log("Public key:", tongo.publicKey); // { x, y } point used as `to` in transfers
```

## Operations

Each operation's `toCalldata()` returns a `Call[]`, so you can pass it straight to `account.execute`. The `sender` you give an operation is bound into its proof (the contract checks it against `get_caller_address()`), so submit the transaction from that same account.

### Check Encrypted Balance

```typescript
const state = await tongo.state();
console.log("Balance:", state.balance);   // Decrypted current balance (Tongo units)
console.log("Pending:", state.pending);   // Funds received but not yet rolled over
console.log("Nonce:", state.nonce);
console.log("Balance in ERC20 units:", await tongo.tongoToErc20(state.balance));
```

### Fund (ERC20 -> Tongo)

```typescript
const fundOp = await tongo.fund({
  amount: 100n, // Tongo units; the ERC20 approval is amount * rate
  sender: account.address,
});

// `approve` is typed optional (`Call | undefined`); fund() always populates it
const response = await account.execute([
  ...(fundOp.approve ? [fundOp.approve] : []),
  ...fundOp.toCalldata(),
]);
await provider.waitForTransaction(response.transaction_hash);
```

### Transfer (Confidential)

`to` takes the receiver's public key as a `PubKey` point (`{ x, y }`), not the base58 Tongo address string. Convert a shared address with `pubKeyBase58ToAffine`:

```typescript
import { pubKeyBase58ToAffine } from "@fatsolutions/tongo-sdk";

// Receiver shares their Tongo address (public -- safe to share)
const receiverTongoAddress = "Base58EncodedPublicKeyFromReceiver";

const transferOp = await tongo.transfer({
  amount: 50n,
  to: pubKeyBase58ToAffine(receiverTongoAddress), // Never use the receiver's private key
  sender: account.address,
  feeToSender: 0n, // Optional relayer fee
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
  amount: 25n, // Tongo units; the recipient receives amount * rate ERC20 base units
  to: "0x...", // Starknet address receiving ERC20
  sender: account.address,
  feeToSender: 0n,
});

const response = await account.execute(withdrawOp.toCalldata());
await provider.waitForTransaction(response.transaction_hash);
```

### Ragequit (Emergency Full Withdrawal)

```typescript
const ragequitOp = await tongo.ragequit({
  to: "0x...", // Starknet address receiving ERC20
  sender: account.address,
  feeToSender: 0n,
});

const response = await account.execute(ragequitOp.toCalldata());
await provider.waitForTransaction(response.transaction_hash);
// Entire balance withdrawn; more efficient than regular withdraw for full amount
```

### Outside Fund (Fund Any Account)

```typescript
import { pubKeyBase58ToAffine } from "@fatsolutions/tongo-sdk";

const outsideFundOp = await tongo.outsideFund({
  amount: 100n,
  to: pubKeyBase58ToAffine("Base58EncodedTongoAddressOfRecipient"),
});

const response = await account.execute([
  ...(outsideFundOp.approve ? [outsideFundOp.approve] : []),
  ...outsideFundOp.toCalldata(),
]);
await provider.waitForTransaction(response.transaction_hash);
```

## Auditor Usage

An optional auditor can decrypt all transaction amounts for compliance. `tongo.Tongo.auditor_key()` returns the instance's current auditor key, or `None` when the instance has no auditor.

The SDK ships an `Auditor` class, but `@fatsolutions/tongo-sdk` 2.0.0 does not export it from the package entry point (1.3.x did not either). The package `exports` map also blocks deep imports such as `@fatsolutions/tongo-sdk/dist/auditor.js`, which fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Until upstream exports it, read the auditor events with the exported `AccountEventReader` and decrypt them with the auditor key. This is the same logic `Auditor` uses internally:

```typescript
import {
  AccountEventReader,
  assertBalance,
  decipherBalance,
  decryptAEHint,
  derivePublicKey,
  parseCipherBalance,
  pubKeyBase58ToAffine,
  type AEBalance,
  type PubKey,
  type StarkCipherBalance,
} from "@fatsolutions/tongo-sdk";

const auditorKey = BigInt(env("TONGO_AUDITOR_PRIVATE_KEY"));
const auditorPubKey = derivePublicKey(auditorKey);
const tongoContract = env("TONGO_CONTRACT_ADDRESS");

// AccountEventReader needs the SDK's own starknet.js 9 provider: reuse tongo.provider
const reader = new AccountEventReader(tongo.provider, tongoContract);

// Tongo address of the user to audit (Base58, shared publicly by the user)
const user = pubKeyBase58ToAffine("Base58EncodedTongoAddressOfUser");
const fromBlock = 0; // Use the Tongo contract's deployment block (see Transaction History)

// Decrypt an amount declared for the auditor. `counterparty` is the account that
// encrypted it: the user for balances and outgoing transfers, `event.from` for incoming.
async function decryptDeclared(
  event: { declaredCipherBalance: StarkCipherBalance; hint: AEBalance; nonce: bigint },
  counterparty: PubKey,
): Promise<bigint> {
  const { L, R } = parseCipherBalance(event.declaredCipherBalance);
  // Fast path: decrypt and check the AE hint; otherwise brute-force the ElGamal ciphertext (slow)
  const hint = await decryptAEHint(auditorKey, event.hint, event.nonce, counterparty, tongoContract)
    .catch(() => undefined);
  return hint !== undefined && assertBalance(auditorKey, hint, L, R)
    ? hint
    : decipherBalance(auditorKey, L, R);
}

// Events encrypted for a rotated-out auditor key can't be read with this one
const forThisKey = (e: { auditorPubKey: PubKey }) =>
  BigInt(e.auditorPubKey.x) === BigInt(auditorPubKey.x) &&
  BigInt(e.auditorPubKey.y) === BigInt(auditorPubKey.y);

// Latest declared balance: every balance change emits a BalanceDeclared event
const declared = (await reader.getEventsBalanceDeclared(fromBlock, user))
  .filter(forThisKey)
  .sort(
    (a, b) =>
      b.block_number - a.block_number ||
      b.transaction_index - a.transaction_index ||
      b.event_index - a.event_index,
  );
if (declared[0]) {
  console.log("Declared balance:", await decryptDeclared(declared[0], user));
}

// Transfer history (counterparties are PubKeys; pubKeyAffineToBase58 turns them into addresses)
for (const t of (await reader.getEventsTransferFrom(fromBlock, user)).filter(forThisKey)) {
  console.log("Transferred", await decryptDeclared(t, user), "in", t.tx_hash);
}
for (const t of (await reader.getEventsTransferTo(fromBlock, user)).filter(forThisKey)) {
  console.log("Received", await decryptDeclared(t, t.from), "in", t.tx_hash);
}
```

The user's real balance is the latest declared balance plus the incoming transfers declared after it, since those are still pending until the user rolls over.

## Transaction History

```typescript
// NOTE: 0 scans from genesis. That is slow on every network, and keyless
// public RPCs can drop the request. Use the Tongo contract's deployment block.
const fromBlock = 0;

// All events for an account
const history = await tongo.getTxHistory(fromBlock, "latest", "all");

// Specific event types
const funds = await tongo.getEventsFund(fromBlock);
const outsideFunds = await tongo.getEventsOutsideFund(fromBlock);
const transfersIn = await tongo.getEventsTransferIn(fromBlock);
const transfersOut = await tongo.getEventsTransferOut(fromBlock);
const withdrawals = await tongo.getEventsWithdraw(fromBlock);
const rollovers = await tongo.getEventsRollover(fromBlock);
const ragequits = await tongo.getEventsRagequit(fromBlock);
```

Transfer events report the counterparty (`to`/`from`) as a base58 Tongo address.

## Operation Parameters

| Operation | Required Fields | Optional Fields |
|-----------|----------------|-----------------|
| `fund` | `amount`, `sender` | -- |
| `transfer` | `amount`, `to` (PubKey), `sender` | `feeToSender`, `toTongo` |
| `withdraw` | `amount`, `to` (address), `sender` | `feeToSender` |
| `ragequit` | `to` (address), `sender` | `feeToSender` |
| `rollover` | `sender` | -- |
| `outsideFund` | `amount`, `to` (PubKey) | -- |

The `feeToSender` field (Tongo units, default `0n`) enables relayer/paymaster patterns: a third party submits the transaction as `sender` and receives the fee from the user's encrypted balance. `toTongo` sends a transfer to an account on a different Tongo contract.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `Insufficient balance for transfer: have X, need Y` (also `withdrawal`) | Encrypted balance below `amount + feeToSender` | Check `state().balance`; roll over pending funds first |
| `Cannot ragequit: balance is 0` | Nothing to withdraw | Check `state().balance`; roll over pending funds first |
| `Nothing to roll over: pending balance is 0` | Nothing to rollover | Wait for incoming transfer before rollover |
| `Failed to parse URL from [object Object]` | A starknet.js 10 `RpcProvider` was passed to a Tongo class | Pass the RPC URL string instead |
| `Decryption of Cipherbalance has failed` | Wrong private key or corrupted data | Verify Tongo private key matches account |
| `Malformed or tampered ciphertext` | Invalid encrypted data | Re-fetch state and retry |
| Transaction reverted on-chain | Invalid ZK proof, or submitted by an account other than `sender` | Rebuild the operation from fresh state and submit it from `sender` |

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
