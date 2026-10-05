---
name: starknet-js
description: "Reference for building Starknet applications using starknet.js v10 SDK, including contract interaction, account management, transaction handling, fee estimation, wallet integration, and paymaster flows."
license: Apache-2.0
metadata:
  author: 0xlny
  version: "1.0.0"
  org: keep-starknet-strange
compatibility: "Node.js 22+, TypeScript 5+, npm package: starknet@^10.8.0"
keywords:
  - starknet
  - starknet-js
  - sdk
  - typescript
  - smart-contracts
  - account-abstraction
  - paymaster
  - multicall
  - snip-9
  - snip-12
  - erc-20
  - erc-721
  - wallet
  - rpc
  - fee-estimation
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---

# starknet.js v10 SDK

Related modules: [skills catalog](../README.md).

## When to Use

- Building Starknet apps with provider, account, contract, wallet, or paymaster flows.

## When NOT to Use

- Cairo contract authoring, deployment-only runbooks, or security audits.

## Quick Start

```bash
npm install starknet@^10.8.0
```

Minimal setup to read from Starknet:

```typescript
import { RpcProvider, Contract } from 'starknet';

const provider = await RpcProvider.create({ nodeUrl: 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10' });
const contract = new Contract({ abi, address: contractAddress, providerOrAccount: provider });
const result = await contract.get_balance();
```

## Core Architecture

```
Provider -> Account -> Contract
   |          |          |
Network   Identity   Interaction
```

- **Provider**: Read-only network connection (RpcProvider)
- **Account**: Signs and sends transactions; in v10 it no longer extends Provider, so call provider methods through `account.provider`
- **Contract**: Type-safe interface to deployed contracts

Use Provider for read operations, Account for write operations.

## Provider Setup

```typescript
import { RpcProvider } from 'starknet';

// Recommended: Auto-detect RPC spec version
const provider = await RpcProvider.create({
  nodeUrl: 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10'
});
```

**Networks** (keyless public Cartridge endpoints on RPC spec 0.10, rate limited; use your own provider in production):
- Mainnet: `https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10`
- Sepolia: `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10`

**Key Methods:**
```typescript
const chainId = await provider.getChainId();
const block = await provider.getBlock('latest');
const nonce = await provider.getNonceForAddress(accountAddress);
await provider.waitForTransaction(txHash);

// Read storage directly (v10 returns { value, last_update_block }, not a bare felt)
const { value } = await provider.getStorageAt(contractAddress, storageKey);
```

## Account Management

### Account Creation (4 Steps)

**Step 1: Compute address**
```typescript
import { hash, ec, encode, CallData } from 'starknet';

// IMPORTANT: `stark.randomAddress()` returns an address-like random felt and is NOT a private key.
// Use a real stark curve private key generator.
const privateKey = '0x' + encode.buf2hex(ec.starkCurve.utils.randomPrivateKey());
const publicKey = ec.starkCurve.getStarkKey(privateKey);

// NOTE: account class hashes are network/account-type dependent.
// Treat this as an example only (verify the correct class hash for your setup).
const classHash = '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688'; // example

const constructorCalldata = CallData.compile({ publicKey });
const address = hash.calculateContractAddressFromHash(publicKey, classHash, constructorCalldata, 0);
```

**Step 2: Fund the address** with STRK before deployment.

**Step 3: Deploy**
```typescript
import { Account } from 'starknet';

// v10: the Account constructor takes a single options object
const account = new Account({ provider, address, signer: privateKey, cairoVersion: '1' });
const { transaction_hash } = await account.deployAccount({
  classHash,
  constructorCalldata,
  addressSalt: publicKey
});
await provider.waitForTransaction(transaction_hash);
```

**Step 4: Use the account** for transactions.

### Connect to Existing Account

```typescript
const account = new Account({
  provider,
  address: '0x123...',
  signer: privateKey,
  cairoVersion: '1'  // Optional, auto-detected if omitted
});
```

## Contract Interaction

### Connect to Contract

```typescript
import { Contract } from 'starknet';

const contract = new Contract({ abi, address: contractAddress, providerOrAccount: provider });  // Read-only
const writeContract = new Contract({ abi, address: contractAddress, providerOrAccount: account });   // Read-write
```

### Typed Contract (Type-Safe)

```typescript
// Get full TypeScript autocomplete and type checking from ABI
const typedContract = contract.typedv2(abi);
const balance = await typedContract.balanceOf(userAddress);
```

### Read State

```typescript
const balance = await contract.get_balance();
const userBalance = await contract.balanceOf(userAddress);
```

### Write (Execute)

```typescript
const tx = await contract.increase_balance(100);
await provider.waitForTransaction(tx.transaction_hash);
```

### Multicall (Batch Transactions)

```typescript
import { CallData, cairo } from 'starknet';

const calls = [
  {
    contractAddress: tokenAddress,
    entrypoint: 'approve',
    calldata: CallData.compile({ spender: bridgeAddress, amount: cairo.uint256(1000n) })
  },
  {
    contractAddress: bridgeAddress,
    entrypoint: 'deposit',
    calldata: CallData.compile({ amount: cairo.uint256(1000n) })
  }
];

const tx = await account.execute(calls);
```

