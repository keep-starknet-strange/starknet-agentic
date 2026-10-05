---
"@starknetfoundation/starknet-agentic-mcp-server": patch
---

Fix a policy bypass: the policy guard compared addresses as lowercase strings, so an address on a blocklist (or missing from an allowlist) got through when written with a different number of leading zeros, e.g. `0x49d3…` vs `0x049d3…`. Recipient, contract and token addresses in `transfer`, `invoke`, `swap` and `build_calls` policies are now compared by numeric value; token symbols are still matched case-insensitively.
