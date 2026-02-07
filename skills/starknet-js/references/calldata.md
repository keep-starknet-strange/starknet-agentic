# CallData Patterns Reference

## Overview

CallData handles serialization of function arguments for Starknet transactions. Cairo types have specific encoding requirements.

## Basic Usage

### With ABI (Recommended)

```typescript
import { CallData } from 'starknet';

const calldata = new CallData(contractAbi);
const compiled = calldata.compile('function_name', {
  param1: value1,
  param2: value2
});
```

### Without ABI (Raw)

```typescript
const compiled = CallData.compile([value1, value2, value3]);
```

## Cairo Type Helpers

### Import

```typescript
import { cairo } from 'starknet';
```

### Unsigned Integers

```typescript
// Small integers (u8, u16, u32, u64, u128) - direct values
cairo.felt252(1000)     // BigInt

// u256 - splits into low/high
cairo.uint256(1000)     // { low: 1000n, high: 0n }
cairo.uint256('0x...')  // Works with hex strings
cairo.uint256(2n**200n) // Handles large numbers
```

### Felt252

```typescript
cairo.felt('0x123')     // Convert hex to felt
cairo.felt(123)         // Convert number to felt
cairo.felt('123')       // Convert string number to felt
```

### Boolean

```typescript
cairo.bool(true)   // 1n
cairo.bool(false)  // 0n
```

### ByteArray (Strings)

For long strings (>31 chars):

```typescript
cairo.byteArray('Hello, Starknet!')
// Returns: { data: [...], pending_word: ..., pending_word_len: ... }
```

### Short String

For strings <= 31 chars:

```typescript
import { shortString } from 'starknet';

shortString.encodeShortString('hello')  // felt252
shortString.decodeShortString('0x...')  // 'hello'
```

## Complex Types

### Structs

Pass as objects matching field names:

```typescript
// Cairo struct:
// struct Transfer { recipient: ContractAddress, amount: u256 }

const structArg = {
  recipient: '0x123...',
  amount: cairo.uint256(1000)
};

calldata.compile('transfer', { transfer_data: structArg });
```

### Nested Structs

```typescript
// struct Order { user: User, items: Array<Item> }
// struct User { address: felt252, name: felt252 }
// struct Item { id: u64, quantity: u32 }

const order = {
  user: {
    address: '0x123...',
    name: shortString.encodeShortString('Alice')
  },
  items: [
    { id: 1, quantity: 5 },
    { id: 2, quantity: 3 }
  ]
};
```

### Arrays

Arrays are automatically prefixed with their length:

```typescript
// Input: [1, 2, 3]
// Encoded: [3, 1, 2, 3] (length prefix)

const arrayArg = [1, 2, 3];
calldata.compile('process_array', { values: arrayArg });
```

### Tuples

Fixed-size, ordered values:

```typescript
// Cairo: (felt252, u256)
const tupleArg = ['0x123...', cairo.uint256(1000)];
```

## Enums

### CairoCustomEnum

For user-defined enums:

```typescript
import { CairoCustomEnum } from 'starknet';

// Cairo enum:
// enum Status { Pending, Active: u32, Completed: (felt252, u256) }

// Variant without data
const pending = new CairoCustomEnum({ Pending: {} });

// Variant with simple data
const active = new CairoCustomEnum({ Active: 42 });

// Variant with tuple data
const completed = new CairoCustomEnum({
  Completed: ['0x123...', cairo.uint256(1000)]
});
```

### CairoOption

```typescript
import { CairoOption, CairoOptionVariant } from 'starknet';

// Some value
const some = new CairoOption(CairoOptionVariant.Some, value);

// None
const none = new CairoOption(CairoOptionVariant.None);
```

### CairoResult

```typescript
import { CairoResult, CairoResultVariant } from 'starknet';

// Ok
const ok = new CairoResult(CairoResultVariant.Ok, successValue);

// Err
const err = new CairoResult(CairoResultVariant.Err, errorValue);
```

## Type Mapping

### Cairo to TypeScript

| Cairo Type | TypeScript | Helper |
|------------|------------|--------|
| `felt252` | `BigNumberish` | `cairo.felt()` |
| `u8`, `u16`, `u32`, `u64`, `u128` | `BigNumberish` | Direct value |
| `u256` | `{ low, high }` | `cairo.uint256()` |
| `i8`, `i16`, `i32`, `i64`, `i128` | `BigNumberish` | Direct value |
| `bool` | `boolean` | `cairo.bool()` |
| `ContractAddress` | `string` (hex) | - |
| `ClassHash` | `string` (hex) | - |
| `EthAddress` | `string` (hex) | - |
| `ByteArray` | `string` | `cairo.byteArray()` |
| `Array<T>` | `T[]` | - |
| `Span<T>` | `T[]` | - |
| Tuple `(A, B)` | `[A, B]` | - |
| Struct | `{ field: value }` | - |
| Enum | `CairoCustomEnum` | - |
| `Option<T>` | `CairoOption` | - |
| `Result<T, E>` | `CairoResult` | - |

