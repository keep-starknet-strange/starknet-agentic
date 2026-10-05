import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { hash, num, type TypedData } from "starknet"
import {
  assertTypedDataMatchesIntent,
  createStarknetPaymentSignatureHeader,
  decodePaymentRequiredHeader,
  prepareStarknetPayment,
  selectPaymentRequirements,
  signPreparedStarknetPayment,
  X402PaymentError,
  type OutsideExecutionTypedData,
  type PaymentIntent,
  type PreparedStarknetPayment,
} from "../src/index.js"
import { signPreparedStarknetPaymentWithHooks } from "../src/payment.js"
import { buildOutsideExecutionTypedData } from "../src/typedData.js"
import { facilitatorVerify } from "./support/facilitator.js"
import {
  ANY_CALLER_SENTINEL,
  ATTACKER,
  MAINNET,
  OTHER_TOKEN,
  paymentRequired,
  publicKeyOf,
  requirement,
  SEPOLIA,
  SPEC_ASSET,
  SPEC_FEE_PAYER,
  SPEC_PAY_TO,
  SPEC_PAYER,
  throwawayPrivateKey,
  toHeader,
} from "./support/fixtures.js"

const fetchSpy = vi.fn(async () => {
  throw new Error("network access is not expected")
})
beforeEach(() => vi.stubGlobal("fetch", fetchSpy))
afterEach(() => {
  vi.unstubAllGlobals()
  fetchSpy.mockClear()
})

const NOW = 1_790_000_000
const NONCE = "0x5eed"
const hooks = { now: () => NOW, nonce: () => NONCE }

function prepare(doc: unknown, extra: { acceptIndex?: number; network?: typeof SEPOLIA | typeof MAINNET; cap?: number } = {}) {
  return prepareStarknetPayment({
    paymentRequiredHeader: toHeader(doc),
    network: extra.network ?? SEPOLIA,
    accountAddress: SPEC_PAYER,
    acceptIndex: extra.acceptIndex,
    maxTimeoutSecondsCap: extra.cap,
  })
}

function expectCode(fn: () => unknown, code: string, message?: RegExp): void {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(X402PaymentError)
  expect((caught as X402PaymentError).code).toBe(code)
  if (message) expect((caught as Error).message).toMatch(message)
}

async function expectRejects(promise: Promise<unknown>, code: string, message?: RegExp): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(X402PaymentError)
  expect((error as X402PaymentError).code).toBe(code)
  if (message) expect((error as Error).message).toMatch(message)
}

/** Every string anywhere inside a JSON value. */
function allStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (value && typeof value === "object") return Object.values(value).flatMap(allStrings)
  return []
}

// ── Server-supplied content is never signed ────────────────────────────────

