# Advanced Patterns Reference

## Event Handling

### Parse Events from Receipt

```typescript
const receipt = await provider.getTransactionReceipt(txHash);
const events = contract.parseEvents(receipt);

// Filter by event name
const transferEvents = contract.parseEvents(receipt, 'Transfer');

// Access event data
transferEvents.forEach(event => {
  console.log('From:', event.from);
  console.log('To:', event.to);
  console.log('Amount:', event.amount);
});
```

### Event Structure

```typescript
interface ParsedEvent {
  [eventName: string]: {
    [fieldName: string]: bigint | string | object;
  };
}
```

### Subscribe to Events (via RPC)

```typescript
// Poll for new events
async function watchEvents(contract, fromBlock) {
  const currentBlock = await provider.getBlockNumber();

  for (let block = fromBlock; block <= currentBlock; block++) {
    const events = await provider.getEvents({
      from_block: { block_number: block },
      to_block: { block_number: block },
      address: contract.address,
      keys: [[hash.getSelectorFromName('Transfer')]]
    });

    for (const event of events.events) {
      const parsed = contract.parseEvents({ events: [event] });
      console.log('Event:', parsed);
    }
  }
}
```

## SNIP-9 Outside Execution

Execute transactions on behalf of another account (gasless transactions, session keys).

### Check Support

```typescript
const version = await account.getSnip9Version();
// Returns: 'V1' | 'V2' | 'UNSUPPORTED'
```

### Create Outside Transaction

```typescript
// Define who can execute and time bounds
const outsideOptions = {
  caller: executorAddress,                           // Who can execute (or 'ANY_CALLER')
  execute_after: Math.floor(Date.now() / 1000),     // Unix timestamp
  execute_before: Math.floor(Date.now() / 1000) + 3600  // Valid for 1 hour
};

// Get unique nonce
const nonce = await account.getSnip9Nonce();

// Create signed outside transaction
const outsideTransaction = await account.getOutsideTransaction(
  outsideOptions,
  calls,
  'V2',  // SNIP-9 version
  nonce
);
```

### Execute from Another Account

```typescript
// Executor (e.g., relayer) executes the pre-signed transaction
const result = await executorAccount.executeFromOutside(
  outsideTransaction,
  { maxFee: estimatedFee }
);

await provider.waitForTransaction(result.transaction_hash);
```

### SNIP-9 for Gasless Transactions

```typescript
// User signs transaction
const userOutsideTx = await userAccount.getOutsideTransaction(
  { caller: relayerAddress, execute_before: Date.now() / 1000 + 300 },
  userCalls,
  'V2'
);

// Send to relayer (off-chain)
const response = await fetch('https://relayer.example.com/execute', {
  method: 'POST',
  body: JSON.stringify(userOutsideTx)
});

// Relayer executes and pays gas
// const result = await relayerAccount.executeFromOutside(userOutsideTx);
```

## Ledger Hardware Wallet

### Setup Ledger Signer

```typescript
import TransportWebUSB from '@ledgerhq/hw-transport-webusb';
import { LedgerSigner } from 'starknet';

// Connect to Ledger
const transport = await TransportWebUSB.create();

// Create signer (account index 0)
const ledgerSigner = new LedgerSigner(transport, 0);

// Get public key
const publicKey = await ledgerSigner.getPubKey();
console.log('Ledger public key:', publicKey);

// Create account with Ledger signer
const account = new Account({
  provider,
  address: accountAddress,
  signer: ledgerSigner
});
```

### Ledger Transaction Flow

```typescript
// User must confirm on Ledger device
try {
  const tx = await account.execute(calls);
  console.log('Transaction submitted:', tx.transaction_hash);
} catch (error) {
  if (error.message.includes('rejected')) {
    console.log('User rejected on Ledger');
  }
}
```

## Transaction Simulation

### Simulate Before Execute

```typescript
const simResult = await account.simulateTransaction(
  [{ type: 'INVOKE', payload: calls }],
  { skipValidate: false }
);

console.log('Simulation result:', {
  feeEstimate: simResult[0].fee_estimation,
  trace: simResult[0].transaction_trace
});

// Only execute if simulation succeeds
if (simResult[0].transaction_trace) {
  const tx = await account.execute(calls);
}
```

### Simulate with State Diff

```typescript
const simResult = await account.simulateTransaction(
  [{ type: 'INVOKE', payload: calls }],
  { skipValidate: false }
);

// Check state changes before execution
const trace = simResult[0].transaction_trace;
if (trace?.state_diff) {
  console.log('Storage changes:', trace.state_diff.storage_diffs);
}
```

## Fast Execute (Gaming)

For latency-sensitive applications, execute without waiting for full confirmation:

```typescript
const result = await account.fastExecute(
  calls,
  { /* details */ },
  { retryInterval: 1000, maxRetries: 5 }
);

// Transaction submitted immediately, result includes preliminary status
console.log('TX Hash:', result.transaction_hash);
console.log('Status:', result.status);  // 'RECEIVED' or 'PENDING'
```

## Contract Factory Pattern

### Deploy Multiple Contracts

```typescript
const deployments = await Promise.all([
  account.deploy({
    classHash: tokenClassHash,
    constructorCalldata: CallData.compile({ name: 'Token1', symbol: 'TK1' })
  }),
  account.deploy({
    classHash: tokenClassHash,
    constructorCalldata: CallData.compile({ name: 'Token2', symbol: 'TK2' })
  })
]);

const addresses = deployments.map(d => d.contract_address[0]);
```

