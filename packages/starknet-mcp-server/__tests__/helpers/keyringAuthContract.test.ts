import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  InMemoryNonceStore,
  buildKeyringSigningPayload,
  validateKeyringRequestAuth,
} from "../../src/helpers/keyringAuthContract.js";

function sign(args: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  rawBody: string;
  secret: string;
}): string {
  const payload = buildKeyringSigningPayload({
    timestamp: args.timestamp,
    nonce: args.nonce,
    method: args.method,
    path: args.path,
    rawBody: args.rawBody,
  });
  return createHmac("sha256", args.secret).update(payload).digest("hex");
}

describe("keyring auth contract", () => {
  it("accepts valid HMAC + mTLS and rejects replayed nonces", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 250);
    const nonce = "nonce-000000000001";

    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const nonceStore = new InMemoryNonceStore();
    const headers = {
      "x-keyring-client-id": "mcp-tests",
      "x-keyring-timestamp": timestamp,
      "x-keyring-nonce": nonce,
      "x-keyring-signature": signature,
    };

    const first = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers,
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: true,
      isMtlsAuthenticated: true,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore,
    });
    expect(first.ok).toBe(true);

    const replay = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers,
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: true,
      isMtlsAuthenticated: true,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.errorCode).toBe("REPLAY_NONCE_USED");
    }
  });

  it("rejects stale timestamps", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 90_000);
    const nonce = "nonce-000000000002";

    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_TIMESTAMP_SKEW");
    }
  });

  it("accepts future timestamps within allowed skew bounds", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs + 30_000);
    const nonce = "nonce-future-valid";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects unknown client ids", async () => {
    const nowMs = 1_770_984_000_000;
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-unknown-client";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret: "super-secret",
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "missing-client",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: "super-secret" } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_CLIENT");
    }
  });

  it("fails closed on mTLS before evaluating client existence", async () => {
    const nowMs = 1_770_984_000_000;
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-mtls-before-client";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret: "super-secret",
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "missing-client",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: "super-secret" } },
      requireMtls: true,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_MTLS_REQUIRED");
    }
  });

  it("rejects invalid signatures", async () => {
    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody: JSON.stringify({ ok: true }),
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": "1770984000000",
        "x-keyring-nonce": "nonce-000000000003",
        "x-keyring-signature": "deadbeef",
      },
      nowMs: 1_770_984_000_000,
      clientsById: { "mcp-tests": { hmacSecret: "super-secret" } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_HMAC");
    }
  });

  it("rejects malformed signature header formats", async () => {
    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody: JSON.stringify({ ok: true }),
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": "1770984000000",
        "x-keyring-nonce": "nonce-003-format",
        "x-keyring-signature": "not-hex-signature",
      },
      nowMs: 1_770_984_000_000,
      clientsById: { "mcp-tests": { hmacSecret: "super-secret" } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_SIGNATURE_FORMAT");
    }
  });

  it("rejects signatures computed with the public dummy padding secret", async () => {
    const nowMs = 1_770_984_000_000;
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-dummy-attack";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret: "__keyring_dummy_secret__",
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: "real-secret" } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_HMAC");
    }
  });

  it("accepts requests signed with an active rotated secret", async () => {
    const nowMs = 1_770_984_000_000;
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-rotated-0001";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret: "next-secret",
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: {
        "mcp-tests": { hmacSecrets: ["current-secret", "next-secret"] },
      },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(true);
  });

  it("accepts duplicated rotated secrets without false negatives", async () => {
    const nowMs = 1_770_984_000_000;
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-rotated-dupe";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret: "next-secret",
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: {
        "mcp-tests": { hmacSecrets: ["current-secret", "next-secret", "next-secret"] },
      },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects empty nonces", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_NONCE");
    }
  });

  it("rejects nonces shorter than 16 characters", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-short-001";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_NONCE");
    }
  });

  it("rejects nonces longer than 256 chars", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "n".repeat(257);
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_NONCE");
    }
  });

  it("rejects nonces whose UTF-8 byte length exceeds 256 bytes", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "\u{1F680}".repeat(80);
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_NONCE");
    }
  });

  it("rejects nonces containing the payload delimiter", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce.with.dot.0001";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_INVALID_NONCE");
    }
  });

  it("fails closed with INTERNAL_ERROR when nonce store throws", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-store-throws";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const throwingNonceStore = {
      consumeOnce: async () => {
        throw new Error("nonce backend unavailable");
      },
    };

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: throwingNonceStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("INTERNAL_ERROR");
    }
    expect(consoleSpy).toHaveBeenCalledWith(
      "Replay protection store failure",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });

  it("does not collide replay keys for delimiter-like client/nonce pairs", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "shared-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonceStore = new InMemoryNonceStore();

    const headersA = {
      "x-keyring-client-id": "a:b",
      "x-keyring-timestamp": timestamp,
      "x-keyring-nonce": "clienta:nonce:0001",
      "x-keyring-signature": sign({
        timestamp,
        nonce: "clienta:nonce:0001",
        method: "POST",
        path: "/v1/sign/session-transaction",
        rawBody,
        secret,
      }),
    };

    const headersB = {
      "x-keyring-client-id": "a",
      "x-keyring-timestamp": timestamp,
      "x-keyring-nonce": "client:b:nonce:0002",
      "x-keyring-signature": sign({
        timestamp,
        nonce: "client:b:nonce:0002",
        method: "POST",
        path: "/v1/sign/session-transaction",
        rawBody,
        secret,
      }),
    };

    const first = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: headersA,
      nowMs,
      clientsById: {
        "a:b": { hmacSecret: secret },
        a: { hmacSecret: secret },
      },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore,
    });

    const second = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: headersB,
      nowMs,
      clientsById: {
        "a:b": { hmacSecret: secret },
        a: { hmacSecret: secret },
      },
      requireMtls: false,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });

  it("fails closed when mTLS is required but unavailable", async () => {
    const nowMs = 1_770_984_000_000;
    const secret = "super-secret";
    const rawBody = JSON.stringify({ ok: true });
    const timestamp = String(nowMs - 100);
    const nonce = "nonce-000000000004";
    const signature = sign({
      timestamp,
      nonce,
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      secret,
    });

    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody,
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": timestamp,
        "x-keyring-nonce": nonce,
        "x-keyring-signature": signature,
      },
      nowMs,
      clientsById: { "mcp-tests": { hmacSecret: secret } },
      requireMtls: true,
      isMtlsAuthenticated: false,
      timestampMaxAgeMs: 60_000,
      nonceTtlSeconds: 120,
      nonceStore: new InMemoryNonceStore(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("AUTH_MTLS_REQUIRED");
    }
  });

  it("expires nonces after TTL in in-memory replay store", async () => {
    const nonceStore = new InMemoryNonceStore();
    expect(await nonceStore.consumeOnce("mcp-tests:nonce-ttl", 2, 1_000)).toBe(true);
    expect(await nonceStore.consumeOnce("mcp-tests:nonce-ttl", 2, 2_500)).toBe(false);
    expect(await nonceStore.consumeOnce("mcp-tests:nonce-ttl", 2, 4_001)).toBe(true);
  });
});
