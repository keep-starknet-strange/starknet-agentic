import {
  ADDR_BOUND,
  ANY_CALLER,
  EXECUTE_AFTER,
  SNIP12_REVISION,
  SNIP9_DOMAIN_NAME,
  SNIP9_DOMAIN_VERSION,
  STARK_PRIME,
  STARKNET_NETWORKS,
  TRANSFER_SELECTOR,
  U128_MAX,
  type StarknetNetwork,
} from "./constants.js"
import { X402PaymentError } from "./errors.js"
import { OUTSIDE_EXECUTION_TYPES } from "./typedData.js"

/**
 * What the payer means to authorize. Built from the validated requirements and
 * the signing context, never from anything the builder produced.
 */
export interface PaymentIntent {
  network: StarknetNetwork
  /** The payer account (`payload.from`). */
  payer: string
  asset: string
  payTo: string
  amount: bigint
  /** `extra.feePayer`, the only address allowed to execute the authorization. */
  feePayer: string
  /** Unix seconds at which the client fixed the time bounds. */
  nowSeconds: number
  maxTimeoutSeconds: number
  /** The fresh SNIP-9 nonce chosen for this payment. */
  nonce: string
}

// Lowercase hex without leading zeros: the only felt form this package emits.
// Requiring it means no value can be read differently by two SNIP-12 encoders
// (a decimal string, a short string, or a selector name instead of its felt).
const CANONICAL_FELT = /^0x(0|[1-9a-f][0-9a-f]{0,63})$/