describe("server-supplied typedData and extra fields are ignored", () => {
  const maliciousTypedData: TypedData = {
    types: {
      StarknetDomain: [{ name: "name", type: "shortstring" }],
      OutsideExecution: [{ name: "Calls", type: "Call*" }],
      Call: [{ name: "To", type: "ContractAddress" }],
    },
    primaryType: "OutsideExecution",
    domain: { name: "Account.execute_from_outside" },
    message: {
      Caller: ANY_CALLER_SENTINEL,
      Calls: [
        { To: SPEC_ASSET, Selector: num.toHex(hash.getSelectorFromName("approve")), Calldata: [ATTACKER, "0xffffffffffffffffffffffffffffffff", "0xffffffffffffffffffffffffffffffff"] },
        { To: OTHER_TOKEN, Selector: num.toHex(hash.getSelectorFromName("transfer")), Calldata: [ATTACKER, "0x1000000000000", "0x0"] },
      ],
    },
  }

  it("signs the same document, byte for byte, with or without injected content", async () => {
    const privateKey = throwawayPrivateKey()
    const clean = await signPreparedStarknetPaymentWithHooks(prepare(paymentRequired()), { privateKey }, hooks)

    const poisoned = paymentRequired(
      [
        requirement({
          typedData: maliciousTypedData,
          calls: maliciousTypedData.message,
          calldata: [ATTACKER, "0xffff", "0x0"],
          selector: "approve",
          extra: {
            feePayer: SPEC_FEE_PAYER,
            typedData: maliciousTypedData,
            calls: [{ to: OTHER_TOKEN, entrypoint: "approve" }],
            caller: ANY_CALLER_SENTINEL,
            name: "USDC",
            version: "2",
          },
        }),
      ],
      { typedData: maliciousTypedData, scheme: "exact-starknet", facilitator: "https://evil.example", extensions: { x: 1 } },
    )
    const injected = await signPreparedStarknetPaymentWithHooks(prepare(poisoned), { privateKey }, hooks)

    const cleanOE = clean.paymentPayload.payload.outsideExecution
    const injectedOE = injected.paymentPayload.payload.outsideExecution
    expect(injectedOE).toEqual(cleanOE)
    expect(JSON.stringify(injectedOE)).toBe(JSON.stringify(cleanOE))

    // No attacker value reached anything that is signed.
    const signedStrings = allStrings(injectedOE.typedData).map((s) => s.toLowerCase())
    for (const evil of [ATTACKER, OTHER_TOKEN, ANY_CALLER_SENTINEL, num.toHex(hash.getSelectorFromName("approve"))]) {
      expect(signedStrings).not.toContain(num.toHex(evil))
      expect(signedStrings).not.toContain(evil.toLowerCase())
    }
    // Nothing from the top level of PAYMENT-REQUIRED is copied into the envelope except
    // `resource` and the chosen entry (echoed as `accepted`, which is not signed).
    expect(Object.keys(injected.paymentPayload)).toEqual(["x402Version", "resource", "accepted", "payload"])
    expect(injected.paymentPayload.accepted).toEqual((poisoned.accepts as unknown[])[0])
  })

  it("the one-shot API refuses the removed server-typed-data arguments", async () => {
    for (const removed of [
      { paymentRequired: { typedData: maliciousTypedData } },
      { typedData: maliciousTypedData },
      { rpcUrl: "http://127.0.0.1:5050" },
    ]) {
      await expectRejects(
        createStarknetPaymentSignatureHeader({
          paymentRequiredHeader: toHeader(paymentRequired()),
          network: SEPOLIA,
          accountAddress: SPEC_PAYER,
          privateKey: throwawayPrivateKey(),
          ...removed,
        } as never),
        "invalid_arguments",
        /no longer accepted/,
      )
    }
  })

  it("a legacy { scheme, typedData } PAYMENT-REQUIRED is rejected, not signed", () => {
    expectCode(
      () => prepare({ scheme: "exact-starknet", typedData: maliciousTypedData, facilitator: "https://f.example" }),
      "invalid_payment_required",
    )
  })
})

// ── Scheme, network, version ────────────────────────────────────────────────

describe("wrong scheme, network or version is rejected", () => {
  it.each([
    ["upto scheme", requirement({ scheme: "upto" })],
    ["legacy exact-starknet scheme id", requirement({ scheme: "exact-starknet" })],
    ["EVM network", requirement({ network: "eip155:8453" })],
    ["mainnet entry for a Sepolia signer", requirement({ network: MAINNET })],
    ["non-CAIP-2 network", requirement({ network: "SN_SEPOLIA" })],
  ])("%s", (_label, entry) => {
    expectCode(() => prepare(paymentRequired([entry])), "no_matching_requirements", /offers no exact payment on starknet:SN_SEPOLIA/)
  })

  it("an explicit acceptIndex for another scheme or network is refused", () => {
    const doc = paymentRequired([requirement({ network: "eip155:8453" }), requirement()])
    expectCode(() => prepare(doc, { acceptIndex: 0 }), "no_matching_requirements", /accepts\[0\] is exact on eip155:8453/)
    expect(prepare(doc, { acceptIndex: 1 }).acceptIndex).toBe(1)
  })

  it.each([
    ["x402Version 1", paymentRequired(undefined, { x402Version: 1 })],
    ["x402Version as string", paymentRequired(undefined, { x402Version: "2" })],
    ["missing resource", { x402Version: 2, accepts: [requirement()] }],
    ["resource without url", paymentRequired(undefined, { resource: { description: "x" } })],
    ["empty accepts", paymentRequired([])],
    ["accepts not an array", paymentRequired(undefined, { accepts: requirement() })],
    ["accepts entry not an object", paymentRequired(["exact"])],
    ["too many accepts", paymentRequired(Array.from({ length: 65 }, () => requirement()))],
    ["JSON array", [paymentRequired()]],
    ["JSON null", null],
  ])("%s", (_label, doc) => {
    expectCode(() => prepare(doc), "invalid_payment_required")
  })

  it("rejects an unsupported signer network", () => {
    expectCode(
      () =>
        prepareStarknetPayment({
          paymentRequiredHeader: toHeader(paymentRequired()),
          network: "starknet:SN_GOERLI" as never,
          accountAddress: SPEC_PAYER,
        }),
      "invalid_arguments",
    )
  })
})

