# ERC Token Patterns Reference

## ERC-20 (Fungible Tokens)

### Minimal ABI

```typescript
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'core::starknet::contract_address::ContractAddress' }],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'view',
  },
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'amount', type: 'core::integer::u256' },
    ],
    outputs: [{ type: 'core::bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'spender', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'amount', type: 'core::integer::u256' },
    ],
    outputs: [{ type: 'core::bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'spender', type: 'core::starknet::contract_address::ContractAddress' },
    ],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'view',
  },
  {
    name: 'totalSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'view',
  },
  {
    name: 'name',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'core::byte_array::ByteArray' }],
    state_mutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'core::byte_array::ByteArray' }],
    state_mutability: 'view',
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'core::integer::u8' }],
    state_mutability: 'view',
  },
] as const;
```

### Common Token Addresses

```typescript
const TOKENS = {
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  USDC: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080',
};
```

### Read Balance

```typescript
import { Contract, cairo } from 'starknet';

const token = new Contract(ERC20_ABI, tokenAddress, provider);
const balance = await token.balanceOf(accountAddress);

// Convert to human-readable (18 decimals for STRK/ETH)
const decimals = await token.decimals();
const balanceWei = BigInt(balance.low) + (BigInt(balance.high) << 128n);
const balanceFormatted = Number(balanceWei) / 10 ** Number(decimals);
```

### Transfer

```typescript
const token = new Contract(ERC20_ABI, tokenAddress, account);

const tx = await token.transfer(
  recipientAddress,
  cairo.uint256(1000000000000000000n) // 1 token (18 decimals)
);
await provider.waitForTransaction(tx.transaction_hash);
```

### Approve + TransferFrom

```typescript
// Approve spender
const approveTx = await token.approve(
  spenderAddress,
  cairo.uint256(amount)
);
await provider.waitForTransaction(approveTx.transaction_hash);

// Check allowance
const allowance = await token.allowance(ownerAddress, spenderAddress);
```

### Multicall: Approve + Swap

```typescript
const approveCall = token.populate('approve', {
  spender: dexAddress,
  amount: cairo.uint256(inputAmount)
});

const swapCall = dexContract.populate('swap', {
  token_in: tokenAAddress,
  amount_in: cairo.uint256(inputAmount),
  min_amount_out: cairo.uint256(minOutput)
});

// Atomic: both succeed or both fail
const tx = await account.execute([approveCall, swapCall]);
```

### Get Token Info

```typescript
const token = new Contract(ERC20_ABI, tokenAddress, provider);

const [name, symbol, decimals, totalSupply] = await Promise.all([
  token.name(),
  token.symbol(),
  token.decimals(),
  token.totalSupply(),
]);

console.log(`${name} (${symbol}), ${decimals} decimals, supply: ${totalSupply}`);
```

## ERC-721 (NFTs)

### Minimal ABI

```typescript
const ERC721_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'core::starknet::contract_address::ContractAddress' }],
    outputs: [{ type: 'core::integer::u256' }],
    state_mutability: 'view',
  },
  {
    name: 'ownerOf',
    type: 'function',
    inputs: [{ name: 'token_id', type: 'core::integer::u256' }],
    outputs: [{ type: 'core::starknet::contract_address::ContractAddress' }],
    state_mutability: 'view',
  },
  {
    name: 'transferFrom',
    type: 'function',
    inputs: [
      { name: 'from', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'to', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'token_id', type: 'core::integer::u256' },
    ],
    outputs: [],
  },
  {
    name: 'approve',
    type: 'function',
    inputs: [
      { name: 'to', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'token_id', type: 'core::integer::u256' },
    ],
    outputs: [],
  },
  {
    name: 'setApprovalForAll',
    type: 'function',
    inputs: [
      { name: 'operator', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'approved', type: 'core::bool' },
    ],
    outputs: [],
  },
  {
    name: 'getApproved',
    type: 'function',
    inputs: [{ name: 'token_id', type: 'core::integer::u256' }],
    outputs: [{ type: 'core::starknet::contract_address::ContractAddress' }],
    state_mutability: 'view',
  },
  {
    name: 'isApprovedForAll',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'operator', type: 'core::starknet::contract_address::ContractAddress' },
    ],
    outputs: [{ type: 'core::bool' }],
    state_mutability: 'view',
  },
  {
    name: 'tokenURI',
    type: 'function',
    inputs: [{ name: 'token_id', type: 'core::integer::u256' }],
    outputs: [{ type: 'core::byte_array::ByteArray' }],
    state_mutability: 'view',
  },
] as const;
```

### Check Ownership

```typescript
const nft = new Contract(ERC721_ABI, nftAddress, provider);

const owner = await nft.ownerOf(cairo.uint256(tokenId));
console.log('Owner:', owner);

const balance = await nft.balanceOf(userAddress);
console.log('NFTs owned:', balance);
```

### Transfer NFT

```typescript
const nft = new Contract(ERC721_ABI, nftAddress, account);

const tx = await nft.transferFrom(
  fromAddress,
  toAddress,
  cairo.uint256(tokenId)
);
await provider.waitForTransaction(tx.transaction_hash);
```

### Approve and Transfer

```typescript
// Approve marketplace
const approveTx = await nft.approve(
  marketplaceAddress,
  cairo.uint256(tokenId)
);
await provider.waitForTransaction(approveTx.transaction_hash);

// Or approve all
const approveAllTx = await nft.setApprovalForAll(
  marketplaceAddress,
  true
);
```

### Read Token Metadata

```typescript
const nft = new Contract(ERC721_ABI, nftAddress, provider);
const uri = await nft.tokenURI(cairo.uint256(tokenId));
console.log('Token URI:', uri);
```

## Batch Operations

### Batch ERC-20 Transfers

```typescript
const token = new Contract(ERC20_ABI, tokenAddress, account);

const recipients = [
  { address: '0x111...', amount: 100n * 10n ** 18n },
  { address: '0x222...', amount: 200n * 10n ** 18n },
  { address: '0x333...', amount: 50n * 10n ** 18n },
];

const calls = recipients.map(r =>
  token.populate('transfer', {
    recipient: r.address,
    amount: cairo.uint256(r.amount),
  })
);

// Single transaction for all transfers
const tx = await account.execute(calls);
```

### Batch NFT Transfers

```typescript
const nft = new Contract(ERC721_ABI, nftAddress, account);

const transfers = [
  { to: '0x111...', tokenId: 1 },
  { to: '0x222...', tokenId: 2 },
  { to: '0x333...', tokenId: 3 },
];

const calls = transfers.map(t =>
  nft.populate('transferFrom', {
    from: account.address,
    to: t.to,
    token_id: cairo.uint256(t.tokenId),
  })
);

const tx = await account.execute(calls);
```

## Balance Formatting Utilities

```typescript
function formatTokenAmount(balance: { low: bigint; high: bigint }, decimals: number): string {
  const raw = BigInt(balance.low) + (BigInt(balance.high) << 128n);
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 4);
  return `${whole}.${fractionStr}`;
}

function parseTokenAmount(amount: string, decimals: number): bigint {
  const [whole, fraction = ''] = amount.split('.');
  const fractionPadded = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + fractionPadded);
}

// Usage
const balance = await token.balanceOf(address);
console.log(formatTokenAmount(balance, 18)); // "1.5000"

const amount = parseTokenAmount('1.5', 18);
await token.transfer(recipient, cairo.uint256(amount));
```
