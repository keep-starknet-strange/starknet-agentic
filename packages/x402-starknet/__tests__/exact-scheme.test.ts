import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  constants,
  ec,
  hash,
  num,
  outsideExecution,
  OutsideExecutionVersion,
  shortString,
  typedData as snip12,
  type TypedData,
} from "starknet"
import {
  createStarknetPaymentSignatureHeader,
  OUTSIDE_EXECUTION_TYPES,
  prepareStarknetPayment,
  STARKNET_NETWORKS,
  TRANSFER_SELECTOR,
  ANY_CALLER,
} from "../src/index.js"
import { signPreparedStarknetPaymentWithHooks } from "../src/payment.js"
import { buildOutsideExecutionTypedData } from "../src/typedData.js"
import { facilitatorVerify, manualSnip12MessageHash, rebuildCanonicalTypedData } from "./support/facilitator.js"
import {
  paymentRequired,
  publicKeyOf,
  requirement,
  RESOURCE,
  SEPOLIA,
  SPEC_ASSET,
  SPEC_FEE_PAYER,
  SPEC_PAY_TO,
  SPEC_PAYER,
  throwawayPrivateKey,
  toHeader,
} from "./support/fixtures.js"

// Signing is local. fetch is stubbed to fail so any network access surfaces as an error.
const fetchSpy = vi.fn(async () => {
  throw new Error("network access is not expected")
})

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  fetchSpy.mockClear()
})

// The reference client's PAYMENT-SIGNATURE decoder gate (x402 core utils, Base64EncodedRegex).
const REFERENCE_BASE64_GATE = /^[A-Za-z0-9+/]*={0,2}$/
const FELT_HEX = /^0x(0|[1-9a-f][0-9a-f]{0,63})$/

function decodeStandardBase64Json(value: string): Record<string, unknown> {
  expect(value).toMatch(REFERENCE_BASE64_GATE)
  expect(value.length % 4).toBe(0)
  return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as Record<string, unknown>
}

