import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ec, num, typedData as snip12, type TypedData } from "starknet";
import { handler } from "../../src/tools/x402-sign-payment-required.js";
import { PolicyGuard, type PolicyConfig } from "../../src/middleware/policyGuard.js";
import type { ToolContext } from "../../src/tools/_shared.js";

// Runs x402_starknet_sign_payment_required with nothing mocked but the RPC chain id:
// the real x402-starknet build (what tsup bundles into dist/), the real starknet.js
// signer and the real PolicyGuard. Keys are throwaway; fetch is stubbed to fail, so
// any network access (avnu token lookups included) surfaces as an error.

const SEPOLIA_CHAIN_ID = "0x534e5f5345504f4c4941";
const MAINNET_CHAIN_ID = "0x534e5f4d41494e";
const ACCOUNT_ADDRESS = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const SEPOLIA_USDC = "0x0512feac6339ff7889822cb5aa2a86c848e9d392bb0e3e237c008674feed8343";
const PAY_TO = "0x02dd1b492765c064eac4039e3841aa5f382773b598097a40073bd8b48170ab57";
const FEE_PAYER = "0x05f2e02acd59f37f1e19da7ea1db6bf31d49e6e5ba66a7f1c2f0e2ba1be36f81";
const ATTACKER = "0x0666000000000000000000000000000000000000000000000000000000000bad";
const ONE_STRK = 10n ** 18n;

function requirement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    scheme: "exact",
    network: "starknet:SN_SEPOLIA",
    amount: (2n * ONE_STRK).toString(),
    asset: STRK,
    payTo: PAY_TO,
    maxTimeoutSeconds: 300,
    extra: { feePayer: FEE_PAYER },
    ...overrides,
  };
}

function header(accepts: unknown[] = [requirement()], extra: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({ x402Version: 2, resource: { url: "https://api.example.com/premium" }, accepts, ...extra }),
  ).toString("base64");
}

function throwawayKey(): string {
  return `0x${Buffer.from(ec.starkCurve.utils.randomPrivateKey()).toString("hex")}`;
}

function context(options: { policy?: PolicyConfig; chainId?: string; privateKey?: string; signerMode?: "direct" | "proxy" } = {}) {
  const getChainId = vi.fn(async () => options.chainId ?? SEPOLIA_CHAIN_ID);
  const ctx = {
    signerMode: options.signerMode ?? "direct",
    env: {
      STARKNET_RPC_URL: "http://127.0.0.1:9",
      STARKNET_ACCOUNT_ADDRESS: ACCOUNT_ADDRESS,
      STARKNET_PRIVATE_KEY: options.privateKey ?? throwawayKey(),
    },
    provider: { getChainId },
    policyGuard: new PolicyGuard(options.policy ?? {}),
  } as unknown as ToolContext;
  return { ctx, getChainId };
}

function parse(result: Awaited<ReturnType<typeof handler>>) {
  const content = result.content[0] as { type: string; text: string };
  expect(content.type).toBe("text");
  return JSON.parse(content.text) as { paymentSignatureHeader: string; summary: Record<string, unknown> };
}

// The canonical SNIP-9 v2 document, rebuilt from the five message fields the way a
// facilitator does it (spec rule 2), written here independently of the package.
function rebuild(td: TypedData): TypedData {
  const m = td.message as {
    Caller: string;
    Nonce: string;
    "Execute After": string;
    "Execute Before": string;
    Calls: Array<Record<string, unknown>>;
  };
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
    domain: { name: "Account.execute_from_outside", version: "2", chainId: SEPOLIA_CHAIN_ID, revision: "1" },
    message: {
      Caller: m.Caller,
      Nonce: m.Nonce,
      "Execute After": m["Execute After"],
      "Execute Before": m["Execute Before"],
      Calls: m.Calls.map((c) => ({ To: c.To, Selector: c.Selector, Calldata: c.Calldata })),
    },
  };
}