### Declare + Deploy

```typescript
// Declare contract class first
const declareResponse = await account.declare({
  contract: compiledSierra,
  casm: compiledCasm
});

await provider.waitForTransaction(declareResponse.transaction_hash);

// Deploy using declared class hash
const deployResponse = await account.deploy({
  classHash: declareResponse.class_hash,
  constructorCalldata
});
```

## Multicall Advanced Patterns

### Conditional Execution

```typescript
// Check balance, then transfer if sufficient
const balanceCall = tokenContract.populate('balanceOf', { account: myAddress });

// Execute check first
const [balance] = await provider.callContract(balanceCall);

if (BigInt(balance) >= requiredAmount) {
  const transferCall = tokenContract.populate('transfer', {
    recipient,
    amount: cairo.uint256(requiredAmount)
  });
  await account.execute([transferCall]);
}
```

### Atomic Swap Pattern

```typescript
// Atomic: approve + swap in single transaction
const approveCall = tokenAContract.populate('approve', {
  spender: dexAddress,
  amount: cairo.uint256(inputAmount)
});

const swapCall = dexContract.populate('swap', {
  token_in: tokenAAddress,
  token_out: tokenBAddress,
  amount_in: cairo.uint256(inputAmount),
  min_amount_out: cairo.uint256(minOutput)
});

// Both succeed or both fail
const tx = await account.execute([approveCall, swapCall]);
```

## Custom Signer Implementation

### Multi-Signature Signer

```typescript
import { SignerInterface, Signature } from 'starknet';

class MultiSigSigner implements SignerInterface {
  private signers: SignerInterface[];
  private threshold: number;

  constructor(signers: SignerInterface[], threshold: number) {
    this.signers = signers;
    this.threshold = threshold;
  }

  async getPubKey(): Promise<string> {
    return this.signers[0].getPubKey();
  }

  async signTransaction(calls, details): Promise<Signature> {
    const signatures: Signature[] = [];

    for (let i = 0; i < this.threshold; i++) {
      const sig = await this.signers[i].signTransaction(calls, details);
      signatures.push(sig);
    }

    return this.combineSignatures(signatures);
  }

  private combineSignatures(sigs: Signature[]): Signature {
    // Implementation depends on multi-sig account contract
    return sigs.flat();
  }

  // Implement other SignerInterface methods...
}
```

## Error Handling Patterns

### Retry with Backoff

```typescript
async function executeWithRetry(
  account: Account,
  calls: Call[],
  maxRetries = 3
): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { transaction_hash } = await account.execute(calls);
      return transaction_hash;
    } catch (error) {
      if (error.message.includes('nonce') && attempt < maxRetries - 1) {
        // Nonce mismatch - wait and retry
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

### Transaction Status Polling

```typescript
async function waitWithTimeout(
  provider: RpcProvider,
  txHash: string,
  timeoutMs: number
): Promise<TransactionReceipt> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);

      if (receipt.isSuccess()) {
        return receipt;
      }

      if (receipt.isReverted()) {
        throw new Error(`Transaction reverted: ${receipt.revert_reason}`);
      }
    } catch (error) {
      if (!error.message.includes('not found')) {
        throw error;
      }
    }

    await new Promise(r => setTimeout(r, 3000));
  }

  throw new Error('Transaction timeout');
}
```

## Interface Detection (SRC-5)

### Check Contract Interfaces

```typescript
import { src5 } from 'starknet';

// Check if contract supports a specific interface
const supportsInterface = await src5.supportsInterface(
  provider,
  contractAddress,
  interfaceId  // BigNumberish
);
```

## Merkle Tree Utilities

### Create Merkle Tree

```typescript
import { merkle } from 'starknet';

const leaves = [
  '0x111...',
  '0x222...',
  '0x333...',
  '0x444...'
];

const tree = new merkle.MerkleTree(leaves);
const root = tree.root;

// Generate proof for a leaf
const proof = tree.getProof('0x222...');
```

### Verify Merkle Proof

```typescript
const isValid = merkle.proofMerklePath(
  root,        // merkle root
  '0x222...',  // leaf
  proof        // proof array
);
```

## Type-Safe Event Parsing

### Define Event Types

```typescript
interface TransferEvent {
  from: bigint;
  to: bigint;
  amount: { low: bigint; high: bigint };
}

function parseTransferEvent(raw: any): TransferEvent {
  return {
    from: BigInt(raw.from),
    to: BigInt(raw.to),
    amount: {
      low: BigInt(raw.amount.low),
      high: BigInt(raw.amount.high)
    }
  };
}

// Usage
const events = contract.parseEvents(receipt, 'Transfer');
const typedEvents = events.map(parseTransferEvent);
```

## Nonce Management

### Manual Nonce Control

```typescript
// Get current nonce
const nonce = await account.getNonce();

// Execute with explicit nonce (for parallel transactions)
const tx1 = await account.execute(calls1, { nonce });
const tx2 = await account.execute(calls2, { nonce: nonce + 1n });

// Wait for both
await Promise.all([
  provider.waitForTransaction(tx1.transaction_hash),
  provider.waitForTransaction(tx2.transaction_hash)
]);
```