describe("happy path: decode -> build -> sign -> encode -> decode -> facilitator verify", () => {
  it("produces a PAYMENT-SIGNATURE a conformant facilitator accepts", async () => {
    const now = 1_790_000_000
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(now * 1000)

    const privateKey = throwawayPrivateKey()
    const serverRequirements = requirement()
    const header = toHeader(paymentRequired([serverRequirements]))

    const { headerValue, paymentPayload, summary } = await createStarknetPaymentSignatureHeader({
      paymentRequiredHeader: header,
      network: SEPOLIA,
      accountAddress: SPEC_PAYER,
      privateKey,
    })
    expect(fetchSpy).not.toHaveBeenCalled()

    // Wire format: standard base64 (passes the reference decoder gate) of the PaymentPayload.
    const decoded = decodeStandardBase64Json(headerValue)
    expect(decoded).toEqual(JSON.parse(JSON.stringify(paymentPayload)))
    expect(Object.keys(decoded)).toEqual(["x402Version", "resource", "accepted", "payload"])
    expect(decoded.x402Version).toBe(2)
    expect(decoded.resource).toEqual(RESOURCE)
    // `accepted` echoes the server's entry verbatim (the reference resource server deep-compares it).
    expect(decoded.accepted).toEqual(serverRequirements)

    const inner = decoded.payload as { from: string; outsideExecution: { typedData: TypedData; signature: string[] } }
    expect(Object.keys(inner)).toEqual(["from", "outsideExecution"])
    expect(Object.keys(inner.outsideExecution)).toEqual(["typedData", "signature"])
    expect(BigInt(inner.from)).toBe(BigInt(SPEC_PAYER))
    expect(inner.outsideExecution.signature).toHaveLength(2)
    for (const felt of inner.outsideExecution.signature) expect(felt).toMatch(FELT_HEX)

    // The signed document is the one the spec describes for these requirements.
    const message = inner.outsideExecution.typedData.message as Record<string, unknown>
    expect(BigInt(message.Caller as string)).toBe(BigInt(SPEC_FEE_PAYER))
    expect(BigInt(message["Execute After"] as string)).toBe(1n)
    expect(BigInt(message["Execute Before"] as string)).toBe(BigInt(now + 300))
    expect(message.Calls).toEqual([
      { To: num.toHex(SPEC_ASSET), Selector: TRANSFER_SELECTOR, Calldata: [num.toHex(SPEC_PAY_TO), "0x2710", "0x0"] },
    ])

    // A facilitator rebuilds the canonical document from the five fields and verifies.
    const verdict = facilitatorVerify(decoded, serverRequirements, publicKeyOf(privateKey), now)
    expect(verdict).toEqual({ isValid: true, payer: num.toHex(SPEC_PAYER) })
    // ...also a few seconds later (network latency), within the spec's skew margin.
    expect(facilitatorVerify(decoded, serverRequirements, publicKeyOf(privateKey), now + 20).isValid).toBe(true)

    expect(summary).toMatchObject({
      network: SEPOLIA,
      acceptIndex: 0,
      resourceUrl: RESOURCE.url,
      asset: SPEC_ASSET,
      payTo: SPEC_PAY_TO,
      amount: "10000",
      feePayer: SPEC_FEE_PAYER,
      payer: SPEC_PAYER,
      validAfter: 1,
      validUntil: now + 300,
      validUntilIso: new Date((now + 300) * 1000).toISOString(),
    })
  })

  it("the facilitator check is meaningful: other keys, payers and edited fields do not verify", async () => {
    const now = Math.floor(Date.now() / 1000)
    const privateKey = throwawayPrivateKey()
    const serverRequirements = requirement()
    const { headerValue } = await createStarknetPaymentSignatureHeader({
      paymentRequiredHeader: toHeader(paymentRequired([serverRequirements])),
      network: SEPOLIA,
      accountAddress: SPEC_PAYER,
      privateKey,
    })
    const decoded = decodeStandardBase64Json(headerValue)
    expect(facilitatorVerify(decoded, serverRequirements, publicKeyOf(privateKey), now).isValid).toBe(true)

    // Wrong key.
    expect(facilitatorVerify(decoded, serverRequirements, publicKeyOf(throwawayPrivateKey()), now)).toMatchObject({
      invalidReason: "invalid_exact_starknet_payload_signature",
    })
    // The account address is part of the SNIP-12 hash.
    const otherFrom = structuredClone(decoded)
    ;(otherFrom.payload as Record<string, unknown>).from = SPEC_PAY_TO
    expect(facilitatorVerify(otherFrom, serverRequirements, publicKeyOf(privateKey), now).isValid).toBe(false)
    // A relayer editing the amount breaks the signature.
    const edited = structuredClone(decoded) as {
      accepted: Record<string, unknown>
      payload: { outsideExecution: { typedData: { message: { Calls: Array<{ Calldata: string[] }> } } } }
    }
    edited.payload.outsideExecution.typedData.message.Calls[0].Calldata[1] = "0x2711"
    edited.accepted.amount = "10001"
    expect(facilitatorVerify(edited, { ...serverRequirements, amount: "10001" }, publicKeyOf(privateKey), now)).toMatchObject({
      invalidReason: "invalid_exact_starknet_payload_signature",
    })
    // Stale: verified long after signing.
    expect(facilitatorVerify(decoded, serverRequirements, publicKeyOf(privateKey), now + 120)).toMatchObject({
      invalidReason: "outside_execution_expired",
    })
  })

  it("supports a custom signer (any account's SNIP-12 signMessage), hex-normalizing array signatures", async () => {
    const signMessage = vi.fn(async () => ["1", "0x00ff", 3n] as unknown as string[])
    const { paymentPayload } = await createStarknetPaymentSignatureHeader({
      paymentRequiredHeader: toHeader(paymentRequired()),
      network: SEPOLIA,
      accountAddress: SPEC_PAYER,
      signer: { signMessage },
    })
    expect(signMessage).toHaveBeenCalledTimes(1)
    const [signed, account] = signMessage.mock.calls[0] as unknown as [TypedData, string]
    expect(BigInt(account)).toBe(BigInt(SPEC_PAYER))
    expect(signed).toEqual(paymentPayload.payload.outsideExecution.typedData)
    expect(Object.isFrozen(signed)).toBe(true)
    expect(paymentPayload.payload.outsideExecution.signature).toEqual(["0x1", "0xff", "0x3"])
  })
})

