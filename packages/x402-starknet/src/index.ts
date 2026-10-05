import { Account, RpcProvider, stark, type TypedData } from "starknet"

export type X402PaymentRequired = {
  /** opaque scheme id, ex: exact-starknet */
  scheme: string
  /** facilitator URL */
  facilitator?: string
  /** typedData the client must sign for Starknet exact scheme */
  typedData?: TypedData
  /** optional extra fields */
  [k: string]: unknown
}

export type X402PaymentSignature = {
  scheme: string
  typedData: TypedData
  /** Signature felts as 0x-prefixed hex strings; `[r, s]` for the built-in private-key signer. */
  signature: string[]
  address: string
  [k: string]: unknown
}

function base64ToBuffer(input: string): Buffer {
  // Accept both base64 and base64url.
  // base64url uses -_ and often omits padding.
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/").trim()

  // Length mod 4 === 1 is not a valid base64/base64url length.
  // Guard to avoid silently decoding garbage.
  if (normalized.length % 4 === 1) {
    throw new Error("Invalid base64/base64url string length")
  }

  const padLen = (4 - (normalized.length % 4)) % 4
  const padded = normalized + "=".repeat(padLen)
  return Buffer.from(padded, "base64")
}

function bufferToBase64Url(buf: Buffer): string {
  const base64 = buf.toString("base64")
  const base64Url = base64.replaceAll("+", "-").replaceAll("/", "_")

  let end = base64Url.length
  while (end > 0 && base64Url.charAt(end - 1) === "=") {
    end -= 1
  }

  return base64Url.slice(0, end)
}

export function decodeBase64Json<T = unknown>(v: string): T {
  return JSON.parse(base64ToBuffer(v).toString("utf8")) as T
}

/**
 * Encodes as base64url (RFC 4648) without padding.
 * This is generally safer for HTTP header values.
 */
export function encodeBase64Json(value: unknown): string {
  return bufferToBase64Url(Buffer.from(JSON.stringify(value), "utf8"))
}

/**
 * Create PAYMENT-SIGNATURE header value for Starknet by signing the typedData contained in PAYMENT-REQUIRED.
 *
 * This is intentionally generic: it does not assume a specific facilitator implementation.
 */
export async function createStarknetPaymentSignatureHeader(args: {
  paymentRequiredHeader: string
  rpcUrl: string
  accountAddress: string
  privateKey: string
}): Promise<{ headerValue: string; payload: X402PaymentSignature }>

export async function createStarknetPaymentSignatureHeader(args: {
  paymentRequired: X402PaymentRequired
  rpcUrl: string
  accountAddress: string
  privateKey: string
}): Promise<{ headerValue: string; payload: X402PaymentSignature }>

export async function createStarknetPaymentSignatureHeader(args: {
  paymentRequiredHeader?: string
  paymentRequired?: X402PaymentRequired
  rpcUrl: string
  accountAddress: string
  privateKey: string
}): Promise<{ headerValue: string; payload: X402PaymentSignature }> {
  const paymentRequired =
    args.paymentRequired ??
    (args.paymentRequiredHeader
      ? decodeBase64Json<X402PaymentRequired>(args.paymentRequiredHeader)
      : undefined)

  if (!paymentRequired) throw new Error("Missing paymentRequired")
  if (!paymentRequired.typedData) throw new Error("paymentRequired.typedData missing")

  const provider = new RpcProvider({ nodeUrl: args.rpcUrl })
  const account = new Account({ provider, address: args.accountAddress, signer: args.privateKey })

  // starknet.js signs typedData per SNIP-12.
  const rawSignature = await account.signMessage(paymentRequired.typedData)

  // The default (private-key) signer returns a Signature object whose r and s are bigints,
  // which JSON.stringify cannot serialize. Encode it as hex felts [r, s] with starknet.js's own
  // stark.formatSignature, the encoding starknet.js sends to RPC nodes and the one the registered
  // exact/Starknet x402 scheme uses for its signature value (this payload's envelope is still
  // not that scheme's, see #554). The recovery bit is not part of a Starknet signature and is
  // dropped. An array signature is already a felt array and is kept as is.
  // Only the encoding changes: the signed typedData and its message hash are untouched.
  const signature = Array.isArray(rawSignature) ? rawSignature : stark.formatSignature(rawSignature)

  // Preserve any additional metadata from PAYMENT-REQUIRED (facilitator, extensions, etc).
  // Explicit keys win, so we don't let unknown fields override scheme/typedData/signature/address.
  const payload: X402PaymentSignature = {
    ...(paymentRequired as Record<string, unknown>),
    scheme: paymentRequired.scheme,
    typedData: paymentRequired.typedData,
    signature,
    address: args.accountAddress,
  }

  return { headerValue: encodeBase64Json(payload), payload }
}
