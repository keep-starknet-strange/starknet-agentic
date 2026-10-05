import { z } from "zod"
import {
  ADDR_BOUND,
  ANY_CALLER,
  DEFAULT_MAX_TIMEOUT_SECONDS_CAP,
  EXACT_SCHEME,
  MAX_ACCEPTS,
  MAX_TIMEOUT_SECONDS_CAP_LIMIT,
  STARKNET_NETWORKS,
  STARKNET_NETWORK_IDS,
  U256_MAX,
  X402_VERSION,
  type StarknetNetwork,
} from "./constants.js"
import { decodeBase64Json } from "./base64.js"
import { X402PaymentError } from "./errors.js"

// ── Primitive grammars ──────────────────────────────────────────────────────

const HEX_FELT = /^0x[0-9a-fA-F]{1,64}$/
// Base-10 only: no sign, whitespace, hex/octal/binary prefix or leading zeros.
const BASE10_UINT = /^(0|[1-9][0-9]*)$/

/** Whether `value` is a 0x-prefixed hex string naming a non-zero contract address. */
export function isStarknetAddress(value: unknown): value is string {
  if (typeof value !== "string" || !HEX_FELT.test(value)) return false
  const n = BigInt(value)
  return n > 0n && n < ADDR_BOUND
}

/** Numeric felt equality; addresses have no canonical padding or case. */
export function feltEquals(a: string | bigint, b: string | bigint): boolean {
  try {
    return BigInt(a) === BigInt(b)
  } catch {
    return false
  }
}

/** Canonical lowercase hex without leading zeros, the form this package emits for felts. */
export function toFeltHex(value: string | bigint): string {
  return `0x${BigInt(value).toString(16)}`
}

