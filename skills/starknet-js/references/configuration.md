# Configuration Reference

## Global Configuration

### Import

```typescript
import { config } from 'starknet';
```

### Available Settings

```typescript
// Transaction version (V3 only for STRK fees)
config.set('transactionVersion', '0x3');
config.get('transactionVersion');

// RPC spec version
config.set('rpcVersion', '0.10.0');
config.get('rpcVersion');

// Legacy mode for V1 transactions
config.set('legacyMode', true);
config.get('legacyMode');
```

## Logging

```typescript
import { setLogLevel, getLogLevel } from 'starknet';

// Set log level
setLogLevel('DEBUG');   // Most verbose
setLogLevel('INFO');
setLogLevel('WARN');
setLogLevel('ERROR');   // Least verbose

// Check current level
const level = getLogLevel();
```

## RpcProvider Options

### Full Options Interface

```typescript
interface RpcProviderOptions {
  // Required
  nodeUrl?: string;               // RPC endpoint URL

  // Version control
  specVersion?: '0.9.0' | '0.10.0';  // Explicit spec version

  // Request customization
  headers?: Record<string, string>;  // Custom HTTP headers
  baseFetch?: typeof fetch;          // Custom fetch implementation

  // Block handling
  blockIdentifier?: BlockTag | number;  // Default: 'latest'
  // Options: 'latest', 'pending', 'pre_confirmed', block_number

  // Fee overhead (safety margin)
  resourceBoundsOverhead?: {
    l1_gas?: { amount?: string; price?: string };
    l2_gas?: { amount?: string; price?: string };
    l1_data_gas?: { amount?: string; price?: string };
  };
}
```

### Usage Examples

```typescript
// Basic setup
const provider = await RpcProvider.create({
  nodeUrl: 'https://rpc.starknet.lava.build'
});

// With custom headers (API key)
const provider = await RpcProvider.create({
  nodeUrl: 'https://rpc.example.com',
  headers: {
    'x-api-key': 'your-api-key'
  }
});

// With fee overhead (10% safety margin)
const provider = await RpcProvider.create({
  nodeUrl: 'https://...',
  resourceBoundsOverhead: {
    l1_gas: { amount: '0.1', price: '0.1' },
    l2_gas: { amount: '0.1', price: '0.1' }
  }
});
```

## Account Options

### Full Options Interface

```typescript
interface AccountOptions {
  // Required
  provider: ProviderInterface;
  address: string;
  signer: SignerInterface | string | Uint8Array;

  // Optional
  cairoVersion?: '0' | '1';           // Auto-detected if not provided
  transactionVersion?: '0x3';         // V3 only (STRK fees)
  paymaster?: PaymasterInterface;     // Paymaster for gas sponsorship
  defaultTipType?: 'strk' | 'fri';    // Default tip type
  deployer?: Deployer;                // Custom deployer
}
```

### Usage Examples

```typescript
// Minimal setup
const account = new Account({
  provider,
  address: '0x123...',
  signer: privateKey
});

// With explicit Cairo version (faster, no RPC call)
const account = new Account({
  provider,
  address: '0x123...',
  signer: privateKey,
  cairoVersion: '1'
});

// With paymaster
const account = new Account({
  provider,
  address: '0x123...',
  signer: privateKey,
  paymaster: new PaymasterRpc({ default: true })
});
```

## Contract Options

### Parser Options

```typescript
interface ContractOptions {
  parseRequest?: boolean;   // Parse & validate input args (default: true)
  parseResponse?: boolean;  // Parse response into objects (default: true)
  parser?: AbiParser;       // Custom ABI parser
}
```

### Usage

```typescript
// Default (recommended)
const contract = new Contract(abi, address, provider);

// With raw responses (for debugging)
const contract = new Contract(abi, address, provider, {
  parseResponse: false
});
```

## Transaction Details

### UniversalDetails Interface

