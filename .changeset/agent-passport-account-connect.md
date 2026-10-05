---
"@starknetfoundation/starknet-agentic-agent-passport": patch
---

Fix `IdentityRegistryPassportClient` on starknet.js 10:

- Passing an `account` threw `this.contract.connect is not a function`, because starknet.js 10 removed `Contract.connect()`. The contract is now built with the account as `providerOrAccount` (falling back to the provider), so `setMetadata` and `publishCapability` send through the account.
- `getMetadata` and `setMetadata` threw `Invalid input for CairoByteArray: objects are not supported`. They now pass plain strings, and the bundled ABI includes the `ByteArray` and `u256` struct definitions so the key and value are encoded as `ByteArray` calldata.
