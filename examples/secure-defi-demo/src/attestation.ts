import { createHash, createPublicKey, verify } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { DemoArtifact } from "./types.js";

const BaseAttestationSigningSchema = z.object({
  algorithm: z.literal("ed25519"),
  publicKeyPem: z.string().min(1),
  signatureBase64: z.string().min(1),
});

const BaseAttestationEnvelopeSchema = z.object({
  version: z.literal("1"),
  issuer: z.string().min(1),
  issuedAt: z.string().datetime(),
  subject: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  signing: BaseAttestationSigningSchema,
});

type BaseAttestationEnvelope = z.infer<typeof BaseAttestationEnvelopeSchema>;

function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Attestation contains non-finite number");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  throw new Error(`Unsupported attestation value type: ${typeof value}`);
}

function decodeBase64(label: string, value: string): Buffer {
  const normalized = value
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error(`${label} is not valid base64`);
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) {
    throw new Error(`${label} is not valid base64`);
  }
  return decoded;
}

function buildSignedMessage(envelope: BaseAttestationEnvelope): Buffer {
  const signedPayload = {
    version: envelope.version,
    issuer: envelope.issuer,
    issuedAt: envelope.issuedAt,
    subject: envelope.subject,
    payload: envelope.payload,
  };
  return Buffer.from(canonicalize(signedPayload), "utf8");
}

export function loadAndVerifyBaseAttestation(
  filePath: string,
): NonNullable<DemoArtifact["baseAttestation"]> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Base attestation file not found: ${absolutePath}`);
  }

  let raw: Buffer;
  try {
    raw = fs.readFileSync(absolutePath);
  } catch (error) {
    throw new Error(
      `Failed to read base attestation file at ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const envelope = BaseAttestationEnvelopeSchema.parse(
    JSON.parse(raw.toString("utf8")) as unknown,
  );
  const message = buildSignedMessage(envelope);
  const signature = decodeBase64("signing.signatureBase64", envelope.signing.signatureBase64);

  let publicKey;
  try {
    publicKey = createPublicKey(envelope.signing.publicKeyPem);
  } catch (error) {
    throw new Error(
      `Invalid signing.publicKeyPem: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const signatureValid = verify(null, message, publicKey, signature);
  if (!signatureValid) {
    throw new Error("Base attestation signature verification failed");
  }

  const exported = publicKey.export({ type: "spki", format: "der" });
  const publicKeyFingerprint = createHash("sha256").update(exported).digest("hex");

  return {
    path: absolutePath,
    sha256: createHash("sha256").update(raw).digest("hex"),
    schemaVersion: envelope.version,
    issuer: envelope.issuer,
    subject: envelope.subject,
    issuedAt: envelope.issuedAt,
    algorithm: envelope.signing.algorithm,
    payloadSha256: createHash("sha256").update(canonicalize(envelope.payload)).digest("hex"),
    publicKeyFingerprint,
    verified: true,
  };
}