### Type Strings (ABI)

```typescript
// Core types
'core::felt252'
'core::integer::u8'
'core::integer::u16'
'core::integer::u32'
'core::integer::u64'
'core::integer::u128'
'core::integer::u256'
'core::bool'
'core::starknet::contract_address::ContractAddress'
'core::starknet::class_hash::ClassHash'
'core::byte_array::ByteArray'

// Generic types
'core::array::Array<core::felt252>'
'core::array::Span<core::integer::u256>'
'core::option::Option<core::felt252>'
'core::result::Result<core::felt252, core::felt252>'
```

## Validation

### Validate Before Compile

```typescript
const calldata = new CallData(abi);

try {
  calldata.validate('INVOKE', 'transfer', [recipient, amount]);
  console.log('Arguments are valid');
} catch (error) {
  console.error('Validation failed:', error.message);
}
```

## Raw Calldata Operations

### To Hex Array

```typescript
const hexArray = CallData.toHex(compiledCalldata);
// ['0x1', '0x2', '0x3']
```

### From Hex Array

```typescript
const calldata = CallData.toCalldata(['0x1', '0x2', '0x3']);
```

## Contract Call Patterns

### Read (call)

```typescript
// Direct method call
const balance = await contract.balanceOf(userAddress);

// Using call()
const balance = await contract.call('balanceOf', [userAddress]);
```

### Write (invoke)

```typescript
// Direct method call
const tx = await contract.transfer(recipient, amount);

// Using invoke()
const tx = await contract.invoke('transfer', [recipient, amount]);

// With explicit calldata
const tx = await contract.invoke('transfer', CallData.compile({
  recipient: '0x123...',
  amount: cairo.uint256(1000)
}));
```

### Populate (for multicall)

```typescript
const call = contract.populate('transfer', {
  recipient: '0x123...',
  amount: cairo.uint256(1000)
});
// Returns: { contractAddress, entrypoint, calldata }

// Use in multicall
await account.execute([call1, call2]);
```

## ERC20 Transfer Example

```typescript
import { Contract, CallData, cairo } from 'starknet';

const erc20Abi = [/* ... */];
const tokenContract = new Contract(erc20Abi, tokenAddress, account);

// Method 1: Direct call with cairo helpers
await tokenContract.transfer(
  '0x789...',           // recipient
  cairo.uint256(1000)   // amount (u256)
);

// Method 2: Using populate for multicall
const transferCall = tokenContract.populate('transfer', {
  recipient: '0x789...',
  amount: cairo.uint256(1000)
});
await account.execute([transferCall]);

// Method 3: Raw calldata
await account.execute([{
  contractAddress: tokenAddress,
  entrypoint: 'transfer',
  calldata: CallData.compile({
    recipient: '0x789...',
    amount: cairo.uint256(1000)
  })
}]);
```

## Common Patterns

### Approve + Transfer

```typescript
const approveCall = tokenContract.populate('approve', {
  spender: bridgeAddress,
  amount: cairo.uint256(1000)
});

const transferCall = bridgeContract.populate('deposit', {
  amount: cairo.uint256(1000)
});

await account.execute([approveCall, transferCall]);
```

### Batch Mint (Array Argument)

```typescript
// Cairo: fn batch_mint(recipients: Array<ContractAddress>, amounts: Array<u256>)

const recipients = ['0x111...', '0x222...', '0x333...'];
const amounts = recipients.map(() => cairo.uint256(100));

await contract.batch_mint(recipients, amounts);
```

### Complex Struct

```typescript
// Cairo struct with nested types
const orderData = {
  id: 12345,
  user: {
    address: userAddress,
    tier: new CairoCustomEnum({ Premium: {} })
  },
  items: [
    { product_id: 1, quantity: 2, price: cairo.uint256(50) },
    { product_id: 3, quantity: 1, price: cairo.uint256(100) }
  ],
  metadata: new CairoOption(CairoOptionVariant.Some, 'rush-delivery')
};

await contract.create_order(orderData);
```

## Debugging

### Log Compiled Calldata

```typescript
const compiled = calldata.compile('transfer', { recipient, amount });
console.log('Compiled calldata:', compiled.map(v => v.toString(16)));
```

### Check ABI Parser

```typescript
const calldata = new CallData(abi);
const parser = calldata.parser;

// Get function inputs
const inputs = parser.getInputs('transfer');
console.log('Expected inputs:', inputs);
```
