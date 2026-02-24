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
    const nonce = "nonce-001";

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
    const nonce = "nonce-002";

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

  it("rejects invalid signatures", async () => {
    const result = await validateKeyringRequestAuth({
      method: "POST",
      path: "/v1/sign/session-transaction",
      rawBody: JSON.stringify({ ok: true }),
      headers: {
        "x-keyring-client-id": "mcp-tests",
        "x-keyring-timestamp": "1770984000000",
        "x-keyring-nonce": "nonce-003",
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
    const nonce = "nonce-rotated";
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
      expect(result.errorCode).toBe("AUTH_INVALID_HMAC");
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
      expect(result.errorCode).toBe("AUTH_INVALID_HMAC");
    }
  });

  it("fails closed with INTERNAL_ERROR when nonce store throws", async () => {
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
      "x-keyring-nonce": "c:d",
      "x-keyring-signature": sign({
        timestamp,
        nonce: "c:d",
        method: "POST",
        path: "/v1/sign/session-transaction",
        rawBody,
        secret,
      }),
    };

    const headersB = {
      "x-keyring-client-id": "a",
      "x-keyring-timestamp": timestamp,
      "x-keyring-nonce": "b:c:d",
      "x-keyring-signature": sign({
        timestamp,
        nonce: "b:c:d",
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
    const nonce = "nonce-004";
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