Using `populate()` for type-safety:
```typescript
const approveCall = tokenContract.populate('approve', {
  spender: bridgeAddress,
  amount: cairo.uint256(1000n)
});
const depositCall = bridgeContract.populate('deposit', { amount: cairo.uint256(1000n) });
const tx = await account.execute([approveCall, depositCall]);
```

### Parse Events

```typescript
const receipt = await provider.getTransactionReceipt(txHash);
const events = contract.parseEvents(receipt);
// Events are keyed by full Cairo path, e.g. '...::ERC20Component::Transfer'
const transferEvents = events.filter((e) => Object.keys(e).some((name) => name.endsWith('::Transfer')));
```

## Transaction Simulation

Simulate before executing to catch reverts and inspect state changes:

```typescript
// v10 returns { simulated_transactions, initial_reads? } instead of an array
const { simulated_transactions: [sim] } = await account.simulateTransaction(
  [{ type: 'INVOKE', payload: calls }], { skipValidate: false }
);

console.log('Fee estimate:', sim.overall_fee, sim.resourceBounds);
console.log('Trace:', sim.transaction_trace);

// Check state changes before execution
const trace = sim.transaction_trace;
if ('state_diff' in trace && trace.state_diff) {
  console.log('Storage changes:', trace.state_diff.storage_diffs);
}
```

## Fee Estimation

```typescript
const fee = await account.estimateInvokeFee(calls);
console.log({
  overallFee: fee.overall_fee,
  resourceBounds: fee.resourceBounds  // V3: l1_gas, l2_gas, l1_data_gas
});
```

Execute with custom bounds (each resource is `{ max_amount, max_price_per_unit }` as bigint; by default v10 already adds a 50% margin to estimated bounds via `config.get('resourceBoundsOverhead')`):
```typescript
const { resourceBounds } = await account.estimateInvokeFee(calls);
const tx = await account.execute(calls, {
  resourceBounds: {
    ...resourceBounds,
    l2_gas: { ...resourceBounds.l2_gas, max_amount: resourceBounds.l2_gas.max_amount * 2n }
  }
});
```

With priority tip (v10 applies `recommendedTip` by default via `config` `defaultTipType`; pass `tip` to override). `getEstimateTip()` returns `{ minTip, maxTip, averageTip, medianTip, modeTip, recommendedTip, p90Tip, p95Tip }`:
```typescript
const tipStats = await provider.getEstimateTip();
const tx = await account.execute(calls, { tip: tipStats.p90Tip });
```

## Transaction Receipt Handling

```typescript
const receipt = await provider.waitForTransaction(txHash);

// Status check helpers
if (receipt.isSuccess()) {
  console.log('Transaction succeeded');
} else if (receipt.isReverted()) {
  console.log('Reverted:', receipt.revert_reason);
} else if (receipt.isError()) {
  console.log('Error');
}
```

## Wallet Integration

Connect to browser wallets (ArgentX, Braavos):

```typescript
import { connect } from '@starknet-io/get-starknet';
import { WalletAccount } from 'starknet';

const selectedWallet = await connect({ modalMode: 'alwaysAsk' });
if (!selectedWallet) throw new Error('No wallet selected');
// get-starknet 4.x bundles older wallet-API types than v10; strict TS may need a cast here
const walletAccount = await WalletAccount.connect(
  { nodeUrl: 'https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10' },
  selectedWallet
);

// Use like regular Account
const tx = await walletAccount.execute(calls);

// Event handlers
walletAccount.onAccountChange((accounts) => console.log('New account:', accounts?.[0]));
walletAccount.onNetworkChanged((chainId) => console.log('Network changed:', chainId));
```

## Paymaster (Gas Sponsorship)

Setup paymaster for sponsored or alternative gas token transactions:

```typescript
import { PaymasterRpc, Account } from 'starknet';

const paymaster = new PaymasterRpc({ nodeUrl: 'https://sepolia.paymaster.avnu.fi' });
const account = new Account({ provider, address, signer: privateKey, paymaster });
```

**Sponsored (dApp pays gas):**
```typescript
const tx = await account.executePaymasterTransaction(calls, { feeMode: { mode: 'sponsored' } });
```

**Alternative token (e.g., USDC):**
```typescript
import type { PaymasterDetails } from 'starknet';
const tokens = await account.paymaster.getSupportedTokens();
const feeDetails: PaymasterDetails = { feeMode: { mode: 'default', gasToken: USDC_ADDRESS } };
const estimate = await account.estimatePaymasterTransactionFee(calls, feeDetails);
const tx = await account.executePaymasterTransaction(calls, feeDetails, estimate.suggested_max_fee_in_gas_token);
```

## Message Signing (SNIP-12)

