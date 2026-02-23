import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// SECURITY REVIEW REQUIRED:
// This module defines KeyringAuthErrorCode outcomes and performs
// signature/HMAC verification via createHmac + timingSafeEqual, plus replay protection.
// Any behavior change here requires explicit human security review sign-off.

export type KeyringAuthErrorCode =
  | "AUTH_INVALID_HMAC"
  | "AUTH_INVALID_CLIENT"
  | "AUTH_TIMESTAMP_SKEW"
  | "AUTH_MTLS_REQUIRED"
  | "REPLAY_NONCE_USED"
  | "POLICY_SELECTOR_DENIED"
  | "POLICY_CALL_NOT_ALLOWED"
  | "RATE_LIMITED"
  | "SIGNER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type KeyringAuthClient = {
  hmacSecret?: string;
  hmacSecrets?: string[];
};

export type KeyringAuthHeaders = Record<string, string | undefined>;

export type KeyringAuthNonceStore = {
  consumeOnce(key: string, ttlSeconds: number, nowMs: number): Promise<boolean>;
};

export type KeyringAuthValidationInput = {
  method: string;
  path: string;
  rawBody: string;
  headers: KeyringAuthHeaders;
  nowMs: number;
  clientsById: Record<string, KeyringAuthClient>;
  requireMtls: boolean;
  isMtlsAuthenticated: boolean;
  timestampMaxAgeMs: number;
  nonceTtlSeconds: number;
  nonceStore: KeyringAuthNonceStore;
};

export type KeyringAuthValidationResult =
  | {
      ok: true;
      clientId: string;
      nonce: string;
      timestampMs: number;
      signingPayload: string;
      replayKey: string;
    }
  | {
      ok: false;
      errorCode: KeyringAuthErrorCode;
      message: string;
    };

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function normalizeHeaders(headers: KeyringAuthHeaders): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") continue;
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function isHex(value: string): boolean {
  return /^[0-9a-fA-F]+$/.test(value);
}

function fail(errorCode: KeyringAuthErrorCode, message: string): KeyringAuthValidationResult {
  return { ok: false, errorCode, message };
}

function constantTimeHexEqual(leftHex: string, rightHex: string): boolean {
  if (leftHex.length !== rightHex.length || leftHex.length % 2 !== 0) {
    return false;
  }
  const left = Buffer.from(leftHex, "hex");
  const right = Buffer.from(rightHex, "hex");
  return timingSafeEqual(left, right);
}

export function buildKeyringSigningPayload(args: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  rawBody: string;
}): string {
  return `${args.timestamp}.${args.nonce}.${args.method.toUpperCase()}.${args.path}.${sha256Hex(args.rawBody)}`;
}

export class InMemoryNonceStore implements KeyringAuthNonceStore {
  // This in-process store is for local/dev use only.
  // Multi-instance production deployments must use an external atomic store
  // (for example Redis SET NX EX) to avoid replay races across workers.
  private readonly nonceExpirations = new Map<string, number>();
  private readonly cleanupEvery: number;
  private consumeCount = 0;

  constructor(cleanupEvery = 100) {
    this.cleanupEvery = Math.max(1, cleanupEvery);
  }

  async consumeOnce(key: string, ttlSeconds: number, nowMs: number): Promise<boolean> {
    const existingExpiration = this.nonceExpirations.get(key);
    if (existingExpiration !== undefined && existingExpiration > nowMs) {
      return false;
    }

    this.consumeCount += 1;
    if (this.consumeCount % this.cleanupEvery === 0) {
      for (const [storedKey, expiresAt] of this.nonceExpirations.entries()) {
        if (expiresAt <= nowMs) {
          this.nonceExpirations.delete(storedKey);
        }
      }
    }

    const ttlMs = Math.max(1, ttlSeconds) * 1000;
    this.nonceExpirations.set(key, nowMs + ttlMs);
    return true;
  }
}

