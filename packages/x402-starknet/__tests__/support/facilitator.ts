// An independent stand-in for a conformant facilitator's /verify, written from the
// spec text (scheme_exact_starknet.md, "Facilitator Verification Rules") and sharing
// no code with src/. It never hashes the received typedData: it parses domain.chainId
// and the five message fields, rebuilds the canonical SNIP-9 v2 document from them
// (rule 2), and checks the signature over that rebuild. The account's on-chain
// is_valid_signature is replaced by a STARK ECDSA check against the payer's known
// public key, which is what a standard single-key account does.

import { ec, hash, num, shortString, typedData as snip12, type TypedData } from "starknet"

const SKEW_MARGIN = 60
const MIN_SETTLE_MARGIN = 30
const U128 = 1n << 128n
const TRANSFER_SELECTOR = BigInt(hash.getSelectorFromName("transfer"))
const ANY_CALLER = BigInt(shortString.encodeShortString("ANY_CALLER"))
const CHAIN_IDS: Record<string, bigint> = {
  "starknet:SN_MAIN": BigInt(shortString.encodeShortString("SN_MAIN")),
  "starknet:SN_SEPOLIA": BigInt(shortString.encodeShortString("SN_SEPOLIA")),
}

type Json = Record<string, unknown>

export type Verdict = { isValid: true; payer: string } | { isValid: false; invalidReason: string; detail?: string }

function exactKeys(value: unknown, keys: string[]): value is Json {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((k) => k in value)
}

function felt(value: unknown): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === "string" && /^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(value)) return BigInt(value)
  throw new Error(`not a felt: ${String(value)}`)
}

function chainIdFelt(value: unknown): bigint {
  if (typeof value !== "string") throw new Error("chainId")
  if (/^0x[0-9a-fA-F]+$/.test(value) || /^[0-9]+$/.test(value)) return BigInt(value)
  return BigInt(shortString.encodeShortString(value))
}

/** Rule 2: the canonical SNIP-9 v2 typed data, rebuilt from parsed values only. */
export function rebuildCanonicalTypedData(chainId: bigint, message: Json): TypedData {
  const calls = message.Calls as Json[]
  return {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      OutsideExecution: [
        { name: "Caller", type: "ContractAddress" },
        { name: "Nonce", type: "felt" },
        { name: "Execute After", type: "u128" },
        { name: "Execute Before", type: "u128" },
        { name: "Calls", type: "Call*" },
      ],
      Call: [
        { name: "To", type: "ContractAddress" },
        { name: "Selector", type: "selector" },
        { name: "Calldata", type: "felt*" },
      ],
    },
    primaryType: "OutsideExecution",
    domain: { name: "Account.execute_from_outside", version: "2", chainId: num.toHex(chainId), revision: "1" },
    message: {
      Caller: num.toHex(felt(message.Caller)),
      Nonce: num.toHex(felt(message.Nonce)),
      "Execute After": num.toHex(felt(message["Execute After"])),
      "Execute Before": num.toHex(felt(message["Execute Before"])),
      Calls: calls.map((c) => ({
        To: num.toHex(felt(c.To)),
        Selector: num.toHex(felt(c.Selector)),
        Calldata: (c.Calldata as unknown[]).map((v) => num.toHex(felt(v))),
      })),
    },
  }
}

/**
 * Verify a decoded PAYMENT-SIGNATURE payload against the server's own requirements.
 * `publicKey` stands in for the payer account's is_valid_signature.
 */
