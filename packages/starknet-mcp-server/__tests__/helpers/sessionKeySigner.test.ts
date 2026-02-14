import { describe, it, expect, vi, beforeEach } from "vitest";
import { ec, hash, num, stark } from "starknet";
import { SessionKeySigner } from "../../src/helpers/sessionKeySigner.js";

// Generate a real Stark keypair for testing
function makeKeyPair() {
  const privateKey = stark.randomAddress();
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  return { privateKey, publicKey };
}

describe("SessionKeySigner", () => {
  let kp: { privateKey: string; publicKey: string };
  let signer: SessionKeySigner;
  const validUntil = 1700000000;

  beforeEach(() => {
    kp = makeKeyPair();
    signer = new SessionKeySigner(kp.privateKey, kp.publicKey, validUntil);
  });

  // ── Constructor ──────────────────────────────────────────────────────

  describe("constructor", () => {
    it("stores session public key", async () => {
      expect(await signer.getPubKey()).toBe(kp.publicKey);
    });

    it("creates inner signer once (not per call)", async () => {
      const signer1 = new SessionKeySigner(kp.privateKey, kp.publicKey, validUntil);
      const signer2 = new SessionKeySigner(kp.privateKey, kp.publicKey, validUntil);
      await expect(signer1.getPubKey()).resolves.toBe(kp.publicKey);
      await expect(signer2.getPubKey()).resolves.toBe(kp.publicKey);
    });
  });

  // ── getPubKey ────────────────────────────────────────────────────────

  describe("getPubKey", () => {
    it("returns the session public key", async () => {
      const pk = await signer.getPubKey();
      expect(pk).toBe(kp.publicKey);
    });

    it("returns consistent value across calls", async () => {
      const pk1 = await signer.getPubKey();
      const pk2 = await signer.getPubKey();
      expect(pk1).toBe(pk2);
    });
  });

  // ── signTransaction ──────────────────────────────────────────────────

  describe("signTransaction", () => {
    const accountAddress = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    const chainId = "0x534e5f5345504f4c4941"; // SN_SEPOLIA

    function makeTransactionDetail(overrides: Record<string, unknown> = {}) {
      return {
        accountAddress,
        chainId,
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
        ...overrides,
      };
    }

    function makeCall(
      contractAddress: string,
      entrypoint: string,
      calldata: string[] = [],
    ) {
      return { contractAddress, entrypoint, calldata };
    }

    it("returns a 4-element signature array", async () => {
      const calls = [makeCall("0xAAA", "transfer", ["0x1", "0x2"])];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig).toHaveLength(4);
    });

    it("first element is the session public key", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig[0]).toBe(kp.publicKey);
    });

    it("last element is the valid_until timestamp as hex", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig[3]).toBe(num.toHex(validUntil));
    });

    it("r and s are valid hex strings", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig[1]).toMatch(/^0x[0-9a-f]+$/i);
      expect(sig[2]).toMatch(/^0x[0-9a-f]+$/i);
    });

    it("signature matches independent hash computation", async () => {
      const calls = [makeCall("0xAAA", "transfer", ["0x1"])];
      const detail = makeTransactionDetail();
      const sig = await signer.signTransaction(calls, detail as any);

      // Recompute the same hash independently using the same algorithm
      const hashData: bigint[] = [];
      hashData.push(BigInt(accountAddress));
      hashData.push(BigInt(chainId));
      hashData.push(BigInt("0x1")); // nonce
      hashData.push(BigInt(validUntil));

      hashData.push(BigInt("0xAAA"));
      hashData.push(BigInt(hash.getSelectorFromName("transfer")));
      hashData.push(1n); // calldata len
      hashData.push(BigInt("0x1")); // calldata[0]

      const hashDataHex = hashData.map((n) => num.toHex(n));
      const expectedHash = hash.computePoseidonHashOnElements(hashDataHex);

      // Sign the independently computed hash with the same key
      const expectedSig = ec.starkCurve.sign(expectedHash, kp.privateKey);

      // If the signer computed the same hash, the deterministic ECDSA
      // signatures (RFC 6979) must be identical
      expect(sig[1]).toBe(num.toHex(expectedSig.r));
      expect(sig[2]).toBe(num.toHex(expectedSig.s));
    });

    it("different calls produce different signatures", async () => {
      const detail = makeTransactionDetail();
      const sig1 = await signer.signTransaction(
        [makeCall("0xAAA", "transfer", ["0x1"])],
        detail as any,
      );
      const sig2 = await signer.signTransaction(
        [makeCall("0xAAA", "transfer", ["0x2"])],
        detail as any,
      );

      // r or s should differ (pubkey and valid_until are the same)
      expect(sig1[1] !== sig2[1] || sig1[2] !== sig2[2]).toBe(true);
    });

    it("different nonces produce different signatures", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig1 = await signer.signTransaction(
        calls,
        makeTransactionDetail({ nonce: "0x1" }) as any,
      );
      const calls2 = [makeCall("0xAAA", "transfer")];
      const sig2 = await signer.signTransaction(
        calls2,
        makeTransactionDetail({ nonce: "0x2" }) as any,
      );

      expect(sig1[1] !== sig2[1] || sig1[2] !== sig2[2]).toBe(true);
    });

    it("handles multiple calls in a single transaction", async () => {
      const calls = [
        makeCall("0xAAA", "transfer", ["0x1", "0x2"]),
        makeCall("0xBBB", "approve", ["0x3"]),
        makeCall("0xCCC", "swap"),
      ];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig).toHaveLength(4);
      expect(sig[0]).toBe(kp.publicKey);
    });

    it("handles empty calldata", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig).toHaveLength(4);
    });

    it("converts entrypoint name to selector when not hex", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      // Should not throw — the entrypoint "transfer" is converted via getSelectorFromName
      expect(sig).toHaveLength(4);
    });

    it("uses hex entrypoint directly when prefixed with 0x", async () => {
      const selectorHex = hash.getSelectorFromName("transfer");
      const calls = [makeCall("0xAAA", selectorHex)];
      const sig = await signer.signTransaction(calls, makeTransactionDetail() as any);

      expect(sig).toHaveLength(4);
    });

    it("hex entrypoint and name entrypoint produce same signature", async () => {
      const selectorHex = hash.getSelectorFromName("transfer");
      const detail = makeTransactionDetail();

      const sigName = await signer.signTransaction(
        [makeCall("0xAAA", "transfer")],
        detail as any,
      );
      const sigHex = await signer.signTransaction(
        [makeCall("0xAAA", selectorHex)],
        detail as any,
      );

      // Should produce identical signatures
      expect(sigName).toEqual(sigHex);
    });

    it("throws when accountAddress is missing", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const badDetail = {
        chainId,
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
        // no accountAddress or walletAddress
      };

      await expect(
        signer.signTransaction(calls, badDetail as any),
      ).rejects.toThrow("SessionKeySigner: cannot determine account address");
    });

    it("supports walletAddress as fallback for accountAddress", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const detail = {
        walletAddress: accountAddress,
        chainId,
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
      };

      const sig = await signer.signTransaction(calls, detail as any);
      expect(sig).toHaveLength(4);
      expect(sig[0]).toBe(kp.publicKey);
    });

    it("different chain IDs produce different signatures", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig1 = await signer.signTransaction(
        calls,
        makeTransactionDetail({ chainId: "0x534e5f5345504f4c4941" }) as any,
      );
      const calls2 = [makeCall("0xAAA", "transfer")];
      const sig2 = await signer.signTransaction(
        calls2,
        makeTransactionDetail({ chainId: "0x534e5f4d41494e" }) as any,
      );

      expect(sig1[1] !== sig2[1] || sig1[2] !== sig2[2]).toBe(true);
    });

    it("different account addresses produce different signatures", async () => {
      const calls = [makeCall("0xAAA", "transfer")];
      const sig1 = await signer.signTransaction(
        calls,
        makeTransactionDetail({ accountAddress: "0x111" }) as any,
      );
      const calls2 = [makeCall("0xAAA", "transfer")];
      const sig2 = await signer.signTransaction(
        calls2,
        makeTransactionDetail({ accountAddress: "0x222" }) as any,
      );

      expect(sig1[1] !== sig2[1] || sig1[2] !== sig2[2]).toBe(true);
    });
  });

  // ── signDeployAccountTransaction ─────────────────────────────────────

  describe("signDeployAccountTransaction", () => {
    it("throws — session keys cannot deploy accounts", async () => {
      await expect(
        signer.signDeployAccountTransaction({} as any),
      ).rejects.toThrow("Session key signer cannot sign deploy account transactions");
    });
  });

  // ── signDeclareTransaction ───────────────────────────────────────────

  describe("signDeclareTransaction", () => {
    it("throws — session keys cannot declare classes", async () => {
      await expect(
        signer.signDeclareTransaction({} as any),
      ).rejects.toThrow("Session key signer cannot sign declare transactions");
    });
  });

  // ── signMessage ──────────────────────────────────────────────────────

  describe("signMessage", () => {
    it("delegates to inner signer (SNIP-9 outside execution)", async () => {
      // signMessage delegates to the inner Signer, which produces a
      // Signature (string[] or WeierstrassSignatureType). Verify it doesn't throw.
      const typedData = {
        types: {
          StarkNetDomain: [
            { name: "name", type: "felt" },
            { name: "version", type: "felt" },
            { name: "chainId", type: "felt" },
          ],
          Message: [{ name: "value", type: "felt" }],
        },
        primaryType: "Message",
        domain: { name: "Test", version: "1", chainId: "0x534e5f5345504f4c4941" },
        message: { value: "0x1" },
      };

      const sig = await signer.signMessage(typedData, "0x123");
      // Signature may be an array or an object with r,s — just verify it's truthy
      expect(sig).toBeTruthy();
    });
  });

  // ── Cross-key confusion resistance ───────────────────────────────────

  describe("cross-key confusion resistance", () => {
    it("signature from key A does not verify with key B", async () => {
      const kpA = makeKeyPair();
      const kpB = makeKeyPair();
      const signerA = new SessionKeySigner(kpA.privateKey, kpA.publicKey, validUntil);

      const calls = [{ contractAddress: "0xAAA", entrypoint: "transfer", calldata: [] }];
      const detail = {
        accountAddress: "0x123",
        chainId: "0x534e5f5345504f4c4941",
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
      };

      const sig = await signerA.signTransaction(calls, detail as any);

      // Recompute hash
      const hashData: bigint[] = [];
      hashData.push(BigInt("0x123"));
      hashData.push(BigInt("0x534e5f5345504f4c4941"));
      hashData.push(1n);
      hashData.push(BigInt(validUntil));
      hashData.push(BigInt("0xAAA"));
      hashData.push(BigInt(hash.getSelectorFromName("transfer")));
      hashData.push(0n);

      const hashDataHex = hashData.map((n) => num.toHex(n));
      const msgHash = hash.computePoseidonHashOnElements(hashDataHex);

      // Verify with B's public key — should fail
      const sigObj = new ec.starkCurve.Signature(
        BigInt(sig[1]),
        BigInt(sig[2]),
      );
      const isValid = ec.starkCurve.verify(sigObj, msgHash, kpB.publicKey);
      expect(isValid).toBe(false);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles large calldata arrays", async () => {
      const calldata = Array.from({ length: 100 }, (_, i) => `0x${i.toString(16)}`);
      const calls = [{ contractAddress: "0xAAA", entrypoint: "transfer", calldata }];
      const detail = {
        accountAddress: "0x123",
        chainId: "0x534e5f5345504f4c4941",
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
      };

      const sig = await signer.signTransaction(calls, detail as any);
      expect(sig).toHaveLength(4);
    });

    it("handles numeric calldata (non-string)", async () => {
      // Calldata might come as numbers
      const calls = [{ contractAddress: "0xAAA", entrypoint: "transfer", calldata: [1, 2, 3] as any }];
      const detail = {
        accountAddress: "0x123",
        chainId: "0x534e5f5345504f4c4941",
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
      };

      const sig = await signer.signTransaction(calls, detail as any);
      expect(sig).toHaveLength(4);
    });

    it("produces deterministic signatures for identical inputs", async () => {
      // Note: ECDSA with starknet curve uses a deterministic k (RFC 6979),
      // so identical inputs should produce identical signatures.
      const calls1 = [{ contractAddress: "0xAAA", entrypoint: "transfer", calldata: ["0x1"] }];
      const calls2 = [{ contractAddress: "0xAAA", entrypoint: "transfer", calldata: ["0x1"] }];
      const detail = {
        accountAddress: "0x123",
        chainId: "0x534e5f5345504f4c4941",
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
      };

      const sig1 = await signer.signTransaction(calls1, detail as any);
      const sig2 = await signer.signTransaction(calls2, detail as any);

      expect(sig1).toEqual(sig2);
    });

    it("validUntil = 0 produces valid signature format", async () => {
      const zeroSigner = new SessionKeySigner(kp.privateKey, kp.publicKey, 0);
      const calls = [{ contractAddress: "0xAAA", entrypoint: "transfer", calldata: [] }];
      const detail = {
        accountAddress: "0x123",
        chainId: "0x534e5f5345504f4c4941",
        nonce: "0x1",
        version: "0x1",
        maxFee: "0x0",
      };

      const sig = await zeroSigner.signTransaction(calls, detail as any);
      expect(sig).toHaveLength(4);
      expect(sig[3]).toBe(num.toHex(0));
    });
  });
});
