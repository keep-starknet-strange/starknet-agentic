# @starknetfoundation/starknet-agentic-agent-passport

## 0.1.2

### Patch Changes

- 3295727: Fix `IdentityRegistryPassportClient` on starknet.js 10:
  
  - Passing an `account` threw `this.contract.connect is not a function`, because starknet.js 10 removed `Contract.connect()`. The contract is now built with the account as `providerOrAccount` (falling back to the provider), so `setMetadata` and `publishCapability` send through the account.
  - `getMetadata` and `setMetadata` threw `Invalid input for CairoByteArray: objects are not supported`. They now pass plain strings, and the bundled ABI includes the `ByteArray` and `u256` struct definitions so the key and value are encoded as `ByteArray` calldata.

## 0.1.1

### Patch Changes

- e11d655: Add `license: MIT` and `author` metadata so npm shows the correct license on the package pages and downstream consumers can redistribute under MIT (matching the repo's LICENSE file). The first-published 0.1.0 versions inadvertently shipped without a license field.
