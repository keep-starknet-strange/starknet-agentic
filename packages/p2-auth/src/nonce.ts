import type { SISNANonce, NonceStore } from "./types.js";

/** Generate a cryptographically secure random nonce */
export function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create a nonce with current timestamp and configured TTL */
export function createNonce(ttlSeconds: number): SISNANonce {
  const now = Math.floor(Date.now() / 1000);
  return {
    nonce: generateNonce(),
    issuedAt: now,
    expiresAt: now + ttlSeconds,
  };
}

/** Check if a nonce is still valid */
export function isNonceValid(nonce: SISNANonce): boolean {
  return Date.now() / 1000 < nonce.expiresAt;
}

/** In-memory nonce store implementation */
export class InMemoryNonceStore implements NonceStore {
  private store = new Map<string, SISNANonce>();

  get(nonce: string): SISNANonce | null {
    return this.store.get(nonce) ?? null;
  }

  set(nonce: string, data: SISNANonce): void {
    this.store.set(nonce, data);
  }

  invalidate(nonce: string): void {
    this.store.delete(nonce);
  }

  cleanup(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, val] of this.store.entries()) {
      if (val.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
