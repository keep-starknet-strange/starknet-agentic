# @starknetfoundation/starknet-agentic-onboarding-utils

## 0.1.2

### Patch Changes

- Fix installation. 0.1.0 and 0.1.1 depend on `@starknetfoundation/starknet-agentic-shared@0.1.0`, which was never published, so `npm install` fails with a 404. The shared constants are now bundled into `dist/`, and `starknet` is the only runtime dependency.
- Move to starknet.js v10 (`starknet` ^10.8.0; 0.1.1 used ^9.4.2). The exported `ProviderLike` type is now derived from starknet.js 10's `RpcProvider`.

## 0.1.1

### Patch Changes

- e11d655: Add `license: MIT` and `author` metadata so npm shows the correct license on the package pages and downstream consumers can redistribute under MIT (matching the repo's LICENSE file). The first-published 0.1.0 versions inadvertently shipped without a license field.