export function facilitatorVerify(
  paymentPayload: unknown,
  serverRequirements: Json,
  publicKey: Uint8Array,
  nowSeconds: number,
): Verdict {
  const bad = (invalidReason: string, detail?: string): Verdict => ({ isValid: false, invalidReason, detail })
  try {
    const p = paymentPayload as Json
    // Rule 1: version, scheme, network, and accepted == the server's requirements.
    if (p.x402Version !== 2) return bad("invalid_x402_version")
    const accepted = p.accepted as Json
    if (accepted.scheme !== "exact") return bad("invalid_scheme")
    if (!(String(accepted.network) in CHAIN_IDS)) return bad("invalid_network")
    for (const key of ["scheme", "network", "amount", "asset", "payTo", "maxTimeoutSeconds"]) {
      if (JSON.stringify(accepted[key]) !== JSON.stringify(serverRequirements[key])) return bad("invalid_payload", key)
    }
    const feePayer = felt((serverRequirements.extra as Json).feePayer)
    if (felt((accepted.extra as Json).feePayer) !== feePayer) return bad("invalid_payload", "feePayer")
    const maxTimeoutSeconds = serverRequirements.maxTimeoutSeconds as number

    const inner = p.payload as Json
    const from = felt(inner.from)
    if (feePayer === 0n || feePayer === ANY_CALLER || feePayer === from) return bad("invalid_payment_requirements")
    const oe = inner.outsideExecution as Json
    const signature = oe.signature as unknown[]
    if (!Array.isArray(signature) || signature.length === 0 || signature.length > 32) return bad("invalid_payload", "signature")
    if (!signature.every((s) => typeof s === "string" && /^0x[0-9a-fA-F]+$/.test(s))) {
      return bad("invalid_payload", "signature must be hex felts")
    }

    // Rule 2: parse, reject unknown/missing keys, rebuild.
    const td = oe.typedData as Json
    if (td.primaryType !== "OutsideExecution") return bad("invalid_payload", "primaryType")
    if (!exactKeys(td.domain, ["name", "version", "chainId", "revision"])) return bad("invalid_payload", "domain keys")
    const domain = td.domain as Json
    if (domain.name !== "Account.execute_from_outside" || String(domain.version) !== "2" || String(domain.revision) !== "1") {
      return bad("invalid_payload", "domain")
    }
    const chainId = chainIdFelt(domain.chainId)
    if (chainId !== CHAIN_IDS[String(accepted.network)]) return bad("invalid_payload", "chainId")
    if (!exactKeys(td.message, ["Caller", "Nonce", "Execute After", "Execute Before", "Calls"])) {
      return bad("invalid_payload", "message keys")
    }
    const message = td.message as Json
    const calls = message.Calls
    if (!Array.isArray(calls) || calls.length !== 1) return bad("invalid_payload", "calls")
    if (!exactKeys(calls[0], ["To", "Selector", "Calldata"])) return bad("invalid_payload", "call keys")
    const rebuilt = rebuildCanonicalTypedData(chainId, message)

    // Rule 3: signature over the rebuilt document (both hash implementations must agree).
    const messageHash = snip12.getMessageHash(rebuilt, num.toHex(from))
    if (BigInt(messageHash) !== manualSnip12MessageHash(rebuilt, from)) return bad("unexpected_verify_error", "hash mismatch")
    const [r, s] = signature.map((v) => BigInt(v as string))
    if (signature.length !== 2 || !ec.starkCurve.verify(new ec.starkCurve.Signature(r, s), messageHash, publicKey)) {
      return bad("invalid_exact_starknet_payload_signature")
    }

    // Rule 4: caller binding.
    const m = rebuilt.message as Json
    if (felt(m.Caller) !== feePayer) return bad("invalid_exact_starknet_payload_caller")

    // Rule 5: time window.
    const after = felt(m["Execute After"])
    const before = felt(m["Execute Before"])
    const now = BigInt(nowSeconds)
    if (after >= now - BigInt(SKEW_MARGIN)) return bad("invalid_payload", "execute after")
    if (before < now + BigInt(maxTimeoutSeconds) - BigInt(SKEW_MARGIN)) return bad("outside_execution_expired")
    if (before > now + BigInt(maxTimeoutSeconds) + BigInt(SKEW_MARGIN)) return bad("outside_execution_window_exceeds_max_timeout")
    if (before <= now + BigInt(MIN_SETTLE_MARGIN)) return bad("outside_execution_expired")

    // Rule 7: exactly one transfer of exactly `amount` of `asset` to `payTo`.
    const call = (m.Calls as Json[])[0]
    if (felt(call.To) !== felt(accepted.asset)) return bad("invalid_exact_starknet_payload_asset_mismatch")
    if (felt(call.Selector) !== TRANSFER_SELECTOR) return bad("invalid_payload", "selector")
    const calldata = (call.Calldata as string[]).map(felt)
    if (calldata.length !== 3 || calldata[1] >= U128 || calldata[2] >= U128) return bad("invalid_payload", "calldata")
    if (calldata[0] !== felt(accepted.payTo)) return bad("invalid_exact_starknet_payload_recipient_mismatch")
    if (calldata[1] + (calldata[2] << 128n) !== BigInt(accepted.amount as string)) {
      return bad("invalid_exact_starknet_payload_amount_mismatch")
    }
    return { isValid: true, payer: num.toHex(from) }
  } catch (error) {
    return bad("invalid_payload", error instanceof Error ? error.message : String(error))
  }
}

// ── SNIP-12 revision 1 message hash, by hand ────────────────────────────────
// Written from SNIP-12 and the spec's hash-encoding notes, using only the Poseidon
// and sn_keccak primitives (not starknet.js's typedData module). Specialized to the
// SNIP-9 v2 OutsideExecution document.

const DOMAIN_TYPE =
  '"StarknetDomain"("name":"shortstring","version":"shortstring","chainId":"shortstring","revision":"shortstring")'
const CALL_TYPE = '"Call"("To":"ContractAddress","Selector":"selector","Calldata":"felt*")'
const OUTSIDE_EXECUTION_TYPE =
  '"OutsideExecution"("Caller":"ContractAddress","Nonce":"felt","Execute After":"u128","Execute Before":"u128","Calls":"Call*")' +
  CALL_TYPE

function poseidon(values: bigint[]): bigint {
  return BigInt(hash.computePoseidonHashOnElements(values.map((v) => num.toHex(v))))
}

function shortStringOrNumber(value: unknown): bigint {
  const s = String(value)
  if (/^0x[0-9a-fA-F]+$/.test(s) || /^[0-9]+$/.test(s)) return BigInt(s)
  return BigInt(shortString.encodeShortString(s))
}

export function manualSnip12MessageHash(doc: TypedData, account: bigint | string): bigint {
  const domain = doc.domain as Json
  const message = doc.message as Json
  // Hash-encoding note: version "2" and revision "1" enter as the integers 2 and 1.
  const domainHash = poseidon([
    BigInt(hash.starknetKeccak(DOMAIN_TYPE)),
    shortStringOrNumber(domain.name),
    shortStringOrNumber(domain.version),
    shortStringOrNumber(domain.chainId),
    shortStringOrNumber(domain.revision),
  ])
  const callHashes = (message.Calls as Json[]).map((call) =>
    poseidon([
      BigInt(hash.starknetKeccak(CALL_TYPE)),
      felt(call.To),
      felt(call.Selector), // selector-encoding note: the felt itself, not re-hashed
      poseidon((call.Calldata as unknown[]).map(felt)),
    ]),
  )
  const structHash = poseidon([
    BigInt(hash.starknetKeccak(OUTSIDE_EXECUTION_TYPE)),
    felt(message.Caller),
    felt(message.Nonce),
    felt(message["Execute After"]),
    felt(message["Execute Before"]),
    poseidon(callHashes),
  ])
  return poseidon([BigInt(shortString.encodeShortString("StarkNet Message")), domainHash, BigInt(account), structHash])
}