// ── Amount ──────────────────────────────────────────────────────────────────

describe("amount is used exactly", () => {
  const TWO_128 = 1n << 128n
  it.each([
    ["1", 1n, 0n],
    ["2^128 - 1", TWO_128 - 1n, 0n],
    ["2^128", 0n, 1n],
    ["2^128 + 5", 5n, 1n],
    ["2 * 2^128 + 5", 5n, 2n],
    ["2^256 - 1", TWO_128 - 1n, TWO_128 - 1n],
  ])("%s splits into the right u256 limbs and verifies", async (_label, low, high) => {
    const amount = (low + (high << 128n)).toString()
    const privateKey = throwawayPrivateKey()
    const serverRequirements = requirement({ amount })
    const { paymentPayload } = await signPreparedStarknetPaymentWithHooks(
      prepare(paymentRequired([serverRequirements])),
      { privateKey },
      hooks,
    )
    const calldata = paymentPayload.payload.outsideExecution.typedData.message.Calls[0].Calldata
    expect(calldata).toEqual([num.toHex(SPEC_PAY_TO), num.toHex(low), num.toHex(high)])
    expect(BigInt(calldata[1]) + (BigInt(calldata[2]) << 128n)).toBe(BigInt(amount))
    expect(paymentPayload.accepted.amount).toBe(amount)
    expect(facilitatorVerify(paymentPayload, serverRequirements, publicKeyOf(privateKey), NOW).isValid).toBe(true)
  })

  it.each([
    ["zero", "0"],
    ["negative", "-1"],
    ["plus sign", "+1"],
    ["hex", "0x2710"],
    ["octal-looking leading zero", "010"],
    ["binary prefix", "0b101"],
    ["exponent", "1e6"],
    ["fraction", "1.5"],
    ["leading whitespace", " 10000"],
    ["trailing whitespace", "10000 "],
    ["empty", ""],
    ["2^256", (1n << 256n).toString()],
    ["79 digits", "1".repeat(79)],
    ["number type", 10000],
    ["missing", undefined],
  ])("rejects %s", (_label, amount) => {
    expectCode(() => prepare(paymentRequired([requirement({ amount })])), "invalid_payment_requirements", /amount/)
  })
})

// ── Addresses ───────────────────────────────────────────────────────────────

