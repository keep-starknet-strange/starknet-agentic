import { Account, RpcProvider, type TypedData } from "starknet"
import { trimTrailingChar } from "../../shared/src/string.js"

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
  signature: unknown
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
  return trimTrailingChar(base64Url, "=")
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
  const signature = await account.signMessage(paymentRequired.typedData)

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
