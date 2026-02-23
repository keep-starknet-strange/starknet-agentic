import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { hash, num } from "starknet";

type SessionCall = {
  to: string;
  selector: string;
  calldata: string[];
};

type SessionPayload = {
  accountAddress: string;
  chainId: string;
  nonce: string;
  validUntil: string;
  calls: SessionCall[];
};

type SessionVector = {
  id: string;
  description: string;
  mode: "v1_legacy" | "v2_snip12";
  status: "valid" | "invalid";
  signingPayload: SessionPayload;
  verificationPayload: SessionPayload;
  expected: {
    shouldVerify: boolean;
    signingMessageHash: string;
    verificationMessageHash: string;
    signingDomainHash?: string;
    verificationDomainHash?: string;
    failureCode?: string;
  };
};

const STARKNET_DOMAIN_TYPE_HASH_REV1 =
  "0x1ff2f602e42168014d405a94f75e8a93d640751d71d16311266e140d8b0a210";
const STARKNET_MESSAGE_PREFIX = feltFromAscii("StarkNet Message");
const SESSION_TRANSACTION_LABEL = feltFromAscii("Session.transaction");

function feltFromAscii(value: string): string {
  return `0x${Buffer.from(value, "ascii").toString("hex")}`;
}

function normalizeFelt(value: string | bigint | number): string {
  return num.toHex(BigInt(value));
}

function flattenSessionPayload(payload: SessionPayload): string[] {
  const flattened: string[] = [
    normalizeFelt(payload.accountAddress),
    normalizeFelt(payload.chainId),
    normalizeFelt(payload.nonce),
    normalizeFelt(payload.validUntil),
  ];

  for (const call of payload.calls) {
    flattened.push(normalizeFelt(call.to));
    flattened.push(normalizeFelt(call.selector));
    flattened.push(normalizeFelt(call.calldata.length));
    for (const item of call.calldata) {
      flattened.push(normalizeFelt(item));
    }
  }

  return flattened;
}

function computeV1MessageHash(payload: SessionPayload): string {
  return normalizeFelt(hash.computePoseidonHashOnElements(flattenSessionPayload(payload)));
}

function computeV2Hashes(payload: SessionPayload): { domainHash: string; messageHash: string } {
  const payloadHash = normalizeFelt(hash.computePoseidonHashOnElements(flattenSessionPayload(payload)));
  const domainHash = normalizeFelt(
    hash.computePoseidonHashOnElements([
      STARKNET_DOMAIN_TYPE_HASH_REV1,
      SESSION_TRANSACTION_LABEL,
      normalizeFelt(2),
      normalizeFelt(payload.chainId),
      normalizeFelt(1),
    ]),
  );
  const messageHash = normalizeFelt(
    hash.computePoseidonHashOnElements([
      STARKNET_MESSAGE_PREFIX,
      domainHash,
      normalizeFelt(payload.accountAddress),
      payloadHash,
    ]),
  );
  return { domainHash, messageHash };
}

describe("session signature vectors", () => {
  const vectors = JSON.parse(
    fs.readFileSync(new URL("../../../../spec/session-signature-v2.json", import.meta.url), "utf8"),
  ) as {
    sessionVectors: SessionVector[];
  };

  it("has both v1 and v2 vectors with valid and invalid cases", () => {
    const modes = new Set(vectors.sessionVectors.map((vector) => vector.mode));
    const statuses = new Set(vectors.sessionVectors.map((vector) => vector.status));

    expect(modes.has("v1_legacy")).toBe(true);
    expect(modes.has("v2_snip12")).toBe(true);
    expect(statuses.has("valid")).toBe(true);
    expect(statuses.has("invalid")).toBe(true);
  });

  for (const vector of vectors.sessionVectors) {
    it(`matches conformance vector ${vector.id}`, () => {
      if (vector.mode === "v1_legacy") {
        const signingHash = computeV1MessageHash(vector.signingPayload);
        const verificationHash = computeV1MessageHash(vector.verificationPayload);
        const shouldVerify = signingHash === verificationHash;

        expect(signingHash, `${vector.id}: signing hash mismatch`).toBe(
          normalizeFelt(vector.expected.signingMessageHash),
        );
        expect(verificationHash, `${vector.id}: verification hash mismatch`).toBe(
          normalizeFelt(vector.expected.verificationMessageHash),
        );
        expect(shouldVerify, `${vector.id}: verification expectation mismatch`).toBe(
          vector.expected.shouldVerify,
        );
        return;
      }

      const signing = computeV2Hashes(vector.signingPayload);
      const verification = computeV2Hashes(vector.verificationPayload);
      const shouldVerify = signing.messageHash === verification.messageHash;
      const expectedSigningDomainHash = vector.expected.signingDomainHash;
      const expectedVerificationDomainHash = vector.expected.verificationDomainHash;

      expect(
        expectedSigningDomainHash,
        `${vector.id}: missing expected signingDomainHash for v2 vector`,
      ).toBeDefined();
      expect(
        expectedVerificationDomainHash,
        `${vector.id}: missing expected verificationDomainHash for v2 vector`,
      ).toBeDefined();
      if (!expectedSigningDomainHash || !expectedVerificationDomainHash) {
        return;
      }

      expect(signing.domainHash, `${vector.id}: signing domain hash mismatch`).toBe(
        normalizeFelt(expectedSigningDomainHash),
      );
      expect(verification.domainHash, `${vector.id}: verification domain hash mismatch`).toBe(
        normalizeFelt(expectedVerificationDomainHash),
      );
      expect(signing.messageHash, `${vector.id}: signing hash mismatch`).toBe(
        normalizeFelt(vector.expected.signingMessageHash),
      );
      expect(verification.messageHash, `${vector.id}: verification hash mismatch`).toBe(
        normalizeFelt(vector.expected.verificationMessageHash),
      );
      expect(shouldVerify, `${vector.id}: verification expectation mismatch`).toBe(
        vector.expected.shouldVerify,
      );
    });
  }
});
