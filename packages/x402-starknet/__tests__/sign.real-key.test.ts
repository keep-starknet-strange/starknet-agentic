import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ec, num, typedData as snip12, type TypedData } from "starknet"
import {
  createStarknetPaymentSignatureHeader,
  decodeBase64Json,
  encodeBase64Json,
  type X402PaymentSignature,
} from "../src/index.js"

// Exercises the real signing path: starknet.js is NOT mocked (sign.test.ts mocks it,
// which is why the BigInt crash went unnoticed). Each test signs with a throwaway key
// generated on the spot. Signing is local; fetch is stubbed to fail so any network
// access would surface as an error.

// Starknet JSON-RPC FELT: 0x-prefixed hex without leading zeros.
const FELT_HEX = /^0x(0|[1-9a-f][0-9a-f]{0,62})$/

const ACCOUNT_ADDRESS = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
const PAY_TO = "0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57"

const TYPED_DATA: Record<string, TypedData> = {
  "SNIP-12 revision 0": {
    types: {
      StarkNetDomain: [
        { name: "name", type: "felt" },
        { name: "version", type: "felt" },
        { name: "chainId", type: "felt" },
      ],
      Payment: [
        { name: "recipient", type: "felt" },
        { name: "amount", type: "felt" },
      ],
    },
    primaryType: "Payment",
    domain: { name: "x402", version: "1", chainId: "SN_SEPOLIA" },
    message: { recipient: PAY_TO, amount: "10000" },
  },
  "SNIP-12 revision 1": {
    types: {
      StarknetDomain: [
        { name: "name", type: "shortstring" },
        { name: "version", type: "shortstring" },
        { name: "chainId", type: "shortstring" },
        { name: "revision", type: "shortstring" },
      ],
      Payment: [
        { name: "Recipient", type: "ContractAddress" },
        { name: "Amount", type: "u128" },
      ],
    },
    primaryType: "Payment",
    domain: { name: "x402", version: "1", chainId: "SN_SEPOLIA", revision: "1" },
    message: { Recipient: PAY_TO, Amount: "10000" },
  },
}

function throwawayPrivateKey(): string {
  return `0x${Buffer.from(ec.starkCurve.utils.randomPrivateKey()).toString("hex")}`
}

function verifyHexSignature(signature: string[], msgHash: string, privateKey: string): boolean {
  const [r, s] = signature.map((felt) => BigInt(felt))
  const fullPublicKey = ec.starkCurve.getPublicKey(privateKey, false)
  return ec.starkCurve.verify(new ec.starkCurve.Signature(r, s), msgHash, fullPublicKey)
}

describe("x402-starknet real signing (no mocks)", () => {
  const fetchSpy = vi.fn(async () => {
    throw new Error("network access is not expected when signing")
  })

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    fetchSpy.mockClear()
  })

  it.each(Object.entries(TYPED_DATA))(
    "%s: emits [r, s] as hex felts that verify against the signer's key",
    async (_label, typedData) => {
      const privateKey = throwawayPrivateKey()
      const paymentRequired = {
        scheme: "exact-starknet",
        facilitator: "https://facilitator.example",
        typedData,
      }

      const { headerValue, payload } = await createStarknetPaymentSignatureHeader({
        paymentRequiredHeader: encodeBase64Json(paymentRequired),
        rpcUrl: "http://127.0.0.1:9",
        accountAddress: ACCOUNT_ADDRESS,
        privateKey,
      })

      expect(fetchSpy).not.toHaveBeenCalled()

      // The header is plain JSON and decodes to exactly the returned payload.
      const decoded = decodeBase64Json<X402PaymentSignature>(headerValue)
      expect(decoded).toEqual(payload)
      expect(decoded).toMatchObject({
        scheme: "exact-starknet",
        facilitator: "https://facilitator.example",
        address: ACCOUNT_ADDRESS,
      })

      // Signature wire format: an array of two hex-encoded felts.
      expect(decoded.signature).toHaveLength(2)
      for (const felt of decoded.signature) expect(felt).toMatch(FELT_HEX)

      // The signed document is echoed verbatim, so the hash is the one that was signed.
      expect(decoded.typedData).toEqual(typedData)
      const msgHash = snip12.getMessageHash(decoded.typedData, decoded.address)
      expect(msgHash).toBe(snip12.getMessageHash(typedData, ACCOUNT_ADDRESS))

      // The decoded signature verifies against the signer's public key for that hash.
      expect(verifyHexSignature(decoded.signature, msgHash, privateKey)).toBe(true)

      // Round-trip: Stark ECDSA here is deterministic (RFC 6979), so signing the same
      // hash again yields the same r and s; the hex values decode to exactly those felts.
      const expected = ec.starkCurve.sign(msgHash, privateKey)
      expect(decoded.signature.map((felt) => BigInt(felt))).toEqual([expected.r, expected.s])
      expect(decoded.signature).toEqual([num.toHex(expected.r), num.toHex(expected.s)])
    },
  )

  it("does not verify for another key or another message (the check is meaningful)", async () => {
    const privateKey = throwawayPrivateKey()
    const typedData = TYPED_DATA["SNIP-12 revision 1"]

    const { headerValue } = await createStarknetPaymentSignatureHeader({
      paymentRequired: { scheme: "exact-starknet", typedData },
      rpcUrl: "http://127.0.0.1:9",
      accountAddress: ACCOUNT_ADDRESS,
      privateKey,
    })
    const decoded = decodeBase64Json<X402PaymentSignature>(headerValue)
    const msgHash = snip12.getMessageHash(decoded.typedData, ACCOUNT_ADDRESS)

    expect(verifyHexSignature(decoded.signature, msgHash, privateKey)).toBe(true)
    expect(verifyHexSignature(decoded.signature, msgHash, throwawayPrivateKey())).toBe(false)

    const tampered = { ...typedData, message: { ...typedData.message, Amount: "10001" } }
    const tamperedHash = snip12.getMessageHash(tampered, ACCOUNT_ADDRESS)
    expect(verifyHexSignature(decoded.signature, tamperedHash, privateKey)).toBe(false)
  })
})
