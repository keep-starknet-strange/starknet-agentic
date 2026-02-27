import { createHmac } from "node:crypto";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  InMemoryNonceStore,
  buildKeyringSigningPayload,
  validateKeyringRequestAuth,
  type KeyringAuthErrorCode,
} from "../../src/helpers/keyringAuthContract.js";

type AuthVectorDoc = {
  defaults: {
    method: string;
    path: string;
    nowMs: number;
    timestampMaxAgeMs: number;
    nonceTtlSeconds: number;
    requireMtls: boolean;
  };
  vectors: Array<{
    id: string;
    clientsById: Record<string, { hmacSecrets: string[] }>;
    steps: Array<{
      clientId: string;
      timestamp: string;
      nonce: string;
      rawBody: string;
      isMtlsAuthenticated: boolean;
      signWithSecret: string;
      overrideSignature?: string;
      method?: string;
      path?: string;
      expect: { ok: boolean; errorCode?: KeyringAuthErrorCode };
    }>;
  }>;
};

const vectors = JSON.parse(
  fs.readFileSync(new URL("../../../../spec/signer-auth-v1.json", import.meta.url), "utf8")
) as AuthVectorDoc;

describe("signer auth conformance vectors", () => {
  for (const vector of vectors.vectors) {
    it(vector.id, async () => {
      const nonceStore = new InMemoryNonceStore();
      let stepIndex = 0;
      for (const step of vector.steps) {
        const method = step.method ?? vectors.defaults.method;
        const path = step.path ?? vectors.defaults.path;
        const payload = buildKeyringSigningPayload({
          timestamp: step.timestamp,
          nonce: step.nonce,
          method,
          path,
          rawBody: step.rawBody,
        });
        const signature =
          step.overrideSignature ??
          createHmac("sha256", step.signWithSecret).update(payload).digest("hex");

        const result = await validateKeyringRequestAuth({
          method,
          path,
          rawBody: step.rawBody,
          headers: {
            "x-keyring-client-id": step.clientId,
            "x-keyring-timestamp": step.timestamp,
            "x-keyring-nonce": step.nonce,
            "x-keyring-signature": signature,
          },
          nowMs: vectors.defaults.nowMs,
          clientsById: vector.clientsById,
          requireMtls: vectors.defaults.requireMtls,
          isMtlsAuthenticated: step.isMtlsAuthenticated,
          timestampMaxAgeMs: vectors.defaults.timestampMaxAgeMs,
          nonceTtlSeconds: vectors.defaults.nonceTtlSeconds,
          nonceStore,
        });

        if (step.expect.ok) {
          expect(result.ok, `${vector.id} step ${stepIndex} expected success`).toBe(true);
        } else {
          expect(result.ok, `${vector.id} step ${stepIndex} expected failure`).toBe(false);
          if (!result.ok) {
            expect(result.errorCode, `${vector.id} step ${stepIndex} errorCode`).toBe(
              step.expect.errorCode
            );
          }
        }

        stepIndex += 1;
      }
    });
  }
});
