import { describe, expect, it, vi } from "vitest"
import {
  createStarknetPaymentSignatureHeader,
  encodeBase64Json,
  decodeBase64Json
} from "../src/index.js"

vi.mock("starknet", async () => {
  return {
    RpcProvider: class RpcProvider {
      nodeUrl: string
      constructor({ nodeUrl }: { nodeUrl: string }) {
        this.nodeUrl = nodeUrl
      }
    },
    Account: class Account {
      address: string
      constructor(_p: unknown, address: string, _pk: string) {
        this.address = address
      }
      async signMessage(_typedData: unknown) {
        return ["0x1", "0x2"]
      }
    }
  }
})

describe("x402-starknet", () => {
  it("encodes and decodes base64 json", () => {
    const b64 = encodeBase64Json({ a: 1 })
    expect(decodeBase64Json(b64)).toEqual({ a: 1 })
  })

  it("creates a PAYMENT-SIGNATURE header from PAYMENT-REQUIRED", async () => {
    const paymentRequired = {
      scheme: "exact-starknet",
      typedData: {
        types: { StarkNetDomain: [], Message: [] },
        primaryType: "Message",
        domain: { name: "x402", version: "1", chainId: "SN_SEPOLIA" },
        message: {}
      }
    }

    const paymentRequiredHeader = encodeBase64Json(paymentRequired)

    const res = await createStarknetPaymentSignatureHeader({
      paymentRequiredHeader,
      rpcUrl: "http://localhost:5050",
      accountAddress: "0xabc",
      privateKey: "0x01"
    })

    const decoded = decodeBase64Json(res.headerValue)
    expect(decoded).toMatchObject({
      scheme: "exact-starknet",
      address: "0xabc",
      signature: ["0x1", "0x2"]
    })
  })
})
