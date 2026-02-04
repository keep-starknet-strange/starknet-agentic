import { Account, RpcProvider, type TypedData } from "starknet"

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

export function decodeBase64Json<T = unknown>(v: string): T {
  return JSON.parse(Buffer.from(v, "base64").toString("utf8")) as T
}

export function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64")
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
  const account = new Account(provider, args.accountAddress, args.privateKey)

  // starknet.js signs typedData per SNIP-12.
  const signature = await account.signMessage(paymentRequired.typedData)

  const payload: X402PaymentSignature = {
    scheme: paymentRequired.scheme,
    typedData: paymentRequired.typedData,
    signature,
    address: args.accountAddress
  }

  return { headerValue: encodeBase64Json(payload), payload }
}
