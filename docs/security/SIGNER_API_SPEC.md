# Starknet Signer Proxy API Spec (v1)

This document defines the contract between `packages/starknet-mcp-server` (proxy signer client) and the remote signer service.

## Canonical Artifacts

- OpenAPI: `spec/signer-api-v1.openapi.yaml`
- JSON Schema: `spec/signer-api-v1.schema.json`
- Examples:
  - `spec/examples/signer-api/transfer.request.json`
  - `spec/examples/signer-api/transfer.response.json`
  - `spec/examples/signer-api/invoke.request.json`
  - `spec/examples/signer-api/invoke.response.json`
  - `spec/examples/signer-api/x402.request.json`
  - `spec/examples/signer-api/x402.response.json`

Note: current `starknet-mcp-server` runtime disables `x402_starknet_sign_payment_required` in proxy mode.
The x402 examples document the signer API contract for interoperable clients and planned proxy-safe x402 paths.

## Endpoint

- Method: `POST`
- Path: `/v1/sign/session-transaction`
- Body: JSON payload describing account, chain, nonce, validity window, calls, and context.
- Success signature envelope: `[session_pubkey, r, s, valid_until]`

## Required Authentication and Transport

HMAC headers (all required):
- `X-Keyring-Client-Id`
- `X-Keyring-Timestamp`
- `X-Keyring-Nonce`
- `X-Keyring-Signature` (HMAC-SHA256 digest encoded as lowercase hex)

HMAC payload format (HMAC-SHA256, lowercase hex; must match exactly):
- `<timestamp>.<nonce>.POST./v1/sign/session-transaction.<sha256(raw_json_body)>`

mTLS:
- Required for non-loopback production deployments.
- Client certificate, key, and CA chain must be configured together.

## Required Security Validation (Client-side)

Clients must reject responses unless all conditions hold:

1. `signatureMode == "v2_snip12"`
2. `signatureKind == "Snip12"`
3. `signature` has exactly 4 felts
4. `signature[0]` matches `sessionPublicKey` (if present)
5. `signature[3]` matches requested `validUntil`
6. `domainHash` and `messageHash` are present and valid felt hex
7. session pubkey does not rotate unexpectedly within one client session

## Error Codes

The API standardizes the following `errorCode` values:

- `AUTH_INVALID_HMAC`
- `AUTH_INVALID_CLIENT`
- `AUTH_TIMESTAMP_SKEW`
- `AUTH_MTLS_REQUIRED`
- `REPLAY_NONCE_USED`
- `POLICY_SELECTOR_DENIED`
- `POLICY_CALL_NOT_ALLOWED`
- `RATE_LIMITED`
- `SIGNER_UNAVAILABLE`
- `INTERNAL_ERROR`

Error responses include:
- `error` (human-readable message)
- `errorCode` (stable machine code)
- `requestId` (correlation id)
- `retryable` (boolean)

## Audit Fields

The request `context` and response `audit` fields establish minimum traceability.

Required request context fields:
- `requester`
- `tool`
- `reason`
- `actor`
- `requestId`
- `traceId`

`context.requestId` identifies the inbound signing request envelope.

Recommended request context fields:
- `sessionId`

Required response audit fields:
- `policyDecision`
- `decidedAt`
- `keyId`
- `traceId`

The response also carries a top-level `requestId` for response/error correlation; implementations should propagate the same logical request id across request context, response envelope, and logs.

## Versioning and Compatibility

- Path and envelope are versioned and locked for v1.
- Any incompatible request/response field or signing envelope change requires:
  - new path version (for example `/v2/...`) or
  - a migration window with explicit dual-mode support.
- Cross-repo conformance vectors must be updated in lockstep with this contract.
