import { randomBytes } from "node:crypto"
import { ec, Signer, stark, typedData as snip12, type Signature, type TypedData } from "starknet"
import {
  EXECUTE_AFTER,
  MAX_SIGNATURE_FELTS,
  STARK_CURVE_ORDER,
  STARK_PRIME,
  X402_VERSION,
  type StarknetNetwork,
} from "./constants.js"
import { decodeBase64Json, encodeBase64Json } from "./base64.js"
import { X402PaymentError } from "./errors.js"
import { assertTypedDataMatchesIntent, type PaymentIntent } from "./intent.js"
import {
  decodePaymentRequiredHeader,
  isStarknetAddress,
  parseExactStarknetRequirements,
  resolveMaxTimeoutSecondsCap,
  selectPaymentRequirements,
  toFeltHex,
  toPaddedAddress,
  type ExactStarknetRequirements,
} from "./requirements.js"
import { buildOutsideExecutionTypedData, deepFreeze, type OutsideExecutionTypedData } from "./typedData.js"

// ── Types ───────────────────────────────────────────────────────────────────

/** Anything that signs SNIP-12 typed data for an account, like starknet.js's `SignerInterface`. */
export interface PaymentSigner {
  signMessage(typedData: TypedData, accountAddress: string): Promise<Signature>
}

/** A payment chosen and validated from `PAYMENT-REQUIRED`, not yet signed. Deep-frozen. */
export interface PreparedStarknetPayment {
  readonly x402Version: typeof X402_VERSION
  readonly acceptIndex: number
  /** Payer account, canonical hex felt. */
  readonly payer: string
  readonly maxTimeoutSecondsCap: number
  readonly requirements: Readonly<ExactStarknetRequirements>
  /** The chosen `accepts` entry verbatim (echoed as `accepted`; not signed). */
  readonly accepted: Readonly<Record<string, unknown>>
  /** The `resource` object verbatim (echoed; not signed). */
  readonly resource: Readonly<Record<string, unknown>>
}

/** The `PaymentPayload` carried, base64-encoded, in `PAYMENT-SIGNATURE`. */
export interface ExactStarknetPaymentPayload {
  x402Version: typeof X402_VERSION
  resource: Record<string, unknown>
  accepted: Record<string, unknown>
  payload: {
    from: string
    outsideExecution: {
      typedData: OutsideExecutionTypedData
      signature: string[]
    }
  }
}

/** Human-readable account of what was signed. Addresses are 0x + 64 hex digits. */
export interface PaymentSummary {
  network: StarknetNetwork
  acceptIndex: number
  resourceUrl: string
  asset: string
  payTo: string
  /** Exact amount in the token's atomic units, base 10. */
  amount: string
  /** The only address that can execute the authorization (SNIP-9 `Caller`). */
  feePayer: string
  payer: string
  nonce: string
  validAfter: number
  /** Unix seconds; the authorization cannot execute at or after this time. */
  validUntil: number
  validUntilIso: string
}

export interface SignedStarknetPayment {
  /** Value for the `PAYMENT-SIGNATURE` request header (standard base64). */
  headerValue: string
  paymentPayload: ExactStarknetPaymentPayload
  summary: PaymentSummary
}

export interface PrepareOptions {
  /** `PAYMENT-REQUIRED` response header value. */
  paymentRequiredHeader: string
  /** Network the payer account lives on. Only `exact` entries on it are eligible. */
  network: StarknetNetwork
  /** Payer account address (`payload.from`). */
  accountAddress: string
  /** Pay this `accepts` entry instead of the first eligible one. */
  acceptIndex?: number
  /** Largest `maxTimeoutSeconds` to sign for (default 3600, at most 86400). */
  maxTimeoutSecondsCap?: number
}

export type SignOptions = { privateKey: string; signer?: never } | { signer: PaymentSigner; privateKey?: never }

/** Test seams. Not exported from the package entry point. */
export interface SigningHooks {
  now?: () => number
  nonce?: () => string
  /** Runs between building and checking the document; tests use it to tamper. */
  afterBuild?: (typedData: OutsideExecutionTypedData) => void
}

// ── Prepare ─────────────────────────────────────────────────────────────────

/**
 * Decode `PAYMENT-REQUIRED`, select the entry to pay and validate it. Nothing is
 * signed. Callers that enforce a spending policy check the returned requirements
 * and then pass the same object to {@link signPreparedStarknetPayment}.
 */
