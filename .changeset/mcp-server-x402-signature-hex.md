---
"@starknetfoundation/starknet-agentic-mcp-server": patch
---

Fix `x402_starknet_sign_payment_required`, which failed on every signing request with "Do not know how to serialize a BigInt"; the signature is now returned as hex felts `[r, s]`.