describe("payTo, asset and feePayer must be valid addresses", () => {
  const ADDR_BOUND = (1n << 251n) - 256n
  const badAddresses: Array<[string, unknown]> = [
    ["zero", "0x0"],
    ["padded zero", `0x${"0".repeat(64)}`],
    ["no 0x prefix", SPEC_PAY_TO.slice(2)],
    ["0x only", "0x"],
    ["non-hex", "0xzz"],
    ["65 hex digits", `0x1${"0".repeat(64)}`],
    ["ADDR_BOUND", num.toHex(ADDR_BOUND)],
    ["field prime", num.toHex(2n ** 251n + 17n * 2n ** 192n + 1n)],
    ["decimal string", BigInt(SPEC_PAY_TO).toString()],
    ["number", 1234],
    ["whitespace", ` ${SPEC_PAY_TO}`],
    ["short string", "merchant"],
    ["missing", undefined],
  ]

  it.each(badAddresses)("payTo: %s", (_label, payTo) => {
    expectCode(() => prepare(paymentRequired([requirement({ payTo })])), "invalid_payment_requirements", /payTo/)
  })
  it.each(badAddresses)("asset: %s", (_label, asset) => {
    expectCode(() => prepare(paymentRequired([requirement({ asset })])), "invalid_payment_requirements", /asset/)
  })
  it.each(badAddresses)("extra.feePayer: %s", (_label, feePayer) => {
    expectCode(() => prepare(paymentRequired([requirement({ extra: { feePayer } })])), "invalid_payment_requirements", /feePayer/)
  })

  it("rejects a missing extra", () => {
    const entry = requirement()
    delete entry.extra
    expectCode(() => prepare(paymentRequired([entry])), "invalid_payment_requirements", /extra/)
  })

  it("rejects the ANY_CALLER sentinel as feePayer, in any padding", () => {
    for (const feePayer of [ANY_CALLER_SENTINEL, `0x${ANY_CALLER_SENTINEL.slice(2).padStart(64, "0")}`, ANY_CALLER_SENTINEL.toUpperCase().replace("0X", "0x")]) {
      expectCode(() => prepare(paymentRequired([requirement({ extra: { feePayer } })])), "invalid_payment_requirements", /ANY_CALLER/)
    }
  })

  it("rejects feePayer equal to the payer, compared numerically", () => {
    const unpadded = num.toHex(SPEC_PAYER)
    expectCode(() => prepare(paymentRequired([requirement({ extra: { feePayer: unpadded } })])), "invalid_payment_requirements", /payer/)
  })

  it("accepts mixed-case and unpadded addresses and normalizes them in what is signed", async () => {
    const entry = requirement({ payTo: num.toHex(SPEC_PAY_TO).toUpperCase().replace("0X", "0x"), asset: SPEC_ASSET.toUpperCase().replace("0X", "0x") })
    const { paymentPayload } = await signPreparedStarknetPaymentWithHooks(prepare(paymentRequired([entry])), { privateKey: throwawayPrivateKey() }, hooks)
    const call = paymentPayload.payload.outsideExecution.typedData.message.Calls[0]
    expect(call.To).toBe(num.toHex(SPEC_ASSET))
    expect(call.Calldata[0]).toBe(num.toHex(SPEC_PAY_TO))
    // The echo keeps the server's spelling so the server's deep-equal match succeeds.
    expect(paymentPayload.accepted.payTo).toBe(entry.payTo)
  })

  it("rejects an invalid payer account address", () => {
    expectCode(
      () => prepareStarknetPayment({ paymentRequiredHeader: toHeader(paymentRequired()), network: SEPOLIA, accountAddress: "0x0" }),
      "invalid_arguments",
    )
  })

  it.each([
    ["assetTransferMethod permit2", { assetTransferMethod: "permit2" }],
    ["paymentFlow settle-first", { paymentFlow: "settlement" }],
  ])("rejects reserved extra key with a value other than the scheme's (%s)", (_label, reserved) => {
    expectCode(
      () => prepare(paymentRequired([requirement({ extra: { feePayer: SPEC_FEE_PAYER, ...reserved } })])),
      "invalid_payment_requirements",
    )
  })

  it("accepts the reserved keys with the scheme's values", () => {
    const prepared = prepare(
      paymentRequired([requirement({ extra: { feePayer: SPEC_FEE_PAYER, assetTransferMethod: "default", paymentFlow: "authorization" } })]),
    )
    expect(prepared.requirements.feePayer).toBe(num.toHex(SPEC_FEE_PAYER))
  })
})

// ── Time bounds ─────────────────────────────────────────────────────────────

