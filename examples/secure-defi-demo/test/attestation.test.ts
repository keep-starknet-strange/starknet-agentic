import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadAndVerifyBaseAttestation } from "../src/attestation.js";

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
}

function writeAttestationFile(
  payload: Record<string, unknown>,
  overrideSignature?: string,
): string {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const unsigned = {
    version: "1" as const,
    issuer: "base-agent-registry",
    issuedAt: "2026-03-04T12:00:00.000Z",
    subject: "0xabc123",
    payload,
  };
  const message = Buffer.from(canonicalize(unsigned), "utf8");
  const signature = sign(null, message, privateKey).toString("base64");

  const full = {
    ...unsigned,
    signing: {
      algorithm: "ed25519" as const,
      publicKeyPem,
      signatureBase64: overrideSignature ?? signature,
    },
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "secure-defi-attestation-"));
  const filePath = path.join(tempDir, "base-attestation.json");
  fs.writeFileSync(filePath, JSON.stringify(full, null, 2), "utf8");
  return filePath;
}

test("loadAndVerifyBaseAttestation validates a signed envelope", () => {
  const filePath = writeAttestationFile({ reputationScore: 99, attestations: ["base"] });
  const result = loadAndVerifyBaseAttestation(filePath);

  assert.equal(result.schemaVersion, "1");
  assert.equal(result.algorithm, "ed25519");
  assert.equal(result.verified, true);
  assert.equal(result.subject, "0xabc123");
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.payloadSha256, /^[a-f0-9]{64}$/);
  assert.match(result.publicKeyFingerprint, /^[a-f0-9]{64}$/);
});

test("loadAndVerifyBaseAttestation rejects invalid signature", () => {
  const filePath = writeAttestationFile({ reputationScore: 80 }, "ZmFrZV9zaWduYXR1cmU=");
  assert.throws(
    () => loadAndVerifyBaseAttestation(filePath),
    /Base attestation signature verification failed/,
  );
});
