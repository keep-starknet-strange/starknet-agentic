import fs from "node:fs";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Account, RpcProvider, constants, ec, hash, num, stark, transaction } from "starknet";
import type { Call, InvocationsSignerDetails } from "starknet";
import {
  SESSION_SIGNATURE_MODE_V1,
  SESSION_SIGNATURE_MODE_V2,
  SessionAccountSigner,
  decodeExecuteCalldata,
  parseSessionSignatureMode,
  sessionDomainHashV2,
  sessionMessageHash,
  sessionMessageHashV1,
  sessionMessageHashV2,
} from "../src/sessionSignature.ts";
import type { SessionMessage, SessionSignatureMode } from "../src/sessionSignature.ts";

type SessionVector = {
  id: string;
  mode: "v1_legacy" | "v2_snip12";
  signingPayload: SessionMessage;
  verificationPayload: SessionMessage;
  expected: {
    shouldVerify: boolean;
    signingMessageHash: string;
    verificationMessageHash: string;
    signingDomainHash?: string;
    verificationDomainHash?: string;
  };
};

const spec = JSON.parse(
  fs.readFileSync(new URL("../../../spec/session-signature-v2.json", import.meta.url), "utf8"),
) as { sessionVectors: SessionVector[] };

const VECTOR_MODE: Record<SessionVector["mode"], SessionSignatureMode> = {
  v1_legacy: SESSION_SIGNATURE_MODE_V1,
  v2_snip12: SESSION_SIGNATURE_MODE_V2,
};

const PRIVATE_KEY = stark.randomAddress();
const PUBLIC_KEY = ec.starkCurve.getStarkKey(PRIVATE_KEY);
// Cairo's check_ecdsa_signature takes the x-coordinate only; off-chain verify needs the full point.
const FULL_PUBLIC_KEY = ec.starkCurve.getPublicKey(PRIVATE_KEY, false);
const ACCOUNT = "0x0123456789abcdef";
const TOKEN = "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";
const VALID_UNTIL = 0x698f136cn;

function signerDetails(overrides: Partial<InvocationsSignerDetails> = {}): InvocationsSignerDetails {
  return {
    walletAddress: ACCOUNT,
    chainId: constants.StarknetChainId.SN_SEPOLIA,
    nonce: 7n,
    cairoVersion: "1",
    version: "0x3",
    ...overrides,
  } as InvocationsSignerDetails;
}

function verifies(signature: string[], msgHash: string): boolean {
  const [pubkey, r, s] = signature;
  return (
    BigInt(pubkey) === BigInt(PUBLIC_KEY) &&
    ec.starkCurve.verify(new ec.starkCurve.Signature(BigInt(r), BigInt(s)), msgHash, FULL_PUBLIC_KEY)
  );
}

describe("session message hash vs spec/session-signature-v2.json", () => {
  it("covers both modes", () => {
    const modes = new Set(spec.sessionVectors.map((vector) => vector.mode));
    expect(modes).toEqual(new Set(["v1_legacy", "v2_snip12"]));
  });

  for (const vector of spec.sessionVectors) {
    it(`matches ${vector.id}`, () => {
      const mode = VECTOR_MODE[vector.mode];
      const signingHash = sessionMessageHash(mode, vector.signingPayload);
      const verificationHash = sessionMessageHash(mode, vector.verificationPayload);

      expect(signingHash).toBe(num.toHex(vector.expected.signingMessageHash));
      expect(verificationHash).toBe(num.toHex(vector.expected.verificationMessageHash));
      expect(signingHash === verificationHash).toBe(vector.expected.shouldVerify);
      if (mode === SESSION_SIGNATURE_MODE_V2) {
        expect(sessionDomainHashV2(vector.signingPayload.chainId)).toBe(
          num.toHex(vector.expected.signingDomainHash as string),
        );
        expect(sessionDomainHashV2(vector.verificationPayload.chainId)).toBe(
          num.toHex(vector.expected.verificationDomainHash as string),
        );
      }
    });
  }

  it("v1 and v2 hashes differ for the same payload", () => {
    const payload = spec.sessionVectors[0].signingPayload;
    expect(sessionMessageHashV1(payload)).not.toBe(sessionMessageHashV2(payload));
  });

  it("rejects valid_until values the contract can never accept", () => {
    const payload = spec.sessionVectors[0].signingPayload;
    expect(() => sessionMessageHashV1({ ...payload, validUntil: 0 })).toThrow(/valid_until/);
    expect(() => sessionMessageHashV1({ ...payload, validUntil: 2n ** 64n })).toThrow(/valid_until/);
  });

  it("rejects values outside the felt range", () => {
    const payload = spec.sessionVectors[0].signingPayload;
    expect(() => sessionMessageHashV1({ ...payload, nonce: constants.PRIME })).toThrow(/nonce/);
  });
});

