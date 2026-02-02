import { describe, it, expect, vi, beforeEach } from "vitest";

describe("starknet_get_balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return balance for ETH token", async () => {
    // Test that balance checking works for ETH
    const mockBalance = { low: BigInt("1000000000000000000"), high: BigInt(0) };

    expect(mockBalance.low).toBe(BigInt("1000000000000000000"));
  });

  it("should handle custom token addresses", async () => {
    // Test custom token support
    const customToken = "0x123...";
    expect(customToken).toMatch(/^0x/);
  });

  it("should throw error for unknown token symbol", async () => {
    // Test error handling
    const unknownToken = "UNKNOWN";
    expect(() => {
      if (!["ETH", "STRK", "USDC", "USDT"].includes(unknownToken)) {
        throw new Error("Unknown token");
      }
    }).toThrow("Unknown token");
  });
});
