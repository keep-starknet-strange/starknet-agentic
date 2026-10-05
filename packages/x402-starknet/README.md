# @starknetfoundation/starknet-agentic-x402-starknet

Client side of the x402 `exact` payment scheme on Starknet (x402 v2), as registered by the
x402 Foundation in
[`specs/schemes/exact/scheme_exact_starknet.md`](https://github.com/x402-foundation/x402/blob/751590a25e7ecc22ee044b37fd55c2b66cc14fd6/specs/schemes/exact/scheme_exact_starknet.md)
(implemented against commit `751590a25e7ecc22ee044b37fd55c2b66cc14fd6`, exported as `SPEC_REVISION`).

This package is private; `@starknetfoundation/starknet-agentic-mcp-server` bundles it.

## What it does

Given the `PAYMENT-REQUIRED` header of a `402` response, it:

1. decodes it (standard base64 only; base64url is refused) and validates the
   `PaymentRequired` document with zod;
2. selects the `accepts` entry to pay: the one named by `acceptIndex`, otherwise the first
   entry with `scheme: "exact"` on the payer's network (the reference client's default);
3. validates that entry strictly: base-10 `amount` in `(0, 2^256)`, `asset`, `payTo` and
   `extra.feePayer` valid non-zero addresses, `feePayer` neither the payer nor the SNIP-9
   `ANY_CALLER` sentinel, `maxTimeoutSeconds` a positive integer no larger than the cap
   (3600 by default, configurable up to 86400);
4. **builds** the SNIP-9 v2 `OutsideExecution` (SNIP-12 revision 1) itself: exactly one call
   `transfer(payTo, amount_low, amount_high)` on `asset`, `Caller = extra.feePayer`, a fresh
   random nonce, `Execute After = 1`, `Execute Before = now + maxTimeoutSeconds`;
5. freezes that document and runs the **intent check** on it (exact keys, canonical hex
   felts, every field equal to what the requirements say), then signs it;
6. with a private key, verifies the signature over that exact document;
7. returns the `PAYMENT-SIGNATURE` header: standard base64 of
   `{ x402Version: 2, resource, accepted, payload: { from, outsideExecution: { typedData, signature } } }`,
   where `signature` is hex felts (`[r, s]` for a single-key account) and `accepted` echoes
   the chosen entry verbatim, as the reference resource server deep-compares it.

No typed data, call data or other content from the server is ever signed. Server fields the
scheme does not define are not read; they only appear in the unsigned `accepted` echo.

## API

```ts
import {
  createStarknetPaymentSignatureHeader,
  prepareStarknetPayment,
  signPreparedStarknetPayment,
} from "@starknetfoundation/starknet-agentic-x402-starknet"

// One shot.
const { headerValue, summary } = await createStarknetPaymentSignatureHeader({
  paymentRequiredHeader,          // PAYMENT-REQUIRED response header
  network: "starknet:SN_SEPOLIA", // the chain the paying account lives on
  accountAddress,
  privateKey,                     // or: signer: { signMessage(typedData, accountAddress) }
  acceptIndex: 0,                 // optional
})

// Two steps, to enforce a spending policy on the exact values that will be signed.
const prepared = prepareStarknetPayment({ paymentRequiredHeader, network, accountAddress })
// ...check prepared.requirements.{asset, payTo, amount}...
const signed = await signPreparedStarknetPayment(prepared, { privateKey })
```

The pieces are exported too: `decodePaymentRequiredHeader`, `selectPaymentRequirements`,
`parseExactStarknetRequirements`, `buildOutsideExecutionTypedData`,
`assertTypedDataMatchesIntent`, `decodePaymentSignatureHeader`, `networkForChainId`.

Every refusal throws `X402PaymentError` with a stable `code`
(`invalid_header`, `invalid_payment_required`, `no_matching_requirements`,
`invalid_payment_requirements`, `intent_mismatch`, `invalid_signature`, `invalid_arguments`).

## Breaking change from 0.1.0

The previous API signed the `typedData` a server put in `PAYMENT-REQUIRED`, which let a server
obtain a signature over arbitrary calls (issue #554), and used base64url. It is removed:
`createStarknetPaymentSignatureHeader` now requires `network` and refuses the old
`paymentRequired`, `typedData` and `rpcUrl` arguments; `decodeBase64Json`, `encodeBase64Json`,
`X402PaymentRequired` and `X402PaymentSignature` are gone.

## Tests

- `__tests__/exact-scheme.test.ts`: happy path through an independent facilitator-style
  verifier (rebuilds the canonical document from the five message fields, hashes it with
  starknet.js and with a hand-written SNIP-12 implementation, checks the signature), and
  known-answer vectors (the x402 reference implementation's pinned hash, and the spec's own
  example document).
- `__tests__/adversarial.test.ts`: injected server content, scheme/network/version, amounts
  and u256 limbs, addresses, time bounds, header encodings, selection, tampering between
  building and signing, forged prepared payments, malformed signatures.