export function prepareStarknetPayment(options: PrepareOptions): PreparedStarknetPayment {
  if (!isStarknetAddress(options.accountAddress)) {
    throw new X402PaymentError("invalid_arguments", "accountAddress is not a valid Starknet address")
  }
  const maxTimeoutSecondsCap = resolveMaxTimeoutSecondsCap(options.maxTimeoutSecondsCap)
  const paymentRequired = decodePaymentRequiredHeader(options.paymentRequiredHeader)
  const selected = selectPaymentRequirements(paymentRequired, {
    network: options.network,
    acceptIndex: options.acceptIndex,
    payer: options.accountAddress,
    maxTimeoutSecondsCap,
  })
  return deepFreeze({
    x402Version: X402_VERSION,
    acceptIndex: selected.acceptIndex,
    payer: toFeltHex(options.accountAddress),
    maxTimeoutSecondsCap,
    requirements: selected.requirements,
    accepted: selected.accepted,
    resource: paymentRequired.resource,
  })
}

// ── Sign ────────────────────────────────────────────────────────────────────

function freshNonce(): string {
  // 248 random bits: always a field element, never zero in practice (checked anyway).
  for (;;) {
    const n = BigInt(`0x${randomBytes(31).toString("hex")}`)
    if (n !== 0n) return toFeltHex(n)
  }
}

function encodeSignature(raw: Signature): string[] {
  // stark.formatSignature turns starknet.js's { r, s } object into hex felts [r, s]
  // (the BigInt fix from #618) and hex-normalizes array signatures.
  let felts: string[]
  try {
    felts = stark.formatSignature(raw)
  } catch {
    throw new X402PaymentError("invalid_signature", "signer returned a signature that is neither { r, s } nor a felt array")
  }
  if (felts.length === 0 || felts.length > MAX_SIGNATURE_FELTS) {
    throw new X402PaymentError("invalid_signature", `signature has ${felts.length} felts; expected 1 to ${MAX_SIGNATURE_FELTS}`)
  }
  for (const felt of felts) {
    if (typeof felt !== "string" || !/^0x[0-9a-f]{1,64}$/.test(felt) || BigInt(felt) >= STARK_PRIME) {
      throw new X402PaymentError("invalid_signature", "signature element is not a field element")
    }
  }
  return felts
}

function parsePrivateKey(privateKey: unknown): string {
  if (typeof privateKey !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(privateKey)) {
    throw new X402PaymentError("invalid_arguments", "privateKey must be a 0x-prefixed hex string")
  }
  const k = BigInt(privateKey)
  if (k === 0n || k >= STARK_CURVE_ORDER) {
    throw new X402PaymentError("invalid_arguments", "privateKey is out of range")
  }
  return privateKey
}

/** Re-derive the requirements from the echoed entry so `accepted` and the signed values cannot diverge. */
function revalidatePrepared(prepared: PreparedStarknetPayment): ExactStarknetRequirements {
  if (!prepared || prepared.x402Version !== X402_VERSION || !isStarknetAddress(prepared.payer)) {
    throw new X402PaymentError("invalid_arguments", "not a prepared Starknet payment")
  }
  const fresh = parseExactStarknetRequirements(
    prepared.accepted,
    { payer: prepared.payer, maxTimeoutSecondsCap: prepared.maxTimeoutSecondsCap },
    `accepts[${prepared.acceptIndex}]`,
  )
  const given = prepared.requirements
  if (!given || typeof given !== "object") {
    throw new X402PaymentError("invalid_arguments", "not a prepared Starknet payment")
  }
  const same =
    fresh.network === given.network &&
    fresh.asset === given.asset &&
    fresh.payTo === given.payTo &&
    fresh.amount === given.amount &&
    fresh.maxTimeoutSeconds === given.maxTimeoutSeconds &&
    fresh.feePayer === given.feePayer
  if (!same) {
    throw new X402PaymentError("invalid_arguments", "prepared payment requirements do not match its accepted entry")
  }
  return fresh
}

/**
 * Build, check and sign the payment prepared by {@link prepareStarknetPayment}.
 *
 * The SNIP-9 `OutsideExecution` is built here from the validated requirements
 * alone; no typed data or calldata from the server is used. The document is
 * frozen, checked against the payment intent, and only then signed. With a
 * private key, the signature is also verified against the key over that exact
 * document before it is returned.
 */
export async function signPreparedStarknetPayment(
  prepared: PreparedStarknetPayment,
  options: SignOptions,
): Promise<SignedStarknetPayment> {
  return signPreparedStarknetPaymentWithHooks(prepared, options, {})
}