describe("SessionAccountSigner", () => {
  const transfer: Call = {
    contractAddress: TOKEN,
    entrypoint: "transfer",
    calldata: ["0xdeadbeef", "500000000", "0"],
  };

  for (const mode of [SESSION_SIGNATURE_MODE_V1, SESSION_SIGNATURE_MODE_V2] as const) {
    it(`v${mode}: returns [pubkey, r, s, valid_until] over the account's session hash`, async () => {
      const signer = new SessionAccountSigner({
        privateKey: PRIVATE_KEY,
        publicKey: PUBLIC_KEY,
        validUntil: VALID_UNTIL,
        mode,
      });
      const signature = (await signer.signTransaction([transfer], signerDetails())) as string[];

      const expectedHash = sessionMessageHash(mode, {
        accountAddress: ACCOUNT,
        chainId: constants.StarknetChainId.SN_SEPOLIA,
        nonce: 7n,
        validUntil: VALID_UNTIL,
        calls: [
          {
            to: TOKEN,
            selector: hash.getSelectorFromName("transfer"),
            calldata: ["0xdeadbeef", "500000000", "0"],
          },
        ],
      });

      expect(signature).toHaveLength(4);
      expect(BigInt(signature[0])).toBe(BigInt(PUBLIC_KEY));
      expect(BigInt(signature[3])).toBe(VALID_UNTIL);
      expect(verifies(signature, expectedHash)).toBe(true);
    });
  }

  it("binds the signature to the nonce and chain id", async () => {
    const signer = new SessionAccountSigner({
      privateKey: PRIVATE_KEY,
      publicKey: PUBLIC_KEY,
      validUntil: VALID_UNTIL,
      mode: SESSION_SIGNATURE_MODE_V2,
    });
    const base = (await signer.signTransaction([transfer], signerDetails())) as string[];
    const otherNonce = (await signer.signTransaction([transfer], signerDetails({ nonce: 8n }))) as string[];
    const otherChain = (await signer.signTransaction(
      [transfer],
      signerDetails({ chainId: constants.StarknetChainId.SN_MAIN }),
    )) as string[];

    expect(otherNonce.slice(1, 3)).not.toEqual(base.slice(1, 3));
    expect(otherChain.slice(1, 3)).not.toEqual(base.slice(1, 3));
  });

  it("signs exactly the __execute__ calldata starknet.js submits", async () => {
    const signer = new SessionAccountSigner({
      privateKey: PRIVATE_KEY,
      publicKey: PUBLIC_KEY,
      validUntil: VALID_UNTIL,
      mode: SESSION_SIGNATURE_MODE_V2,
    });
    // cairoVersion is set, so building an invocation needs no network access.
    const account = new Account({
      provider: new RpcProvider({ nodeUrl: "http://127.0.0.1:1" }),
      address: ACCOUNT,
      signer,
      cairoVersion: "1",
      plugins: false,
    });
    const calls: Call[] = [
      // Structured calldata is compiled by starknet.js; the signer must hash the compiled form.
      { contractAddress: TOKEN, entrypoint: "transfer", calldata: { recipient: "0xbeef1", amount: { low: 300, high: 0 } } },
      { contractAddress: TOKEN, entrypoint: "approve", calldata: ["0xbeef2", 7n, 0] },
    ];

    const invocation = await account.buildInvocation(calls, signerDetails({ walletAddress: account.address }));
    const sentCalls = decodeExecuteCalldata(invocation.calldata as string[]);
    const signedHash = sessionMessageHashV2({
      accountAddress: account.address,
      chainId: constants.StarknetChainId.SN_SEPOLIA,
      nonce: 7n,
      validUntil: VALID_UNTIL,
      calls: sentCalls,
    });

    expect(sentCalls.map((call) => num.toHex(call.selector))).toEqual([
      hash.getSelectorFromName("transfer"),
      hash.getSelectorFromName("approve"),
    ]);
    expect(sentCalls[0].calldata).toEqual([0xbeef1n, 300n, 0n]);
    expect(verifies(invocation.signature as string[], signedHash)).toBe(true);
  });

  it("refuses a private key that does not match the session public key", () => {
    expect(
      () =>
        new SessionAccountSigner({
          privateKey: PRIVATE_KEY,
          publicKey: "0x1234",
          validUntil: VALID_UNTIL,
          mode: SESSION_SIGNATURE_MODE_V1,
        }),
    ).toThrow(/does not match/);
  });

  it("does not echo a malformed private key", () => {
    const malformed = "0xnot-a-key-1234567890";
    let message = "";
    try {
      new SessionAccountSigner({ privateKey: malformed, publicKey: PUBLIC_KEY, validUntil: VALID_UNTIL, mode: 1 });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toBe("Session private key is not a valid Stark private key");
  });

  it("refuses unsupported modes, Cairo 0 details and non-INVOKE signing", async () => {
    expect(() => parseSessionSignatureMode(0)).toThrow(/Unsupported session signature mode/);
    expect(() => parseSessionSignatureMode(3)).toThrow(/Unsupported session signature mode/);

    const signer = new SessionAccountSigner({
      privateKey: PRIVATE_KEY,
      publicKey: PUBLIC_KEY,
      validUntil: VALID_UNTIL,
      mode: SESSION_SIGNATURE_MODE_V1,
    });
    await expect(
      signer.signTransaction([transfer], signerDetails({ cairoVersion: "0" })),
    ).rejects.toThrow(/Cairo 1/);
    await expect(signer.signMessage({} as never, ACCOUNT)).rejects.toThrow(/only signs INVOKE/);
  });

  it("does not expose the private key", () => {
    const signer = new SessionAccountSigner({
      privateKey: PRIVATE_KEY,
      publicKey: PUBLIC_KEY,
      validUntil: VALID_UNTIL,
      mode: SESSION_SIGNATURE_MODE_V1,
    });
    const secretDigits = BigInt(PRIVATE_KEY).toString(16);
    expect(inspect(signer, { showHidden: true, depth: null })).not.toContain(secretDigits);
    expect(Object.values(signer).map(String).join(" ")).not.toContain(secretDigits);
  });
});

describe("decodeExecuteCalldata", () => {
  it("round-trips starknet.js __execute__ calldata", () => {
    const calldata = transaction.getExecuteCalldata(
      [
        { contractAddress: TOKEN, entrypoint: "transfer", calldata: ["0x1", "2", "0"] },
        { contractAddress: "0x2", entrypoint: "balance_of", calldata: [] },
      ],
      "1",
    );
    expect(decodeExecuteCalldata(calldata)).toEqual([
      { to: BigInt(TOKEN), selector: BigInt(hash.getSelectorFromName("transfer")), calldata: [1n, 2n, 0n] },
      { to: 2n, selector: BigInt(hash.getSelectorFromName("balance_of")), calldata: [] },
    ]);
  });

  it("rejects malformed calldata", () => {
    expect(() => decodeExecuteCalldata([])).toThrow(/truncated/);
    expect(() => decodeExecuteCalldata([1, 0x1, 0x2, 3, 0x9])).toThrow(/truncated/);
    expect(() => decodeExecuteCalldata([1, 0x1, 0x2, 0, 0x9])).toThrow(/trailing/);
    expect(() => decodeExecuteCalldata([2n ** 64n])).toThrow(/call count/);
  });
});