/** 0x + 64 lowercase hex digits, the usual display form of an address. */
export function toPaddedAddress(value: string | bigint): string {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`
}

const addressSchema = z
  .string()
  .regex(HEX_FELT, "must be a 0x-prefixed hex felt")
  .refine((v) => isStarknetAddress(v), "must be a non-zero Starknet address below 2^251 - 256")

// Refinements can run after a failed regex check, so they re-test the grammar
// before calling BigInt.
const isBase10Uint = (v: string): boolean => v.length <= 78 && BASE10_UINT.test(v)

const amountSchema = z
  .string()
  .max(78, "is too long for a u256")
  .regex(BASE10_UINT, "must be a base-10 integer string (no sign, whitespace, prefix or leading zeros)")
  .refine((v) => !isBase10Uint(v) || BigInt(v) > 0n, "must be greater than zero")
  .refine((v) => !isBase10Uint(v) || BigInt(v) <= U256_MAX, "must fit in a u256")

/**
 * A Starknet `exact` entry of `accepts`, validated field by field. Keys not named
 * here are not read (they are only echoed back in `accepted`, which is not signed).
 */
const exactStarknetRequirementsSchema = z.object({
  scheme: z.literal(EXACT_SCHEME),
  network: z.enum(STARKNET_NETWORK_IDS as [StarknetNetwork, ...StarknetNetwork[]]),
  amount: amountSchema,
  asset: addressSchema,
  payTo: addressSchema,
  maxTimeoutSeconds: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  extra: z.object({
    feePayer: addressSchema,
    // Reserved keys (core spec 6.1); the scheme fixes their only legal values.
    assetTransferMethod: z.literal("default").optional(),
    paymentFlow: z.literal("authorization").optional(),
  }),
})

const paymentRequiredSchema = z.object({
  x402Version: z.literal(X402_VERSION),
  error: z.string().optional(),
  resource: z.object({ url: z.string().min(1) }),
  accepts: z
    .array(z.object({ scheme: z.string(), network: z.string() }))
    .min(1)
    .max(MAX_ACCEPTS),
})

function describeIssues(error: z.ZodError, prefix: string): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? `${prefix}.${issue.path.join(".")}` : prefix
      return `${path} ${issue.message}`
    })
    .join("; ")
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Deep copy of plain JSON data (drops anything JSON cannot carry). */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

// ── Types ───────────────────────────────────────────────────────────────────

/** A decoded and shape-checked `PaymentRequired` document. */
export interface DecodedPaymentRequired {
  x402Version: typeof X402_VERSION
  /** The `resource` object exactly as the server sent it (echoed back, never signed). */
  resource: Record<string, unknown>
  /** The `accepts` entries exactly as the server sent them (each echoed back as `accepted`). */
  accepts: Record<string, unknown>[]
}

/**
 * The fields of one Starknet `exact` requirement this client acts on, normalized.
 * Addresses are canonical hex felts; `amount` is exact.
 */
export interface ExactStarknetRequirements {
  scheme: typeof EXACT_SCHEME
  network: StarknetNetwork
  asset: string
  payTo: string
  amount: bigint
  maxTimeoutSeconds: number
  feePayer: string
}

export interface SelectedRequirements {
  /** Index of the chosen entry in `accepts`. */
  acceptIndex: number
  requirements: ExactStarknetRequirements
  /** The chosen entry verbatim, for the `accepted` field of the payment payload. */
  accepted: Record<string, unknown>
}

// ── Decoding ────────────────────────────────────────────────────────────────

/**
 * Decode a `PAYMENT-REQUIRED` header (standard base64 of a v2 `PaymentRequired`).
 * Only the envelope is checked here; the entry that will be paid is validated in
 * full by {@link selectPaymentRequirements}. Unknown keys, including any `typedData`
 * a server might add, are never read.
 */
export function decodePaymentRequiredHeader(header: unknown): DecodedPaymentRequired {
  const raw = decodeBase64Json(header, "PAYMENT-REQUIRED")
  const parsed = paymentRequiredSchema.safeParse(raw)
  if (!parsed.success) {
    throw new X402PaymentError(
      "invalid_payment_required",
      `PAYMENT-REQUIRED is not a valid x402 v2 PaymentRequired: ${describeIssues(parsed.error, "paymentRequired")}`,
    )
  }
  const doc = raw as Record<string, unknown>
  const resource = doc.resource
  const accepts = doc.accepts as unknown[]
  if (!isPlainObject(resource) || !accepts.every(isPlainObject)) {
    throw new X402PaymentError("invalid_payment_required", "PAYMENT-REQUIRED resource and accepts entries must be objects")
  }
  return {
    x402Version: X402_VERSION,
    resource: cloneJson(resource),
    accepts: accepts.map((entry) => cloneJson(entry as Record<string, unknown>)),
  }
}

// ── Validation of one requirement ───────────────────────────────────────────

export interface RequirementsPolicy {
  /** The payer's account address; `extra.feePayer` must differ from it. */
  payer: string
  /** Largest `maxTimeoutSeconds` accepted. Defaults to {@link DEFAULT_MAX_TIMEOUT_SECONDS_CAP}. */
  maxTimeoutSecondsCap?: number
}

export function resolveMaxTimeoutSecondsCap(cap: number | undefined): number {
  const resolved = cap ?? DEFAULT_MAX_TIMEOUT_SECONDS_CAP
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > MAX_TIMEOUT_SECONDS_CAP_LIMIT) {
    throw new X402PaymentError(
      "invalid_arguments",
      `maxTimeoutSecondsCap must be an integer between 1 and ${MAX_TIMEOUT_SECONDS_CAP_LIMIT}`,
    )
  }
  return resolved
}

/**
 * Validate one `accepts` entry as a Starknet `exact` requirement this client may
 * sign for, and normalize it. Throws `invalid_payment_requirements` otherwise.
 */
export function parseExactStarknetRequirements(
  entry: unknown,
  policy: RequirementsPolicy,
  label = "requirements",
): ExactStarknetRequirements {
  const parsed = exactStarknetRequirementsSchema.safeParse(entry)
  if (!parsed.success) {
    throw new X402PaymentError(
      "invalid_payment_requirements",
      `${label} is not a valid Starknet exact requirement: ${describeIssues(parsed.error, label)}`,
    )
  }
  const r = parsed.data
  const cap = resolveMaxTimeoutSecondsCap(policy.maxTimeoutSecondsCap)
  if (r.maxTimeoutSeconds > cap) {
    throw new X402PaymentError(
      "invalid_payment_requirements",
      `${label}.maxTimeoutSeconds is ${r.maxTimeoutSeconds}; this client signs authorizations valid for at most ${cap} seconds`,
    )
  }
  if (!isStarknetAddress(policy.payer)) {
    throw new X402PaymentError("invalid_arguments", "payer account address is not a valid Starknet address")
  }
  if (feltEquals(r.extra.feePayer, ANY_CALLER)) {
    throw new X402PaymentError(
      "invalid_payment_requirements",
      `${label}.extra.feePayer is the SNIP-9 ANY_CALLER sentinel; refusing to sign a bearer authorization`,
    )
  }
  if (feltEquals(r.extra.feePayer, policy.payer)) {
    throw new X402PaymentError("invalid_payment_requirements", `${label}.extra.feePayer must not be the payer account`)
  }
  return {
    scheme: EXACT_SCHEME,
    network: r.network,
    asset: toFeltHex(r.asset),
    payTo: toFeltHex(r.payTo),
    amount: BigInt(r.amount),
    maxTimeoutSeconds: r.maxTimeoutSeconds,
    feePayer: toFeltHex(r.extra.feePayer),
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

export interface SelectionOptions extends RequirementsPolicy {
  /** The network the payer account lives on. Only entries for it are eligible. */
  network: StarknetNetwork
  /**
   * Pay this `accepts` entry. Without it, the first entry (in server order) with
   * `scheme: "exact"` on `network` is used, which is what the x402 reference
   * client's default selector does.
   */
  acceptIndex?: number
}

function describeOffers(accepts: Record<string, unknown>[]): string {
  const offers = accepts
    .slice(0, 8)
    .map((entry, i) => `[${i}] ${String(entry.scheme)} on ${String(entry.network)}`)
  if (accepts.length > 8) offers.push(`... ${accepts.length - 8} more`)
  return offers.join(", ")
}

/**
 * Choose the `accepts` entry to pay and validate it in full. Deterministic: an
 * explicit `acceptIndex`, otherwise the first `exact` entry on the payer's network.
 * The chosen entry must be valid; this never falls through to a later entry.
 */
export function selectPaymentRequirements(
  paymentRequired: DecodedPaymentRequired,
  options: SelectionOptions,
): SelectedRequirements {
  if (!(options.network in STARKNET_NETWORKS)) {
    throw new X402PaymentError("invalid_arguments", `Unsupported Starknet network: ${String(options.network)}`)
  }
  const { accepts } = paymentRequired

  let acceptIndex: number
  if (options.acceptIndex !== undefined) {
    if (!Number.isSafeInteger(options.acceptIndex) || options.acceptIndex < 0 || options.acceptIndex >= accepts.length) {
      throw new X402PaymentError(
        "invalid_arguments",
        `acceptIndex ${String(options.acceptIndex)} is out of range; PAYMENT-REQUIRED has ${accepts.length} accepts entries`,
      )
    }
    acceptIndex = options.acceptIndex
    const entry = accepts[acceptIndex]
    if (entry.scheme !== EXACT_SCHEME || entry.network !== options.network) {
      throw new X402PaymentError(
        "no_matching_requirements",
        `accepts[${acceptIndex}] is ${String(entry.scheme)} on ${String(entry.network)}; this signer pays exact on ${options.network}`,
      )
    }
  } else {
    acceptIndex = accepts.findIndex((entry) => entry.scheme === EXACT_SCHEME && entry.network === options.network)
    if (acceptIndex === -1) {
      throw new X402PaymentError(
        "no_matching_requirements",
        `PAYMENT-REQUIRED offers no exact payment on ${options.network} (offers: ${describeOffers(accepts)})`,
      )
    }
  }

  const accepted = accepts[acceptIndex]
  const requirements = parseExactStarknetRequirements(accepted, options, `accepts[${acceptIndex}]`)
  return { acceptIndex, requirements, accepted: cloneJson(accepted) }
}

/** Map a `starknet_chainId` value (hex felt or bigint) to its CAIP-2 network. */
export function networkForChainId(chainId: string | bigint): StarknetNetwork {
  for (const network of STARKNET_NETWORK_IDS) {
    if (feltEquals(chainId, STARKNET_NETWORKS[network])) return network
  }
  throw new X402PaymentError("invalid_arguments", `Chain id ${String(chainId)} is not a supported Starknet network`)
}
