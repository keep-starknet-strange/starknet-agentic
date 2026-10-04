---
"@starknetfoundation/starknet-agentic-onboarding-utils": minor
---

The package installs from npm again and moves to starknet.js v10.

- Fix installation. 0.1.0 and 0.1.1 depend on
  `@starknetfoundation/starknet-agentic-shared@0.1.0`, which was never
  published, so `npm install` fails with a 404. The shared constants are now
  bundled into `dist/`, and `starknet` is the only runtime dependency.
- Move to starknet.js v10 (`starknet` ^10.8.0; 0.1.1 used ^9.4.2). The exported
  `ProviderLike` type is now derived from starknet.js 10's `RpcProvider`, so
  pass it a starknet.js 10 provider.
