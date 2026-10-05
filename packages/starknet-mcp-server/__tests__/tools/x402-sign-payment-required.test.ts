import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ec, typedData as snip12, type TypedData } from "starknet";
import { handler } from "../../src/tools/x402-sign-payment-required.js";
import type { ToolContext } from "../../src/tools/_shared.js";

// Runs x402_starknet_sign_payment_required end to end with nothing mocked: the real
// x402-starknet helper (the build that tsup bundles into dist/) and the real starknet.js
// signer. handlers/tools.test.ts mocks the helper, which hid a BigInt serialization crash.
// The key is a throwaway generated per run; signing is local and fetch is stubbed to fail.

const FELT_HEX = /^0x(0|[1-9a-f][0-9a-f]{0,62})$/;
const ACCOUNT_ADDRESS = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const TYPED_DATA: TypedData = {
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
  message: {
    Recipient: "0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57",
    Amount: "10000",
  },
};

describe("x402_starknet_sign_payment_required (real signer, no mocks)", () => {
  const fetchSpy = vi.fn(async () => {
    throw new Error("network access is not expected when signing");
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockClear();
  });

  it("returns a PAYMENT-SIGNATURE header whose hex [r, s] verifies for the signed typedData", async () => {
    const privateKey = `0x${Buffer.from(ec.starkCurve.utils.randomPrivateKey()).toString("hex")}`;
    const ctx = {
      signerMode: "direct",
      env: {
        STARKNET_RPC_URL: "http://127.0.0.1:9",
        STARKNET_ACCOUNT_ADDRESS: ACCOUNT_ADDRESS,
        STARKNET_PRIVATE_KEY: privateKey,
      },
    } as unknown as ToolContext;

    // Standard base64, as the tool's input schema describes.
    const paymentRequiredHeader = Buffer.from(
      JSON.stringify({ scheme: "exact-starknet", typedData: TYPED_DATA }),
    ).toString("base64");

    const result = await handler({ paymentRequiredHeader }, ctx);

    expect(fetchSpy).not.toHaveBeenCalled();
    const content = result.content[0];
    expect(content.type).toBe("text");
    const { paymentSignatureHeader, payload } = JSON.parse((content as { text: string }).text);

    // Decode the header independently of the helper (base64url, no padding).
    const decoded = JSON.parse(Buffer.from(paymentSignatureHeader, "base64url").toString("utf8"));
    expect(decoded).toEqual(payload);
    expect(decoded.address).toBe(ACCOUNT_ADDRESS);
    expect(decoded.typedData).toEqual(TYPED_DATA);
    expect(decoded.signature).toHaveLength(2);
    for (const felt of decoded.signature) expect(felt).toMatch(FELT_HEX);

    const msgHash = snip12.getMessageHash(decoded.typedData, decoded.address);
    const [r, s] = (decoded.signature as string[]).map((felt) => BigInt(felt));
    const fullPublicKey = ec.starkCurve.getPublicKey(privateKey, false);
    expect(ec.starkCurve.verify(new ec.starkCurve.Signature(r, s), msgHash, fullPublicKey)).toBe(true);

    const expected = ec.starkCurve.sign(msgHash, privateKey);
    expect([r, s]).toEqual([expected.r, expected.s]);
  });
});
