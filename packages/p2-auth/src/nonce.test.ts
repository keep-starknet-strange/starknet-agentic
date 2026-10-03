import { describe, it, expect, beforeEach } from "vitest";
import {
  generateNonce,
  createNonce,
  isNonceValid,
  InMemoryNonceStore,
} from "./nonce.js";
import type { SISNANonce } from "./types.js";

describe("generateNonce", () => {
  it("produces a 64-char hex string", () => {
    const nonce = generateNonce();
    expect(nonce).toHaveLength(64);
    expect(nonce).toMatch(/^0x?[0-9a-f]{64}$/);
  });

  it("produces unique nonces", () => {
    const n1 = generateNonce();
    const n2 = generateNonce();
    expect(n1).not.toBe(n2);
  });
});

describe("createNonce", () => {
  it("returns a nonce with valid expiry", () => {
    const nonce = createNonce(300);
    expect(nonce.nonce).toHaveLength(64);
    expect(nonce.expiresAt).toBeGreaterThan(nonce.issuedAt);
    expect(nonce.expiresAt - nonce.issuedAt).toBe(300);
  });

  it("creates valid nonce by default", () => {
    const nonce = createNonce(300);
    expect(isNonceValid(nonce)).toBe(true);
  });
});

describe("InMemoryNonceStore", () => {
  let store: InMemoryNonceStore;

  beforeEach(() => {
    store = new InMemoryNonceStore();
  });

  it("stores and retrieves a nonce", () => {
    const nonce: SISNANonce = createNonce(300);
    store.set(nonce.nonce, nonce);
    expect(store.get(nonce.nonce)).toEqual(nonce);
  });

  it("returns null for unknown nonce", () => {
    expect(store.get("nonexistent")).toBeNull();
  });

  it("invalidates a nonce", () => {
    const nonce: SISNANonce = createNonce(300);
    store.set(nonce.nonce, nonce);
    store.invalidate(nonce.nonce);
    expect(store.get(nonce.nonce)).toBeNull();
  });

  it("cleans up expired nonces", () => {
    const expired: SISNANonce = {
      nonce: "expired",
      issuedAt: Math.floor(Date.now() / 1000) - 600,
      expiresAt: Math.floor(Date.now() / 1000) - 300,
    };
    const valid: SISNANonce = createNonce(300);
    store.set(expired.nonce, expired);
    store.set(valid.nonce, valid);
    store.cleanup();
    expect(store.get(expired.nonce)).toBeNull();
    expect(store.get(valid.nonce)).toEqual(valid);
  });
});