```typescript
const typedData = {
  types: {
    StarknetDomain: [
      { name: 'name', type: 'shortstring' },
      { name: 'version', type: 'shortstring' },
      { name: 'chainId', type: 'shortstring' },
      { name: 'revision', type: 'shortstring' }
    ],
    Message: [{ name: 'content', type: 'shortstring' }]
  },
  primaryType: 'Message',
  domain: { name: 'MyDapp', version: '1', chainId: 'SN_SEPOLIA', revision: '1' },
  message: { content: 'Hello Starknet' }
};

const signature = await account.signMessage(typedData);
const msgHash = await account.hashMessage(typedData);
// Verify via the account contract's is_valid_signature (works for any account type)
const isValid = await provider.verifyMessageInStarknet(typedData, signature, account.address);
```

## CallData & Cairo Types

```typescript
import { CallData, cairo, byteArray, CairoCustomEnum, CairoOption, CairoOptionVariant } from 'starknet';

// Compile with ABI
const calldata = new CallData(abi);
const compiled = calldata.compile('transfer', { recipient: '0x...', amount: cairo.uint256(1000n) });

// Cairo type helpers - always use BigInt (n suffix) for token amounts
cairo.uint256(1000n)          // { low, high } - ALWAYS use BigInt for precision
cairo.felt('0x123')           // felt252 as a decimal string ('291'); throws outside [0, P)
byteArray.byteArrayFromString('Hello')  // ByteArray for long strings
// Cairo bool: pass true / false directly

// Short strings (<= 31 chars)
import { shortString } from 'starknet';
shortString.encodeShortString('hello')  // felt252
shortString.decodeShortString('0x...')  // 'hello'

// Enums and Options
const myEnum = new CairoCustomEnum({ Variant1: { value: 123 } });
const some = new CairoOption(CairoOptionVariant.Some, value);
```

**Important:** Always use `BigInt` (e.g., `1000n`) for token amounts and balances. Never use `Number()` or `parseFloat()` on wei values -- JavaScript numbers lose precision above 2^53.

## ERC-20 Token Operations

```typescript
const erc20 = new Contract({ abi: erc20Abi, address: tokenAddress, providerOrAccount: account });

// Read balance (returns BigInt - do NOT convert with Number())
const balance = await erc20.balanceOf(account.address);
console.log('Balance (wei):', balance.toString());

// Transfer (use BigInt for amount)
const amount = 10n ** 18n; // 1 token (18 decimals)
const tx = await erc20.transfer(recipientAddress, cairo.uint256(amount));
await provider.waitForTransaction(tx.transaction_hash);

// Approve + transferFrom pattern
await erc20.approve(spenderAddress, cairo.uint256(amount));
```

## Utility Functions

```typescript
import { stark, ec, encode, num, hash } from 'starknet';

// Key generation
const privateKey = '0x' + encode.buf2hex(ec.starkCurve.utils.randomPrivateKey());
const publicKey = ec.starkCurve.getStarkKey(privateKey);

// Number conversions
num.toHex(123);           // '0x7b'
num.toBigInt('0x7b');     // 123n

// Hashing
hash.getSelectorFromName('transfer');
hash.calculateContractAddressFromHash(salt, classHash, calldata, deployer);
```

## Contract Deployment

```typescript
// Deploy via UDC
const { transaction_hash, contract_address } = await account.deploy({
  classHash: '0x...',
  constructorCalldata: CallData.compile({ owner: account.address }),
  salt: stark.randomAddress(), // random felt252 salt (not a private key)
  unique: true
});

// Declare first, then deploy
const declareResponse = await account.declare({
  contract: compiledSierra,
  casm: compiledCasm
});
await provider.waitForTransaction(declareResponse.transaction_hash);

const deployResponse = await account.deploy({
  classHash: declareResponse.class_hash,
  constructorCalldata: CallData.compile({ owner: account.address })
});

// Or combined
const result = await account.declareAndDeploy({
  contract: compiledContract,
  casm: compiledCasm,
  constructorCalldata: CallData.compile({ owner: account.address })
});
```

## Outside Execution (SNIP-9)

Execute transactions on behalf of another account (gasless/delegated):

```typescript
import { OutsideExecutionVersion } from 'starknet';
const version = await account.getSnip9Version();  // OutsideExecutionVersion: '0' | '1' | '2'

const outsideTransaction = await account.getOutsideTransaction(
  { caller: executorAddress, execute_after: now, execute_before: now + 3600 },
  calls,
  OutsideExecutionVersion.V2
);

// Executor submits the pre-signed transaction
const result = await executorAccount.executeFromOutside(outsideTransaction);
```

## Error Handling

```typescript
import { LibraryError, RpcError } from 'starknet';

try {
  const tx = await account.execute(calls);
} catch (error) {
  if (error instanceof RpcError) {
    console.error('RPC error:', error.code, error.message);
  } else if (error instanceof LibraryError) {
    console.error('Library error:', error.message);
  }
}
```

## Logging & Configuration

```typescript
import { config, logger } from 'starknet';

// Global config (v10 only sends V3 transactions)
config.set('defaultTipType', 'p90Tip');   // tip applied when execute() gets no `tip`
config.get('resourceBoundsOverhead');     // margin added to estimated resource bounds
logger.setLogLevel('DEBUG');  // DEBUG | INFO | WARN | ERROR | FATAL | OFF
```
