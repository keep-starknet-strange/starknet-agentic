---
"@starknetfoundation/starknet-agentic-mcp-server": minor
---

**Breaking (security):** `x402_starknet_sign_payment_required` now implements the x402 v2 `exact` scheme on Starknet and no longer signs typed data supplied by the server. Previously it signed whatever `typedData` a `PAYMENT-REQUIRED` header contained, so a malicious server could obtain the agent's signature on an `OutsideExecution` authorizing arbitrary calls (#554).

The tool now builds the payment itself from the server's payment requirements: exactly one `transfer` of the required amount of the required token to `payTo`, executable only by the server's `extra.feePayer`, valid for `maxTimeoutSeconds` (at most 3600). It checks the built document against that intent before signing, and holds the payment to the `transfer` policy (`maxAmountPerCall`, `allowedRecipients`, `blockedRecipients`, `allowedTokens`) like a `starknet_transfer`.

What changes for callers:

- Input: `paymentRequiredHeader` must be a standard-base64 x402 v2 `PaymentRequired` (`x402Version: 2`, `resource`, `accepts[]` with `scheme: "exact"`, `network: "starknet:SN_MAIN" | "starknet:SN_SEPOLIA"`, `amount`, `asset`, `payTo`, `maxTimeoutSeconds`, `extra.feePayer`). Headers carrying `{ scheme, typedData }` and base64url headers are rejected. New optional `acceptIndex` picks the `accepts` entry; by default the first `exact` entry on the account's chain is paid.
- Output: `{ paymentSignatureHeader, summary }`. The header is standard base64 of `{ x402Version: 2, resource, accepted, payload: { from, outsideExecution: { typedData, signature } } }`; `summary` states the token, exact amount, recipient, fee payer and expiry. The old `payload` field is gone.
- The tool now reads the chain id from the RPC and only pays offers on that chain.