describe("conformance", () => {
  it("constants match the spec and starknet.js", () => {
    expect(TRANSFER_SELECTOR).toBe(num.toHex(hash.getSelectorFromName("transfer")))
    expect(BigInt(TRANSFER_SELECTOR)).toBe(BigInt("0x0083afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e"))
    expect(STARKNET_NETWORKS["starknet:SN_MAIN"]).toBe(constants.StarknetChainId.SN_MAIN)
    expect(STARKNET_NETWORKS["starknet:SN_SEPOLIA"]).toBe(constants.StarknetChainId.SN_SEPOLIA)
    expect(BigInt(ANY_CALLER)).toBe(BigInt(shortString.encodeShortString("ANY_CALLER")))
    // Same types as starknet.js's own SNIP-9 v2 builder.
    const theirs = outsideExecution.getTypedData(
      constants.StarknetChainId.SN_SEPOLIA,
      { caller: SPEC_FEE_PAYER, execute_after: 1, execute_before: 2 },
      "0x1",
      [],
      OutsideExecutionVersion.V2,
    )
    expect(OUTSIDE_EXECUTION_TYPES).toEqual(theirs.types)
    expect(theirs.domain).toEqual({ name: "Account.execute_from_outside", version: "2", chainId: "0x534e5f5345504f4c4941", revision: "1" })
  })

  // Known-answer vector 1: the x402 Foundation reference implementation (x402 PR #3021,
  // typescript/packages/mechanisms/starknet/test/unit/typed-data.test.ts) pins this
  // hash for these inputs, and checks it against starknet.js's SNIP-9 v2 builder.
  it("matches the reference implementation's pinned message hash", () => {
    const ours = buildOutsideExecutionTypedData({
      network: SEPOLIA,
      caller: SPEC_FEE_PAYER,
      nonce: "0x71b7b5",
      executeAfter: 1n,
      executeBefore: 2_000_000_000n,
      asset: SPEC_ASSET,
      payTo: SPEC_PAY_TO,
      amount: 10_000n,
    })
    const pinned = "0x2c57d2f7ae807751d47a9bc4972fd721e15a796759e7053c047388c018f3573"
    expect(snip12.getMessageHash(ours, SPEC_PAYER)).toBe(pinned)
    expect(num.toHex(manualSnip12MessageHash(ours, SPEC_PAYER))).toBe(pinned)
    const theirs = outsideExecution.getTypedData(
      constants.StarknetChainId.SN_SEPOLIA,
      { caller: SPEC_FEE_PAYER, execute_after: 1, execute_before: 2_000_000_000 },
      "0x71b7b5",
      [{ contractAddress: SPEC_ASSET, entrypoint: "transfer", calldata: [SPEC_PAY_TO, "0x2710", "0x0"] }],
      OutsideExecutionVersion.V2,
    )
    expect(snip12.getMessageHash(theirs, SPEC_PAYER)).toBe(pinned)
  })

  // Known-answer vector 2, constructed by hand from the spec text: the "SNIP-12 Typed
  // Data Structure" example document of scheme_exact_starknet.md, copied verbatim, for
  // the payer of the spec's "PaymentPayload payload Field" example. Its hash is computed
  // by starknet.js and by an independent Poseidon/sn_keccak implementation of SNIP-12
  // (support/facilitator.ts), then pinned; the builder must reproduce it.
  const SPEC_EXAMPLE_TYPED_DATA = {
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
    domain: { name: "Account.execute_from_outside", version: "2", chainId: "0x534e5f5345504f4c4941", revision: "1" },
    message: {
      Caller: "0x05f2e02acd59f37f1e19da7ea1db6bf31d49e6e5ba66a7f1c2f0e2ba1be36f81",
      Nonce: "0x71b7b56b17c8e0f4dcd0d9427c30d0a8bfa3c53f4d95a3b26f6cf14f3d0f8e2",
      "Execute After": "1",
      "Execute Before": "1768312445",
      Calls: [
        {
          To: "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343",
          Selector: "0x0083afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e",
          Calldata: ["0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57", "0x2710", "0x0"],
        },
      ],
    },
  } satisfies TypedData
  const SPEC_EXAMPLE_HASH = "0x162715940e829d033351dab7e840a1ec445af428f939962f8ff03441ad076c9"
  // Fixed test-only key (never funded), so the RFC 6979 signature is reproducible.
  const VECTOR_PRIVATE_KEY = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  const SPEC_EXAMPLE_SIGNATURE = [
    "0x6349e9d2a5ee611636788595ef8dd75334c8139d834364588511ca73215bcf8",
    "0x50736eae6a54cfa2f83b0e65fce6e54b4cd126a8a3a8264894b35bbe15a0e49",
  ]

  it("hashes the spec's example document identically in two independent SNIP-12 implementations", () => {
    const viaStarknetJs = snip12.getMessageHash(SPEC_EXAMPLE_TYPED_DATA, SPEC_PAYER)
    const viaManual = num.toHex(manualSnip12MessageHash(SPEC_EXAMPLE_TYPED_DATA, SPEC_PAYER))
    expect(viaStarknetJs).toBe(viaManual)
    expect(viaStarknetJs).toBe(SPEC_EXAMPLE_HASH)
    // The facilitator's canonical rebuild hashes the same.
    const rebuilt = rebuildCanonicalTypedData(BigInt(SPEC_EXAMPLE_TYPED_DATA.domain.chainId), SPEC_EXAMPLE_TYPED_DATA.message)
    expect(snip12.getMessageHash(rebuilt, SPEC_PAYER)).toBe(SPEC_EXAMPLE_HASH)
  })

  it("builds and signs exactly the spec's example document from the spec's example requirements", async () => {
    const executeBefore = 1_768_312_445
    const prepared = prepareStarknetPayment({
      paymentRequiredHeader: toHeader(paymentRequired([requirement()])),
      network: SEPOLIA,
      accountAddress: SPEC_PAYER,
    })
    const { paymentPayload } = await signPreparedStarknetPaymentWithHooks(
      prepared,
      { privateKey: VECTOR_PRIVATE_KEY },
      { now: () => executeBefore - 300, nonce: () => SPEC_EXAMPLE_TYPED_DATA.message.Nonce },
    )
    const signed = paymentPayload.payload.outsideExecution
    expect(snip12.getMessageHash(signed.typedData, SPEC_PAYER)).toBe(SPEC_EXAMPLE_HASH)
    expect(signed.signature).toEqual(SPEC_EXAMPLE_SIGNATURE)
    // Independently: RFC 6979 STARK ECDSA over the pinned hash with the vector key.
    const expected = ec.starkCurve.sign(SPEC_EXAMPLE_HASH, VECTOR_PRIVATE_KEY)
    expect(SPEC_EXAMPLE_SIGNATURE).toEqual([num.toHex(expected.r), num.toHex(expected.s)])
    expect(facilitatorVerify(paymentPayload, requirement(), publicKeyOf(VECTOR_PRIVATE_KEY), executeBefore - 300)).toEqual({
      isValid: true,
      payer: num.toHex(SPEC_PAYER),
    })
  })
})