export async function signPreparedStarknetPaymentWithHooks(
  prepared: PreparedStarknetPayment,
  options: SignOptions,
  hooks: SigningHooks,
): Promise<SignedStarknetPayment> {
  if (!options || typeof options !== "object") {
    throw new X402PaymentError("invalid_arguments", "a privateKey or a signer is required")
  }
  const requirements = revalidatePrepared(prepared)
  const privateKey = options.privateKey !== undefined ? parsePrivateKey(options.privateKey) : undefined
  const signer: PaymentSigner | undefined = privateKey ? new Signer(privateKey) : options.signer
  if (!signer || typeof signer.signMessage !== "function") {
    throw new X402PaymentError("invalid_arguments", "a privateKey or a signer is required")
  }

  const nowSeconds = hooks.now ? hooks.now() : Math.floor(Date.now() / 1000)
  const nonce = hooks.nonce ? hooks.nonce() : freshNonce()
  const executeBefore = BigInt(nowSeconds) + BigInt(requirements.maxTimeoutSeconds)

  const intent: PaymentIntent = {
    network: requirements.network,
    payer: prepared.payer,
    asset: requirements.asset,
    payTo: requirements.payTo,
    amount: requirements.amount,
    feePayer: requirements.feePayer,
    nowSeconds,
    maxTimeoutSeconds: requirements.maxTimeoutSeconds,
    nonce,
  }

  const built = buildOutsideExecutionTypedData({
    network: requirements.network,
    caller: requirements.feePayer,
    nonce,
    executeAfter: EXECUTE_AFTER,
    executeBefore,
    asset: requirements.asset,
    payTo: requirements.payTo,
    amount: requirements.amount,
  })
  hooks.afterBuild?.(built)

  // Plain-data copy, frozen: what is checked is what is signed and what is sent.
  const typedData = deepFreeze(JSON.parse(JSON.stringify(built)) as OutsideExecutionTypedData)
  assertTypedDataMatchesIntent(typedData, intent)

  const signature = encodeSignature(await signer.signMessage(typedData, prepared.payer))

  if (privateKey) {
    const messageHash = snip12.getMessageHash(typedData, prepared.payer)
    const [r, s] = signature.map((felt) => BigInt(felt))
    const verified =
      signature.length === 2 &&
      ec.starkCurve.verify(new ec.starkCurve.Signature(r, s), messageHash, ec.starkCurve.getPublicKey(privateKey, false))
    if (!verified) {
      throw new X402PaymentError("invalid_signature", "signature does not verify for the checked payment document")
    }
  }

  const paymentPayload: ExactStarknetPaymentPayload = {
    x402Version: X402_VERSION,
    resource: JSON.parse(JSON.stringify(prepared.resource)) as Record<string, unknown>,
    accepted: JSON.parse(JSON.stringify(prepared.accepted)) as Record<string, unknown>,
    payload: {
      from: toPaddedAddress(prepared.payer),
      outsideExecution: { typedData, signature },
    },
  }

  const validUntil = Number(executeBefore)
  const summary: PaymentSummary = {
    network: requirements.network,
    acceptIndex: prepared.acceptIndex,
    resourceUrl: String(prepared.resource.url),
    asset: toPaddedAddress(requirements.asset),
    payTo: toPaddedAddress(requirements.payTo),
    amount: requirements.amount.toString(),
    feePayer: toPaddedAddress(requirements.feePayer),
    payer: toPaddedAddress(prepared.payer),
    nonce: typedData.message.Nonce,
    validAfter: Number(EXECUTE_AFTER),
    validUntil,
    validUntilIso: new Date(validUntil * 1000).toISOString(),
  }

  return { headerValue: encodeBase64Json(paymentPayload), paymentPayload, summary }
}

// ── One shot ────────────────────────────────────────────────────────────────

export type CreatePaymentSignatureArgs = PrepareOptions & SignOptions

const REMOVED_ARGUMENTS = ["paymentRequired", "typedData", "rpcUrl"] as const

/**
 * Build and sign the `PAYMENT-SIGNATURE` header for a `PAYMENT-REQUIRED` header,
 * per the x402 `exact` scheme on Starknet. Equivalent to
 * {@link prepareStarknetPayment} followed by {@link signPreparedStarknetPayment};
 * use those two directly to enforce a spending policy in between.
 */
export async function createStarknetPaymentSignatureHeader(
  args: CreatePaymentSignatureArgs,
): Promise<SignedStarknetPayment> {
  if (typeof args !== "object" || args === null) {
    throw new X402PaymentError("invalid_arguments", "arguments object is required")
  }
  // The pre-#554 API signed a server-supplied typedData. Refuse its arguments loudly
  // instead of ignoring them, so an old call site cannot appear to work.
  for (const key of REMOVED_ARGUMENTS) {
    if (key in args) {
      throw new X402PaymentError(
        "invalid_arguments",
        `"${key}" is no longer accepted: the client builds the payment from the PAYMENT-REQUIRED header itself and never signs server-supplied typed data`,
      )
    }
  }
  const prepared = prepareStarknetPayment(args)
  const signOptions: SignOptions =
    args.privateKey !== undefined ? { privateKey: args.privateKey } : { signer: args.signer as PaymentSigner }
  return signPreparedStarknetPayment(prepared, signOptions)
}

/**
 * Decode a `PAYMENT-SIGNATURE` header back to JSON, for inspection and tests.
 * This does not verify anything about the payment.
 */
export function decodePaymentSignatureHeader(header: string): unknown {
  return decodeBase64Json(header, "PAYMENT-SIGNATURE")
}