describe("x402_starknet_sign_payment_required", () => {
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

  it("builds, signs and summarizes a payment that verifies over the canonical document", async () => {
    const privateKey = throwawayKey();
    const { ctx, getChainId } = context({ privateKey });
    const before = Math.floor(Date.now() / 1000);

    const { paymentSignatureHeader, summary } = parse(await handler({ paymentRequiredHeader: header() }, ctx));

    expect(getChainId).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(paymentSignatureHeader).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);

    const decoded = JSON.parse(Buffer.from(paymentSignatureHeader, "base64").toString("utf8"));
    expect(decoded.x402Version).toBe(2);
    expect(decoded.accepted).toEqual(requirement());
    expect(BigInt(decoded.payload.from)).toBe(BigInt(ACCOUNT_ADDRESS));

    const { typedData, signature } = decoded.payload.outsideExecution;
    const message = typedData.message;
    expect(BigInt(message.Caller)).toBe(BigInt(FEE_PAYER));
    expect(message.Calls).toHaveLength(1);
    expect(BigInt(message.Calls[0].To)).toBe(BigInt(STRK));
    expect(message.Calls[0].Calldata.map(BigInt)).toEqual([BigInt(PAY_TO), 2n * ONE_STRK, 0n]);

    const msgHash = snip12.getMessageHash(rebuild(typedData), decoded.payload.from);
    const [r, s] = (signature as string[]).map((felt) => BigInt(felt));
    expect(ec.starkCurve.verify(new ec.starkCurve.Signature(r, s), msgHash, ec.starkCurve.getPublicKey(privateKey, false))).toBe(true);

    expect(summary).toMatchObject({
      network: "starknet:SN_SEPOLIA",
      acceptIndex: 0,
      asset: STRK,
      assetSymbol: "STRK",
      decimals: 18,
      amount: (2n * ONE_STRK).toString(),
      amountFormatted: "2",
      payTo: PAY_TO,
      feePayer: FEE_PAYER,
      payer: ACCOUNT_ADDRESS,
      resourceUrl: "https://api.example.com/premium",
    });
    expect(summary.validUntil).toBeGreaterThanOrEqual(before + 300);
    expect(summary.validUntil).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 300);
    expect(summary.description).toMatch(/^Authorized a payment of 2 STRK to 0x02dd.* on starknet:SN_SEPOLIA, executable only by 0x05f2.* until /);
  });

  it("ignores server-supplied typedData and caller-supplied key material", async () => {
    const privateKey = throwawayKey();
    const { ctx } = context({ privateKey });
    const evil = {
      types: {},
      primaryType: "OutsideExecution",
      domain: {},
      message: { Calls: [{ To: STRK, Selector: "approve", Calldata: [ATTACKER, "0xffffffff", "0x0"] }] },
    };
    const result = parse(
      await handler(
        {
          paymentRequiredHeader: header([requirement({ typedData: evil })], { typedData: evil }),
          typedData: evil,
          accountAddress: ATTACKER,
          privateKey: throwawayKey(),
          rpcUrl: "https://evil.example",
        },
        ctx,
      ),
    );
    const decoded = JSON.parse(Buffer.from(result.paymentSignatureHeader, "base64").toString("utf8"));
    expect(BigInt(decoded.payload.from)).toBe(BigInt(ACCOUNT_ADDRESS));
    const signed = JSON.stringify(decoded.payload.outsideExecution).toLowerCase();
    expect(signed).not.toContain(num.toHex(ATTACKER));
    expect(signed).not.toContain("approve");
  });

  it("pays the requested accepts entry", async () => {
    const { ctx } = context();
    const accepts = [requirement({ network: "eip155:8453" }), requirement(), requirement({ amount: ONE_STRK.toString() })];
    const { summary } = parse(await handler({ paymentRequiredHeader: header(accepts), acceptIndex: 2 }, ctx));
    expect(summary).toMatchObject({ acceptIndex: 2, amount: ONE_STRK.toString(), amountFormatted: "1" });
    const first = parse(await handler({ paymentRequiredHeader: header(accepts) }, ctx));
    expect(first.summary.acceptIndex).toBe(1);
  });

  describe("policy guard", () => {
    it("blocks a payment above transfer.maxAmountPerCall", async () => {
      const { ctx } = context({ policy: { transfer: { maxAmountPerCall: "1.5" } } });
      await expect(handler({ paymentRequiredHeader: header() }, ctx)).rejects.toThrow(
        "Policy violation: Payment amount 2 exceeds policy limit of 1.5",
      );
    });

    it("allows a payment at the limit, compared exactly in atomic units", async () => {
      const { ctx } = context({ policy: { transfer: { maxAmountPerCall: "2" } } });
      expect(parse(await handler({ paymentRequiredHeader: header() }, ctx)).summary.amountFormatted).toBe("2");
      const oneWeiOver = header([requirement({ amount: (2n * ONE_STRK + 1n).toString() })]);
      await expect(handler({ paymentRequiredHeader: oneWeiOver }, ctx)).rejects.toThrow(/Policy violation: Payment amount 2.000000000000000001 exceeds/);
    });

    it("blocks a recipient outside allowedRecipients and allows one inside it, regardless of padding", async () => {
      const blocked = context({ policy: { transfer: { allowedRecipients: [ATTACKER] } } });
      await expect(handler({ paymentRequiredHeader: header() }, blocked.ctx)).rejects.toThrow(
        /Policy violation: Recipient .* is not in the allowed recipients list/,
      );
      const allowed = context({ policy: { transfer: { allowedRecipients: [num.toHex(PAY_TO)] } } });
      expect(parse(await handler({ paymentRequiredHeader: header() }, allowed.ctx)).summary.payTo).toBe(PAY_TO);
    });

    it("blocks a blockedRecipients entry even when the server pads the address differently", async () => {
      const { ctx } = context({ policy: { transfer: { blockedRecipients: [PAY_TO] } } });
      const unpadded = header([requirement({ payTo: num.toHex(PAY_TO) })]);
      await expect(handler({ paymentRequiredHeader: unpadded }, ctx)).rejects.toThrow(/Policy violation: Recipient .* is blocked/);
    });

    it("applies allowedTokens by address or built-in symbol", async () => {
      const bySymbol = context({ policy: { transfer: { allowedTokens: ["STRK"] } } });
      expect(parse(await handler({ paymentRequiredHeader: header() }, bySymbol.ctx)).summary.assetSymbol).toBe("STRK");
      const byAddress = context({ policy: { transfer: { allowedTokens: [num.toHex(STRK)] } } });
      expect(parse(await handler({ paymentRequiredHeader: header() }, byAddress.ctx)).summary.asset).toBe(STRK);
      const other = context({ policy: { transfer: { allowedTokens: ["USDC"] } } });
      await expect(handler({ paymentRequiredHeader: header() }, other.ctx)).rejects.toThrow(
        /Policy violation: Token .* is not in the allowed tokens list/,
      );
    });

    it("fails closed when an amount limit is set and the token's decimals are unknown", async () => {
      const { ctx } = context({ policy: { transfer: { maxAmountPerCall: "1000000" } } });
      const usdc = header([requirement({ asset: SEPOLIA_USDC, amount: "10000" })]);
      await expect(handler({ paymentRequiredHeader: usdc }, ctx)).rejects.toThrow(
        /Policy violation: Token .* decimals are unknown/,
      );
    });

    it("signs a token with unknown decimals when no amount limit applies, reporting atomic units", async () => {
      const { ctx } = context();
      const usdc = header([requirement({ asset: SEPOLIA_USDC, amount: "10000" })]);
      const { summary } = parse(await handler({ paymentRequiredHeader: usdc }, ctx));
      expect(summary).toMatchObject({ amount: "10000", decimals: null, amountFormatted: null, assetSymbol: null });
      expect(summary.description).toMatch(/^Authorized a payment of 10000 atomic units 0x0512/);
    });

    it("refuses to sign without a policy guard", async () => {
      const { ctx } = context();
      delete (ctx as unknown as Record<string, unknown>).policyGuard;
      await expect(handler({ paymentRequiredHeader: header() }, ctx)).rejects.toThrow(/requires the policy guard/);
    });
  });

  describe("refusals", () => {
    it("pays only on the account's own chain", async () => {
      const { ctx } = context({ chainId: MAINNET_CHAIN_ID });
      await expect(handler({ paymentRequiredHeader: header() }, ctx)).rejects.toThrow(/offers no exact payment on starknet:SN_MAIN/);
    });

    it("rejects an unsupported chain", async () => {
      const { ctx } = context({ chainId: "0x1234" });
      await expect(handler({ paymentRequiredHeader: header() }, ctx)).rejects.toThrow(/not a supported Starknet network/);
    });

    it("rejects base64url headers", async () => {
      const { ctx } = context();
      const doc = { x402Version: 2, resource: { url: "https://a.example/?>>>" }, accepts: [requirement()], error: "???" };
      const b64url = Buffer.from(JSON.stringify(doc)).toString("base64url");
      expect(b64url).toMatch(/[-_]/);
      await expect(handler({ paymentRequiredHeader: b64url }, ctx)).rejects.toThrow(/base64url/);
    });

    it("rejects invalid arguments", async () => {
      const { ctx } = context();
      await expect(handler({}, ctx)).rejects.toThrow(/Invalid arguments/);
      await expect(handler({ paymentRequiredHeader: header(), acceptIndex: -1 }, ctx)).rejects.toThrow(/Invalid arguments/);
      await expect(handler({ paymentRequiredHeader: header(), acceptIndex: "0" }, ctx)).rejects.toThrow(/Invalid arguments/);
    });

    it("is disabled in proxy signer mode", async () => {
      const { ctx, getChainId } = context({ signerMode: "proxy" });
      await expect(handler({ paymentRequiredHeader: header() }, ctx)).rejects.toThrow(/disabled in STARKNET_SIGNER_MODE=proxy/);
      expect(getChainId).not.toHaveBeenCalled();
    });
  });
});