export async function validateKeyringRequestAuth(
  input: KeyringAuthValidationInput
): Promise<KeyringAuthValidationResult> {
  const headers = normalizeHeaders(input.headers);

  const clientId = headers["x-keyring-client-id"]?.trim() ?? "";
  if (!clientId) {
    return fail("AUTH_INVALID_CLIENT", "Missing X-Keyring-Client-Id");
  }
  const client = input.clientsById[clientId];
  const clientSecrets = (
    client
      ? [
          ...(Array.isArray(client.hmacSecrets) ? client.hmacSecrets : []),
          ...(client.hmacSecret ? [client.hmacSecret] : []),
        ]
      : []
  ).filter((secret) => typeof secret === "string" && secret.length > 0);
  const uniqueClientSecrets = [...new Set(clientSecrets)];

  if (!client || uniqueClientSecrets.length === 0) {
    return fail("AUTH_INVALID_CLIENT", "Unknown keyring client");
  }

  if (input.requireMtls && !input.isMtlsAuthenticated) {
    return fail("AUTH_MTLS_REQUIRED", "mTLS client authentication is required");
  }

  const timestampRaw = headers["x-keyring-timestamp"]?.trim() ?? "";
  const nonce = headers["x-keyring-nonce"]?.trim() ?? "";
  const signatureRaw = headers["x-keyring-signature"]?.trim() ?? "";

  if (!timestampRaw || !/^[0-9]+$/.test(timestampRaw)) {
    return fail("AUTH_TIMESTAMP_SKEW", "Invalid X-Keyring-Timestamp");
  }
  const timestampMs = Number(timestampRaw);
  if (!Number.isSafeInteger(timestampMs)) {
    return fail("AUTH_TIMESTAMP_SKEW", "Invalid X-Keyring-Timestamp");
  }

  const skew = Math.abs(input.nowMs - timestampMs);
  if (skew > input.timestampMaxAgeMs) {
    return fail("AUTH_TIMESTAMP_SKEW", "Timestamp outside allowed drift window");
  }

  if (!nonce || nonce.length === 0 || nonce.length > 256) {
    return fail("AUTH_INVALID_HMAC", "Invalid X-Keyring-Nonce");
  }
  if (!signatureRaw || !isHex(signatureRaw)) {
    return fail("AUTH_INVALID_HMAC", "Invalid X-Keyring-Signature");
  }

  const signingPayload = buildKeyringSigningPayload({
    timestamp: timestampRaw,
    nonce,
    method: input.method,
    path: input.path,
    rawBody: input.rawBody,
  });
  const suppliedSignature = signatureRaw.toLowerCase();
  const HMAC_COMPARE_FLOOR = 4;
  const compareCount = Math.max(HMAC_COMPARE_FLOOR, clientSecrets.length, uniqueClientSecrets.length);
  let hmacMatched = false;
  for (let i = 0; i < compareCount; i += 1) {
    const secret = uniqueClientSecrets[i] ?? "__keyring_dummy_secret__";
    const expectedSignature = createHmac("sha256", secret).update(signingPayload).digest("hex");
    hmacMatched = hmacMatched || constantTimeHexEqual(suppliedSignature, expectedSignature);
  }
  if (!hmacMatched) {
    return fail("AUTH_INVALID_HMAC", "HMAC verification failed");
  }

  const replayKey = JSON.stringify([clientId, nonce]);
  try {
    const firstUse = await input.nonceStore.consumeOnce(
      replayKey,
      input.nonceTtlSeconds,
      input.nowMs
    );
    if (!firstUse) {
      return fail("REPLAY_NONCE_USED", "Nonce already consumed");
    }
  } catch (error) {
    return fail(
      "INTERNAL_ERROR",
      `Replay protection store failure: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return {
    ok: true,
    clientId,
    nonce,
    timestampMs,
    signingPayload,
    replayKey,
  };
}
