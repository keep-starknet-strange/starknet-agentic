# Account Types Reference

## Overview

Starknet accounts are smart contracts. Each account type has different features, class hashes, and constructor requirements.

## Class Hashes by Account Type

### OpenZeppelin Account

Standard account implementation. Simple, audited, widely supported.

| Network | Version | Class Hash |
|---------|---------|------------|
| Mainnet | v0.17.0 | `0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688` |
| Sepolia | v0.17.0 | `0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688` |

**Constructor Calldata:**
```typescript
CallData.compile({ publicKey: starkPublicKey })
// Results in: [publicKey]
```

**Features:**
- Single signer
- Standard SNIP-6 interface
- SNIP-9 outside execution support

### ArgentX Account

Feature-rich account with guardian support and social recovery.

| Network | Version | Class Hash |
|---------|---------|------------|
| Mainnet | v0.4.0 | `0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f` |
| Sepolia | v0.4.0 | `0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f` |

**Constructor Calldata:**
```typescript
// Without guardian
CallData.compile({
  owner: starkPublicKey,
  guardian: 0
})
// Results in: [publicKey, 0]

// With guardian
CallData.compile({
  owner: starkPublicKey,
  guardian: guardianPublicKey
})
```

**Features:**
- Single owner + optional guardian
- Social recovery via guardian
- Session keys support
- Multicall native support
- SNIP-9 V2 support

### Braavos Account

Account with hardware wallet support and unique security features.

| Network | Version | Class Hash |
|---------|---------|------------|
| Mainnet | v1.0.0 | `0x00816dd0297efc55dc1e7559020a3a825e81ef734b558f03c83325d4da7e6253` |
| Sepolia | v1.0.0 | `0x00816dd0297efc55dc1e7559020a3a825e81ef734b558f03c83325d4da7e6253` |

**Important:** Braavos uses a proxy pattern. The class hash above is the implementation, but deployment requires their specific proxy setup.

**Constructor Calldata:**
```typescript
// Braavos has complex deployment - use their SDK or follow official docs
CallData.compile({ publicKey: starkPublicKey })
```

**Features:**
- Hardware wallet (Ledger) support
- Multi-signer support
- Daily spending limits
- Session keys
- SNIP-9 support

## Account Creation Examples

### OpenZeppelin Account

```typescript
import { Account, RpcProvider, hash, ec, stark, CallData } from 'starknet';

const provider = await RpcProvider.create({ nodeUrl: '...' });

// Generate keys
const privateKey = stark.randomAddress();
const publicKey = ec.starkCurve.getStarkKey(privateKey);

// OpenZeppelin class hash
const classHash = '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688';

// Compute address
const constructorCalldata = CallData.compile({ publicKey });
const address = hash.calculateContractAddressFromHash(
  publicKey,
  classHash,
  constructorCalldata,
  0
);

console.log('Fund this address:', address);

// After funding, deploy
const account = new Account({ provider, address, signer: privateKey });
const { transaction_hash } = await account.deployAccount({
  classHash,
  constructorCalldata,
  addressSalt: publicKey
});
```

### ArgentX Account

```typescript
import { Account, RpcProvider, hash, ec, stark, CallData } from 'starknet';

const provider = await RpcProvider.create({ nodeUrl: '...' });

const privateKey = stark.randomAddress();
const publicKey = ec.starkCurve.getStarkKey(privateKey);

// ArgentX class hash
const classHash = '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f';

// Constructor: owner + guardian (0 for no guardian)
const constructorCalldata = CallData.compile({
  owner: publicKey,
  guardian: 0
});

const address = hash.calculateContractAddressFromHash(
  publicKey,
  classHash,
  constructorCalldata,
  0
);

console.log('Fund this address:', address);

const account = new Account({ provider, address, signer: privateKey });
const { transaction_hash } = await account.deployAccount({
  classHash,
  constructorCalldata,
  addressSalt: publicKey
});
```

## Cairo Version Detection

Accounts can be Cairo 0 or Cairo 1. starknet.js auto-detects this, but you can specify it for better performance:

```typescript
// Auto-detect (requires RPC call)
const account = new Account({ provider, address, signer: privateKey });

// Explicit (faster, no RPC call)
const account = new Account({
  provider,
  address,
  signer: privateKey,
  cairoVersion: '1'  // or '0' for legacy accounts
});
```

**How to check Cairo version:**
```typescript
const classHash = await provider.getClassHashAt(accountAddress);
const contractClass = await provider.getClass(classHash);

if ('sierra_program' in contractClass) {
  console.log('Cairo 1 account');
} else {
  console.log('Cairo 0 account');
}
```

## Account Interface (SNIP-6)

All compliant accounts implement these methods:

```cairo
trait ISRC6 {
    fn __validate__(calls: Array<Call>) -> felt252;
    fn __execute__(calls: Array<Call>) -> Array<Span<felt252>>;
    fn is_valid_signature(hash: felt252, signature: Array<felt252>) -> felt252;
}
```

## Signer Types

### Stark Key Signer (Default)

```typescript
// From private key hex string
const account = new Account({ provider, address, signer: '0x123...' });

// From Uint8Array
const account = new Account({ provider, address, signer: privateKeyBytes });
```

### Ledger Signer

```typescript
import { LedgerSigner } from 'starknet';

const ledgerSigner = new LedgerSigner(
  transport,  // Ledger Transport
  0           // Account index
);

const account = new Account({ provider, address, signer: ledgerSigner });
```

### Custom Signer

```typescript
import { SignerInterface } from 'starknet';

class CustomSigner implements SignerInterface {
  async getPubKey(): Promise<string> { /* ... */ }
  async signMessage(typedData, accountAddress): Promise<Signature> { /* ... */ }
  async signTransaction(calls, details): Promise<Signature> { /* ... */ }
  async signDeployAccountTransaction(tx): Promise<Signature> { /* ... */ }
  async signDeclareTransaction(tx): Promise<Signature> { /* ... */ }
}
```

## Network Constants

```typescript
import { constants } from 'starknet';

constants.StarknetChainId.SN_MAIN      // '0x534e5f4d41494e'
constants.StarknetChainId.SN_SEPOLIA   // '0x534e5f5345504f4c4941'
```

## UDC (Universal Deployer Contract)

Default deployer used when `deployerAddress = 0`:

| Network | UDC Address |
|---------|-------------|
| All | `0x041a78e741e5af2fec34b695679bc6891742439f7afb8dd2b45d1490c8bf5d0` |

## Common Token Addresses

### STRK (Native Gas Token)

| Network | Address |
|---------|---------|
| Mainnet | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |
| Sepolia | `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d` |

### ETH

| Network | Address |
|---------|---------|
| Mainnet | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` |
| Sepolia | `0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7` |

## Troubleshooting

### "Account not deployed"

The computed address has no contract. Either:
1. Address not funded yet
2. Wrong class hash used
3. Wrong constructor calldata
4. Account already deployed with different parameters

### "Invalid signature"

1. Check private key matches public key in account
2. Verify Cairo version is correct
3. Ensure nonce is correct (auto-managed, but can cause issues with concurrent txs)

### "Insufficient funds"

Account needs STRK for gas. Check balance by calling the STRK ERC-20 contract:
```typescript
const strkAddress = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
const strkContract = new Contract(erc20Abi, strkAddress, provider);
const balance = await strkContract.balanceOf(accountAddress);
console.log('STRK balance:', balance);
```