function fail(detail: string): never {
  throw new X402PaymentError("intent_mismatch", `Refusing to sign: ${detail}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expectExactKeys(value: unknown, keys: readonly string[], where: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`${where} is not an object`)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || !keys.every((k) => Object.prototype.hasOwnProperty.call(value, k))) {
    fail(`${where} must have exactly the keys ${keys.join(", ")} (has ${actual.join(", ")})`)
  }
  return value
}

function expectFelt(value: unknown, where: string): bigint {
  if (typeof value !== "string" || !CANONICAL_FELT.test(value)) {
    fail(`${where} is not a canonical hex felt`)
  }
  const n = BigInt(value)
  if (n >= STARK_PRIME) fail(`${where} is not a field element`)
  return n
}

function expectFeltEquals(value: unknown, expected: string | bigint, where: string): void {
  if (expectFelt(value, where) !== BigInt(expected)) {
    fail(`${where} is ${String(value)}, expected ${String(expected)}`)
  }
}

/**
 * The signer-side intent check the spec requires before signing: the document
 * must be exactly one SNIP-9 v2 `OutsideExecution` whose only `Call` is
 * `transfer(payTo, amount)` on `asset`, with `Caller = feePayer`, the intended
 * nonce, and time bounds per the Timeout Mapping. Any other content, any extra
 * key, or any non-canonical encoding is refused. Throws `intent_mismatch`.
 */
export function assertTypedDataMatchesIntent(typedData: unknown, intent: PaymentIntent): void {
  // Sanity of the intent itself.
  if (!(intent.network in STARKNET_NETWORKS)) fail(`unsupported network ${String(intent.network)}`)
  for (const [name, value] of [
    ["payer", intent.payer],
    ["asset", intent.asset],
    ["payTo", intent.payTo],
    ["feePayer", intent.feePayer],
  ] as const) {
    let n: bigint
    try {
      n = BigInt(value)
    } catch {
      fail(`intent ${name} is not an address`)
    }
    if (n <= 0n || n >= ADDR_BOUND) fail(`intent ${name} is not an address`)
  }
  if (BigInt(intent.feePayer) === BigInt(ANY_CALLER)) fail("feePayer is the ANY_CALLER sentinel")
  if (BigInt(intent.feePayer) === BigInt(intent.payer)) fail("feePayer is the payer account")
  if (intent.amount <= 0n || intent.amount >> 256n !== 0n) fail("amount is not a positive u256")
  if (!Number.isSafeInteger(intent.nowSeconds) || intent.nowSeconds <= Number(EXECUTE_AFTER)) {
    fail("signing clock is not a valid Unix time")
  }
  if (!Number.isSafeInteger(intent.maxTimeoutSeconds) || intent.maxTimeoutSeconds < 1) {
    fail("maxTimeoutSeconds is not a positive integer")
  }

  // Document shape: nothing but the four SNIP-12 members.
  const doc = expectExactKeys(typedData, ["types", "primaryType", "domain", "message"], "typed data")
  if (doc.primaryType !== "OutsideExecution") fail(`primaryType is ${String(doc.primaryType)}`)
  if (JSON.stringify(doc.types) !== JSON.stringify(OUTSIDE_EXECUTION_TYPES)) {
    fail("types are not the SNIP-9 v2 OutsideExecution types")
  }

  // Domain: SNIP-9 v2, SNIP-12 revision 1, on the payer's chain.
  const domain = expectExactKeys(doc.domain, ["name", "version", "chainId", "revision"], "domain")
  if (domain.name !== SNIP9_DOMAIN_NAME) fail(`domain.name is ${String(domain.name)}`)
  if (domain.version !== SNIP9_DOMAIN_VERSION) fail(`domain.version is ${String(domain.version)}`)
  if (domain.revision !== SNIP12_REVISION) fail(`domain.revision is ${String(domain.revision)}`)
  expectFeltEquals(domain.chainId, STARKNET_NETWORKS[intent.network], "domain.chainId")

  // Message.
  const message = expectExactKeys(
    doc.message,
    ["Caller", "Nonce", "Execute After", "Execute Before", "Calls"],
    "message",
  )
  expectFeltEquals(message.Caller, intent.feePayer, "message.Caller")
  const nonce = expectFelt(message.Nonce, "message.Nonce")
  if (nonce === 0n) fail("message.Nonce is zero")
  expectFeltEquals(message.Nonce, intent.nonce, "message.Nonce")

  const executeAfter = expectFelt(message["Execute After"], "message.Execute After")
  const executeBefore = expectFelt(message["Execute Before"], "message.Execute Before")
  if (executeAfter > U128_MAX || executeBefore > U128_MAX) fail("time bounds do not fit in u128")
  if (executeAfter !== EXECUTE_AFTER) fail(`message.Execute After is ${executeAfter}, expected ${EXECUTE_AFTER}`)
  const expectedBefore = BigInt(intent.nowSeconds) + BigInt(intent.maxTimeoutSeconds)
  if (executeBefore !== expectedBefore) {
    fail(`message.Execute Before is ${executeBefore}, expected now + maxTimeoutSeconds = ${expectedBefore}`)
  }

  // Exactly one call: transfer(payTo, amount_low, amount_high) on asset.
  const calls = message.Calls
  if (!Array.isArray(calls) || calls.length !== 1) {
    fail(`message.Calls must contain exactly one call (has ${Array.isArray(calls) ? calls.length : "none"})`)
  }
  const call = expectExactKeys(calls[0], ["To", "Selector", "Calldata"], "message.Calls[0]")
  expectFeltEquals(call.To, intent.asset, "Calls[0].To")
  expectFeltEquals(call.Selector, TRANSFER_SELECTOR, "Calls[0].Selector")
  const calldata = call.Calldata
  if (!Array.isArray(calldata) || calldata.length !== 3) {
    fail("Calls[0].Calldata must be exactly [recipient, amount_low, amount_high]")
  }
  expectFeltEquals(calldata[0], intent.payTo, "Calls[0].Calldata[0] (recipient)")
  const low = expectFelt(calldata[1], "Calls[0].Calldata[1] (amount_low)")
  const high = expectFelt(calldata[2], "Calls[0].Calldata[2] (amount_high)")
  if (low > U128_MAX || high > U128_MAX) fail("amount limbs do not fit in u128")
  if (low + (high << 128n) !== intent.amount) {
    fail(`transfer amount is ${low + (high << 128n)}, expected exactly ${intent.amount}`)
  }
}