describe("maxTimeoutSeconds", () => {
  it.each([
    ["zero", 0],
    ["negative", -300],
    ["fractional", 300.5],
    ["string", "300"],
    ["NaN-ish null", null],
    ["above the default cap (3600)", 3601],
    ["absurd", 1e12],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 2],
    ["missing", undefined],
  ])("rejects %s", (_label, maxTimeoutSeconds) => {
    expectCode(() => prepare(paymentRequired([requirement({ maxTimeoutSeconds })])), "invalid_payment_requirements", /maxTimeoutSeconds/)
  })

  it("signs Execute Before = now + maxTimeoutSeconds exactly, and Execute After = 1", async () => {
    for (const maxTimeoutSeconds of [1, 60, 300, 3600]) {
      const { paymentPayload, summary } = await signPreparedStarknetPaymentWithHooks(
        prepare(paymentRequired([requirement({ maxTimeoutSeconds })])),
        { privateKey: throwawayPrivateKey() },
        hooks,
      )
      const message = paymentPayload.payload.outsideExecution.typedData.message
      expect(BigInt(message["Execute Before"])).toBe(BigInt(NOW + maxTimeoutSeconds))
      expect(BigInt(message["Execute After"])).toBe(1n)
      expect(summary.validUntil).toBe(NOW + maxTimeoutSeconds)
    }
  })

  it("lets a caller raise the cap up to one day, never beyond", async () => {
    expect(prepare(paymentRequired([requirement({ maxTimeoutSeconds: 7200 })]), { cap: 7200 }).requirements.maxTimeoutSeconds).toBe(7200)
    expectCode(() => prepare(paymentRequired([requirement({ maxTimeoutSeconds: 7200 })]), { cap: 86_401 }), "invalid_arguments")
    expectCode(() => prepare(paymentRequired([requirement({ maxTimeoutSeconds: 10 })]), { cap: 0 }), "invalid_arguments")
    // A lower cap also applies.
    expectCode(() => prepare(paymentRequired([requirement({ maxTimeoutSeconds: 300 })]), { cap: 120 }), "invalid_payment_requirements")
  })
})

// ── Header encoding ─────────────────────────────────────────────────────────

describe("PAYMENT-REQUIRED encoding", () => {
  // A document whose standard base64 contains '+' and '/', so its base64url form differs.
  const doc = paymentRequired([requirement()], { error: "????>>>>" })
  const standard = toHeader(doc)
  const base64url = Buffer.from(JSON.stringify(doc), "utf8").toString("base64url")

  it("fixture sanity: the two encodings differ", () => {
    expect(standard).toMatch(/[+/]/)
    expect(base64url).toMatch(/[-_]/)
  })

  it("rejects base64url", () => {
    expectCode(() => decodePaymentRequiredHeader(base64url), "invalid_header", /base64url/)
  })

  it("accepts standard base64, with or without padding and surrounding whitespace", () => {
    expect(decodePaymentRequiredHeader(standard).accepts).toHaveLength(1)
    const unpadded = Buffer.from(JSON.stringify(paymentRequired()), "utf8").toString("base64")
    expect(decodePaymentRequiredHeader(unpadded.replace(/=+$/, "")).accepts).toHaveLength(1)
    expect(decodePaymentRequiredHeader(`  ${standard}\r\n`).accepts).toHaveLength(1)
  })

  it.each([
    ["empty", ""],
    ["not a string", 42],
    ["invalid characters", "eyJ4!!"],
    ["misplaced padding", "eyJ=4"],
    ["length 1 mod 4", "eyJ4N"],
    ["non-canonical trailing bits", "YR=="],
    ["not JSON", Buffer.from("x402", "utf8").toString("base64")],
    ["not UTF-8", Buffer.from([0xff, 0xfe, 0x7b, 0x7d]).toString("base64")],
    ["oversized", "A".repeat(64 * 1024 + 4)],
  ])("rejects %s", (_label, header) => {
    expectCode(() => decodePaymentRequiredHeader(header), "invalid_header")
  })

  it("emits PAYMENT-SIGNATURE in standard base64 with padding", async () => {
    // ASCII JSON only produces '+' or '/' from the bytes '>', '?', '~'; the echoed
    // resource carries them so the header must contain characters base64url would change.
    const doc = paymentRequired([requirement()], { resource: { url: "https://api.example.com/data?q=1", description: "???>>>~~~" } })
    const { headerValue } = await signPreparedStarknetPaymentWithHooks(prepare(doc), { privateKey: throwawayPrivateKey() }, hooks)
    expect(headerValue).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
    expect(headerValue).toMatch(/[+/]/)
    expect(headerValue.length % 4).toBe(0)
    expect(JSON.parse(Buffer.from(headerValue, "base64").toString("utf8")).resource.description).toBe("???>>>~~~")
  })
})

// ── Selection ───────────────────────────────────────────────────────────────

