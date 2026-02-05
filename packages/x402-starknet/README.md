# @starknet-agentic/x402-starknet

Small helpers for x402-on-Starknet header handling.

## Header encoding

- `encodeBase64Json` emits base64url (RFC 4648, URL-safe, no padding).
- `decodeBase64Json` accepts both base64 and base64url.

Rationale: base64url is generally safer in HTTP headers and logs.

## Signing PAYMENT-REQUIRED

`createStarknetPaymentSignatureHeader`:
- decodes a base64/base64url PAYMENT-REQUIRED header
- signs the embedded Starknet SNIP-12 typedData
- returns a base64url PAYMENT-SIGNATURE header value

It also preserves additional metadata fields from PAYMENT-REQUIRED (for example `facilitator`, extensions, or other keys), while ensuring `scheme`, `typedData`, `signature`, and `address` are set explicitly.