```typescript
interface UniversalDetails {
  nonce?: BigNumberish;              // Manual nonce (auto-managed by default)
  blockIdentifier?: BlockIdentifier; // Block for state read
  skipValidate?: boolean;            // Skip validation in estimate
  tip?: bigint;                      // Priority fee

  // V3 resource bounds
  resourceBounds?: {
    l1_gas: { amount: BigNumberish; price: BigNumberish };
    l2_gas: { amount: BigNumberish; price: BigNumberish };
    l1_data_gas: { amount: BigNumberish; price: BigNumberish };
  };

  // Paymaster
  paymasterData?: RawArgs;
  accountDeploymentData?: RawArgs;

  // Data availability
  nonceDataAvailabilityMode?: 'L1' | 'L2';
  feeDataAvailabilityMode?: 'L1' | 'L2';

  version?: '0x3';
}
```

### Usage Examples

```typescript
// With tip (priority)
const tx = await account.execute(calls, { tip: 1000000n });

// With custom resource bounds
const tx = await account.execute(calls, {
  resourceBounds: {
    l1_gas: { amount: '0x5000', price: '0x1000000000' },
    l2_gas: { amount: '0x0', price: '0x0' },
    l1_data_gas: { amount: '0x2000', price: '0x1000000000' }
  }
});

// Skip validation (faster estimate)
const fee = await account.estimateInvokeFee(calls, { skipValidate: true });
```

## WaitForTransaction Options

```typescript
interface WaitForTransactionOptions {
  retryInterval?: number;   // Polling interval in ms (default: 5000)
  successStates?: TransactionFinalityStatus[];  // Success states to wait for
  errorStates?: TransactionExecutionStatus[];   // Error states to throw on
}
```

### Usage

```typescript
// Default (wait for L2 acceptance)
await provider.waitForTransaction(txHash);

// Custom retry interval
await provider.waitForTransaction(txHash, { retryInterval: 2000 });

// Wait for L1 finality
await provider.waitForTransaction(txHash, {
  successStates: ['ACCEPTED_ON_L1']
});
```

## Paymaster Options

```typescript
interface PaymasterOptions {
  default?: boolean;        // Use default paymaster service
  nodeUrl?: string;         // Specific paymaster endpoint
  headers?: object;         // Custom headers
}
```

### Usage

```typescript
// Default service
const paymaster = new PaymasterRpc({ default: true });

// Specific endpoint
const paymaster = new PaymasterRpc({
  nodeUrl: 'https://sepolia.paymaster.avnu.fi'
});
```

## Environment Variables

Common patterns for configuration:

```typescript
const provider = await RpcProvider.create({
  nodeUrl: process.env.STARKNET_RPC_URL,
  headers: process.env.API_KEY ? { 'x-api-key': process.env.API_KEY } : undefined
});

const account = new Account({
  provider,
  address: process.env.ACCOUNT_ADDRESS!,
  signer: process.env.PRIVATE_KEY!
});
```

## Network Endpoints

### Public RPC Endpoints

| Network | Provider | URL |
|---------|----------|-----|
| Mainnet | Lava | `https://rpc.starknet.lava.build` |
| Mainnet | Alchemy | `https://starknet-mainnet.g.alchemy.com/v2/{API_KEY}` |
| Mainnet | Infura | `https://starknet-mainnet.infura.io/v3/{API_KEY}` |
| Sepolia | Lava | `https://rpc.starknet-testnet.lava.build` |
| Sepolia | Alchemy | `https://starknet-sepolia.g.alchemy.com/v2/{API_KEY}` |

### Paymaster Endpoints

| Provider | Network | URL |
|----------|---------|-----|
| AVNU | Mainnet | `https://mainnet.paymaster.avnu.fi` |
| AVNU | Sepolia | `https://sepolia.paymaster.avnu.fi` |

## Timeouts and Retries

### Default Values

```typescript
// waitForTransaction defaults
const RETRY_INTERVAL = 5000;  // 5 seconds

// Custom implementation
async function waitWithCustomTimeout(provider, txHash, timeout = 60000) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt.isSuccess()) {
        return receipt;
      }
    } catch {
      // Transaction not found yet
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  throw new Error('Transaction timeout');
}
```