describe("multiple accepts entries resolve deterministically", () => {
  const evm = requirement({ network: "eip155:8453", asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", extra: { name: "USDC" } })
  const sepoliaA = requirement({ amount: "111" })
  const sepoliaB = requirement({ amount: "222", asset: OTHER_TOKEN })
  const mainnetC = requirement({ network: MAINNET, amount: "333" })
  const doc = paymentRequired([evm, sepoliaA, sepoliaB, mainnetC])

  it("defaults to the first exact entry on the signer's network, every time", () => {
    for (let i = 0; i < 3; i++) {
      const prepared = prepare(doc)
      expect(prepared.acceptIndex).toBe(1)
      expect(prepared.requirements.amount).toBe(111n)
      expect(prepared.accepted).toEqual(sepoliaA)
    }
    expect(prepare(doc, { network: MAINNET }).acceptIndex).toBe(3)
    expect(prepare(paymentRequired([evm, sepoliaB, sepoliaA])).requirements.amount).toBe(222n)
  })

  it("honours an explicit acceptIndex", () => {
    const prepared = prepare(doc, { acceptIndex: 2 })
    expect(prepared.requirements).toMatchObject({ amount: 222n, asset: num.toHex(OTHER_TOKEN) })
  })

  it("never falls through past an invalid eligible entry", () => {
    const broken = requirement({ extra: { feePayer: ANY_CALLER_SENTINEL } })
    const withBrokenFirst = paymentRequired([evm, broken, sepoliaA])
    expectCode(() => prepare(withBrokenFirst), "invalid_payment_requirements", /accepts\[1\].*ANY_CALLER/)
    expect(prepare(withBrokenFirst, { acceptIndex: 2 }).requirements.amount).toBe(111n)
  })

  it.each([-1, 4, 1.5, Number.NaN])("rejects acceptIndex %s", (acceptIndex) => {
    expectCode(() => prepare(doc, { acceptIndex }), "invalid_arguments")
  })

  it("selectPaymentRequirements is pure and returns copies", () => {
    const decoded = decodePaymentRequiredHeader(toHeader(doc))
    const a = selectPaymentRequirements(decoded, { network: SEPOLIA, payer: SPEC_PAYER })
    const b = selectPaymentRequirements(decoded, { network: SEPOLIA, payer: SPEC_PAYER })
    expect(a).toEqual(b)
    expect(a.accepted).not.toBe(decoded.accepts[1])
  })
})

// ── Intent check ────────────────────────────────────────────────────────────

describe("intent check", () => {
  const intent: PaymentIntent = {
    network: SEPOLIA,
    payer: num.toHex(SPEC_PAYER),
    asset: num.toHex(SPEC_ASSET),
    payTo: num.toHex(SPEC_PAY_TO),
    amount: 10_000n,
    feePayer: num.toHex(SPEC_FEE_PAYER),
    nowSeconds: NOW,
    maxTimeoutSeconds: 300,
    nonce: NONCE,
  }
  const built = (): OutsideExecutionTypedData =>
    buildOutsideExecutionTypedData({
      network: SEPOLIA,
      caller: SPEC_FEE_PAYER,
      nonce: NONCE,
      executeAfter: 1n,
      executeBefore: BigInt(NOW + 300),
      asset: SPEC_ASSET,
      payTo: SPEC_PAY_TO,
      amount: 10_000n,
    })
  const approve = num.toHex(hash.getSelectorFromName("approve"))

  type MutableCall = { To: unknown; Selector: unknown; Calldata: unknown[]; [key: string]: unknown }
  type MutableDoc = {
    types: Record<string, Array<{ name: string; type: string }>>
    primaryType: string
    domain: Record<string, unknown>
    message: { Calls: MutableCall[]; [key: string]: unknown }
    [key: string]: unknown
  }
  type Tamper = [string, (td: MutableDoc) => void]
  const tampers: Tamper[] = [
    ["Caller -> attacker", (td) => (td.message.Caller = ATTACKER)],
    ["Caller -> ANY_CALLER", (td) => (td.message.Caller = ANY_CALLER_SENTINEL)],
    ["Caller -> payer", (td) => (td.message.Caller = num.toHex(SPEC_PAYER))],
    ["Nonce -> other", (td) => (td.message.Nonce = "0x5eee")],
    ["Nonce -> zero", (td) => (td.message.Nonce = "0x0")],
    ["Execute After -> 0", (td) => (td.message["Execute After"] = "0x0")],
    ["Execute After -> now", (td) => (td.message["Execute After"] = num.toHex(NOW))],
    ["Execute Before -> +1s", (td) => (td.message["Execute Before"] = num.toHex(NOW + 301))],
    ["Execute Before -> far future", (td) => (td.message["Execute Before"] = num.toHex(2n ** 64n))],
    ["Execute Before -> above u128", (td) => (td.message["Execute Before"] = num.toHex(2n ** 128n))],
    ["To -> other token", (td) => (td.message.Calls[0].To = num.toHex(OTHER_TOKEN))],
    ["Selector -> approve", (td) => (td.message.Calls[0].Selector = approve)],
    ["Selector -> name instead of felt", (td) => (td.message.Calls[0].Selector = "transfer")],
    ["Selector -> zero-padded", (td) => (td.message.Calls[0].Selector = "0x0083afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e")],
    ["recipient -> attacker", (td) => (td.message.Calls[0].Calldata[0] = ATTACKER)],
    ["amount_low + 1", (td) => (td.message.Calls[0].Calldata[1] = "0x2711")],
    ["amount_high -> 1", (td) => (td.message.Calls[0].Calldata[2] = "0x1")],
    ["amount_low as decimal string", (td) => (td.message.Calls[0].Calldata[1] = "10000")],
    ["amount_low with limb overflow", (td) => {
      td.message.Calls[0].Calldata[1] = num.toHex(10_000n + (1n << 128n))
      td.message.Calls[0].Calldata[2] = "0x0"
    }],
    ["amount_low as number", (td) => (td.message.Calls[0].Calldata[1] = 10000)],
    ["uppercase hex", (td) => (td.message.Calls[0].Calldata[1] = "0X2710")],
    ["extra calldata felt", (td) => td.message.Calls[0].Calldata.push("0x0")],
    ["second call (approve)", (td) => td.message.Calls.push({ To: num.toHex(SPEC_ASSET), Selector: approve, Calldata: [ATTACKER, "0x1", "0x0"] })],
    ["no calls", (td) => (td.message.Calls = [])],
    ["extra key on call", (td) => (td.message.Calls[0].Caller = ATTACKER)],
    ["extra key on message", (td) => (td.message.Extra = "0x1")],
    ["missing message key", (td) => Reflect.deleteProperty(td.message, "Nonce")],
    ["domain.chainId -> mainnet", (td) => (td.domain.chainId = "0x534e5f4d41494e")],
    ["domain.chainId -> short string", (td) => (td.domain.chainId = "SN_SEPOLIA")],
    ["domain.version -> 1 (SNIP-9 v1)", (td) => (td.domain.version = "1")],
    ["domain.revision -> 0", (td) => (td.domain.revision = "0")],
    ["domain.name", (td) => (td.domain.name = "Account.execute_from_outside_v3")],
    ["extra domain key", (td) => (td.domain.verifyingContract = ATTACKER)],
    ["primaryType", (td) => (td.primaryType = "Call")],
    ["types: field order", (td) => td.types.Call.reverse()],
    ["types: selector as felt", (td) => (td.types.Call[1].type = "felt")],
    ["types: extra type", (td) => (td.types.Evil = [{ name: "x", type: "felt" }])],
    ["extra top-level key", (td) => (td.extra = { approve: true })],
  ]

  it("accepts the untampered document", () => {
    expect(() => assertTypedDataMatchesIntent(built(), intent)).not.toThrow()
  })

  it.each(tampers)("assertTypedDataMatchesIntent rejects: %s", (_label, tamper) => {
    const td = built()
    tamper(td as unknown as MutableDoc)
    expectCode(() => assertTypedDataMatchesIntent(td, intent), "intent_mismatch")
  })

  it.each(tampers)("a tamper between building and signing is caught before the signer runs: %s", async (_label, tamper) => {
    const signMessage = vi.fn(async () => ["0x1", "0x2"])
    await expectRejects(
      signPreparedStarknetPaymentWithHooks(
        prepare(paymentRequired()),
        { signer: { signMessage } },
        { ...hooks, afterBuild: (td) => tamper(td as unknown as MutableDoc) },
      ),
      "intent_mismatch",
      /Refusing to sign/,
    )
    expect(signMessage).not.toHaveBeenCalled()
  })

  it("rejects an intent that is itself unsafe", () => {
    expectCode(() => assertTypedDataMatchesIntent(built(), { ...intent, feePayer: ANY_CALLER_SENTINEL }), "intent_mismatch", /ANY_CALLER/)
    expectCode(() => assertTypedDataMatchesIntent(built(), { ...intent, feePayer: intent.payer }), "intent_mismatch")
    expectCode(() => assertTypedDataMatchesIntent(built(), { ...intent, amount: 0n }), "intent_mismatch")
    expectCode(() => assertTypedDataMatchesIntent(built(), { ...intent, nowSeconds: 0 }), "intent_mismatch")
  })

  it("the document handed to the signer is frozen, so it cannot change after the check", async () => {
    let received: TypedData | undefined
    await signPreparedStarknetPaymentWithHooks(
      prepare(paymentRequired()),
      {
        signer: {
          signMessage: async (td) => {
            received = td
            expect(() => {
              ;(td.message as OutsideExecutionTypedData["message"]).Calls[0].Calldata[0] = ATTACKER
            }).toThrow(TypeError)
            return ["0x1", "0x2"]
          },
        },
      },
      hooks,
    )
    expect((received!.message as OutsideExecutionTypedData["message"]).Calls[0].Calldata[0]).toBe(num.toHex(SPEC_PAY_TO))
  })
})

// ── Prepared payments and signatures ────────────────────────────────────────

describe("prepared payments and signatures", () => {
  it("prepared payments are frozen", () => {
    const prepared = prepare(paymentRequired())
    expect(Object.isFrozen(prepared)).toBe(true)
    expect(Object.isFrozen(prepared.requirements)).toBe(true)
    expect(Object.isFrozen(prepared.accepted)).toBe(true)
  })

  it("a forged prepared payment whose requirements disagree with its accepted entry is refused", async () => {
    const prepared = prepare(paymentRequired())
    const forged = {
      ...prepared,
      requirements: { ...prepared.requirements, payTo: num.toHex(ATTACKER) },
    } as PreparedStarknetPayment
    await expectRejects(signPreparedStarknetPayment(forged, { privateKey: throwawayPrivateKey() }), "invalid_arguments", /do not match/)

    const forgedAccepted = { ...prepared, accepted: { ...prepared.accepted, extra: { feePayer: ANY_CALLER_SENTINEL } } } as PreparedStarknetPayment
    await expectRejects(signPreparedStarknetPayment(forgedAccepted, { privateKey: throwawayPrivateKey() }), "invalid_payment_requirements")
  })

  it.each([
    ["too long", Array.from({ length: 33 }, () => "0x1")],
    ["empty", []],
    ["not a felt", ["0x1", `0x${(2n ** 252n).toString(16)}`]],
    ["negative", ["0x1", -1n]],
    ["not hex", ["0x1", "zz"]],
    ["not a signature", "0x1234"],
  ])("rejects a signer result that is %s", async (_label, signature) => {
    await expectRejects(
      signPreparedStarknetPayment(prepare(paymentRequired()), { signer: { signMessage: async () => signature as never } }),
      "invalid_signature",
    )
  })

  it("rejects a malformed private key without echoing it", async () => {
    for (const privateKey of ["0x0", "1234", "0x" + "f".repeat(64), "not-a-key"]) {
      const error = await signPreparedStarknetPayment(prepare(paymentRequired()), { privateKey }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(X402PaymentError)
      expect((error as Error).message).not.toContain(privateKey.slice(2))
    }
  })

  it("requires a signer", async () => {
    await expectRejects(signPreparedStarknetPayment(prepare(paymentRequired()), {} as never), "invalid_arguments")
    await expectRejects(signPreparedStarknetPayment(prepare(paymentRequired()), undefined as never), "invalid_arguments")
    await expectRejects(signPreparedStarknetPayment({} as never, { privateKey: throwawayPrivateKey() }), "invalid_arguments")
    const prepared = prepare(paymentRequired())
    await expectRejects(
      signPreparedStarknetPayment({ ...prepared, requirements: undefined } as never, { privateKey: throwawayPrivateKey() }),
      "invalid_arguments",
    )
  })
})
