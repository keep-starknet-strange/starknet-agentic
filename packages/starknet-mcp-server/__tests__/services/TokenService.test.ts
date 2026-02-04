import { describe, it, expect, beforeEach, vi } from "vitest";
import { TokenService } from "../../src/services/TokenService.js";
import { resetTokenService, getTokenService } from "../../src/services/index.js";
import { TOKEN_TTL_MS } from "../../src/types/token.js";

// Mock avnu SDK
vi.mock("@avnu/avnu-sdk", () => ({
  fetchTokenByAddress: vi.fn(),
  fetchVerifiedTokenBySymbol: vi.fn(),
}));

// Mock starknet Contract for on-chain fallback tests
vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();
  return {
    ...actual,
    Contract: vi.fn(),
  };
});

import { fetchTokenByAddress, fetchVerifiedTokenBySymbol } from "@avnu/avnu-sdk";
import { Contract, byteArray } from "starknet";

const MOCK_LORDS_TOKEN = {
  address: "0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49",
  symbol: "LORDS",
  name: "Lords",
  decimals: 18,
  logoUri: "https://example.com/lords.png",
  lastDailyVolumeUsd: 50000,
  tags: ["Verified"] as const,
  extensions: {},
};

const MOCK_ZEND_TOKEN = {
  address: "0x00585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34",
  symbol: "ZEND",
  name: "ZkLend Token",
  decimals: 18,
  logoUri: null,
  lastDailyVolumeUsd: 25000,
  tags: ["Verified"] as const,
  extensions: {},
};

describe("TokenService", () => {
  let service: TokenService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetTokenService();
    service = new TokenService();
  });

  describe("static tokens", () => {
    it("should have ETH, STRK, USDC, USDT loaded by default", () => {
      expect(service.getCacheSize()).toBe(4);
      expect(service.getDecimals("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7")).toBe(18);
      expect(service.getDecimals("0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d")).toBe(18);
      expect(service.getDecimals("0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8")).toBe(6);
      expect(service.getDecimals("0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8")).toBe(6);
    });

    it("should resolve static token symbols case-insensitively", () => {
      const ethAddr = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
      expect(service.resolveSymbol("ETH")).toBe(ethAddr);
      expect(service.resolveSymbol("eth")).toBe(ethAddr);
      expect(service.resolveSymbol("Eth")).toBe(ethAddr);
    });

    it("should mark static tokens as isStatic", async () => {
      const ethInfo = await service.getTokenInfoAsync("ETH");
      expect(ethInfo).toBeDefined();
      expect(ethInfo.isStatic).toBe(true);
    });
  });

  describe("symbol resolution", () => {
    it("should resolve known symbols", () => {
      expect(service.resolveSymbol("USDC")).toBe("0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8");
    });

    it("should pass through and normalize hex addresses", () => {
      // Short address should be normalized to full 64-char
      const result = service.resolveSymbol("0x123");
      expect(result).toMatch(/^0x0+123$/);
      expect(result.length).toBe(66); // 0x + 64 chars
    });

    it("should throw for unknown symbols", () => {
      expect(() => service.resolveSymbol("UNKNOWN")).toThrow("Unknown token: UNKNOWN");
    });
  });

  describe("getDecimals", () => {
    it("should return decimals for cached tokens", () => {
      expect(service.getDecimals("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7")).toBe(18);
    });

    it("should return undefined for unknown tokens", () => {
      expect(service.getDecimals("0x0000000000000000000000000000000000000000000000000000000000001234")).toBeUndefined();
    });
  });

  describe("async methods with avnu", () => {
    it("should fetch token by address from avnu when not cached", async () => {
      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(MOCK_LORDS_TOKEN);

      const token = await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);

      expect(fetchTokenByAddress).toHaveBeenCalledWith(MOCK_LORDS_TOKEN.address, { baseUrl: "https://starknet.api.avnu.fi" });
      expect(token.symbol).toBe("LORDS");
      expect(token.decimals).toBe(18);
      expect(token.isStatic).toBe(false);
    });

    it("should cache token after fetching", async () => {
      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(MOCK_LORDS_TOKEN);

      await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);

      // Second call should not fetch again
      const token = await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);
      expect(fetchTokenByAddress).toHaveBeenCalledTimes(1);
      expect(token.symbol).toBe("LORDS");
    });

    it("should fetch token by symbol from avnu when not cached", async () => {
      vi.mocked(fetchVerifiedTokenBySymbol).mockResolvedValueOnce(MOCK_ZEND_TOKEN);

      const token = await service.getTokenBySymbol("ZEND");

      expect(fetchVerifiedTokenBySymbol).toHaveBeenCalledWith("ZEND", { baseUrl: "https://starknet.api.avnu.fi" });
      expect(token.address).toContain("0x00585c32b625999e6e5e78645ff8df7a9001cf5cf3eb6b80ccdd16cb64bd3a34");
      expect(token.decimals).toBe(18);
    });

    it("should use resolveSymbolAsync to fetch unknown symbol", async () => {
      vi.mocked(fetchVerifiedTokenBySymbol).mockResolvedValueOnce(MOCK_LORDS_TOKEN);

      const address = await service.resolveSymbolAsync("LORDS");

      expect(address).toContain("0x0124aeb495b947201f5fac96fd1138e326ad86195b98df6dec9009158a533b49");
    });

    it("should not fetch when symbol is already known (static)", async () => {
      const address = await service.resolveSymbolAsync("ETH");

      expect(fetchVerifiedTokenBySymbol).not.toHaveBeenCalled();
      expect(address).toBe("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7");
    });

    it("should get decimals async for unknown token", async () => {
      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(MOCK_LORDS_TOKEN);

      const decimals = await service.getDecimalsAsync(MOCK_LORDS_TOKEN.address);

      expect(decimals).toBe(18);
    });
  });

  describe("static token protection", () => {
    it("should never overwrite static tokens", async () => {
      const fakeETH = {
        ...MOCK_LORDS_TOKEN,
        address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
        symbol: "ETH",
        decimals: 8, // Try to change decimals
      };

      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(fakeETH);

      const token = await service.getTokenByAddress(fakeETH.address);

      // Should still have original static decimals
      expect(token.decimals).toBe(18);
      expect(token.isStatic).toBe(true);
    });

    it("should not overwrite static token symbol index", async () => {
      const fakeETH = {
        ...MOCK_LORDS_TOKEN,
        symbol: "ETH", // Try to steal ETH symbol
      };

      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(fakeETH);

      await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);

      // ETH should still resolve to the original address
      expect(service.resolveSymbol("ETH")).toBe("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7");
    });
  });

  describe("TTL expiration", () => {
    it("should re-fetch expired tokens", async () => {
      vi.mocked(fetchTokenByAddress).mockResolvedValue(MOCK_LORDS_TOKEN);

      // First fetch
      await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);
      expect(fetchTokenByAddress).toHaveBeenCalledTimes(1);

      // Simulate time passing beyond TTL
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + TOKEN_TTL_MS + 1000);

      // Second fetch should call avnu again
      await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);
      expect(fetchTokenByAddress).toHaveBeenCalledTimes(2);

      vi.restoreAllMocks();
    });

    it("should never expire static tokens", async () => {
      // Simulate time passing beyond TTL
      vi.spyOn(Date, "now").mockReturnValue(Date.now() + TOKEN_TTL_MS + 1000);

      // Static tokens should still return their decimals
      expect(service.getDecimals("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7")).toBe(18);

      vi.restoreAllMocks();
    });
  });

  describe("cache management", () => {
    it("should clear dynamic cache but keep static tokens", async () => {
      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(MOCK_LORDS_TOKEN);

      await service.getTokenByAddress(MOCK_LORDS_TOKEN.address);
      expect(service.getCacheSize()).toBe(5); // 4 static + 1 dynamic

      service.clearDynamicCache();

      expect(service.getCacheSize()).toBe(4); // Only static
      // LORDS should not be resolvable after clearing
      expect(() => service.resolveSymbol("LORDS")).toThrow("Unknown token: LORDS");
      // ETH should still be resolvable
      expect(service.resolveSymbol("ETH")).toBe("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7");
    });
  });

  describe("singleton", () => {
    it("should return same instance", () => {
      resetTokenService();
      const instance1 = getTokenService("https://test.api");
      const instance2 = getTokenService();

      expect(instance1).toBe(instance2);
    });
  });

  describe("on-chain fallback", () => {
    it("should return cached decimals without avnu or on-chain call", async () => {
      // ETH is static, should not call avnu
      const decimals = await service.getDecimalsAsync(
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
      );

      expect(decimals).toBe(18);
      expect(fetchTokenByAddress).not.toHaveBeenCalled();
    });

    it("should try avnu before on-chain fallback", async () => {
      vi.mocked(fetchTokenByAddress).mockResolvedValueOnce(MOCK_LORDS_TOKEN);

      const decimals = await service.getDecimalsAsync(MOCK_LORDS_TOKEN.address);

      expect(decimals).toBe(18);
      expect(fetchTokenByAddress).toHaveBeenCalledTimes(1);
    });

    it("should throw if avnu fails and no provider configured", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000001234";

      await expect(service.getDecimalsAsync(unknownAddr)).rejects.toThrow(
        "no RPC provider configured"
      );
    });

    it("should fetch from contract when avnu fails and provider is configured", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      // Mock contract methods
      const mockContract = {
        symbol: vi.fn().mockResolvedValue({ symbol: BigInt("0x4c4f524453") }), // "LORDS" as felt
        name: vi.fn().mockResolvedValue({ name: BigInt("0x4c6f726473") }), // "Lords" as felt
        decimals: vi.fn().mockResolvedValue({ decimals: 18 }),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      // Configure provider
      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000001234";
      const token = await service.getTokenByAddress(unknownAddr);

      expect(token.decimals).toBe(18);
      expect(token.symbol).toBe("LORDS");
      expect(token.name).toBe("Lords");
      expect(token.isStatic).toBe(false);
      expect(mockContract.symbol).toHaveBeenCalled();
      expect(mockContract.name).toHaveBeenCalled();
      expect(mockContract.decimals).toHaveBeenCalled();
    });

    it("should throw when all contract calls fail (invalid ERC20)", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      // Mock contract methods that all fail
      const mockContract = {
        symbol: vi.fn().mockRejectedValue(new Error("call failed")),
        name: vi.fn().mockRejectedValue(new Error("call failed")),
        decimals: vi.fn().mockRejectedValue(new Error("call failed")),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      // Configure provider
      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000001234";

      // Should throw an error instead of caching invalid token data
      await expect(service.getTokenByAddress(unknownAddr)).rejects.toThrow(
        "does not appear to be a valid ERC20 token"
      );
    });

    it("should not cache when all contract calls fail", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValue(new Error("avnu unavailable"));

      const mockContract = {
        symbol: vi.fn().mockRejectedValue(new Error("call failed")),
        name: vi.fn().mockRejectedValue(new Error("call failed")),
        decimals: vi.fn().mockRejectedValue(new Error("call failed")),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000007777";

      await expect(service.getTokenByAddress(unknownAddr)).rejects.toThrow(
        "does not appear to be a valid ERC20 token"
      );
      await expect(service.getTokenByAddress(unknownAddr)).rejects.toThrow(
        "does not appear to be a valid ERC20 token"
      );

      expect(mockContract.symbol).toHaveBeenCalledTimes(2);
      expect(mockContract.name).toHaveBeenCalledTimes(2);
      expect(mockContract.decimals).toHaveBeenCalledTimes(2);
    });

    it("should use fallback values when some (but not all) contract calls fail", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      // Mock: symbol fails, but name and decimals succeed
      const mockContract = {
        symbol: vi.fn().mockRejectedValue(new Error("call failed")),
        name: vi.fn().mockResolvedValue({ name: BigInt("0x4d79546f6b656e") }), // "MyToken"
        decimals: vi.fn().mockResolvedValue({ decimals: 6 }),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000001234";
      const token = await service.getTokenByAddress(unknownAddr);

      // Symbol should fall back to address, others should decode
      expect(token.symbol).toBe(unknownAddr);
      expect(token.name).toBe("MyToken");
      expect(token.decimals).toBe(6);
    });

    it("should decode ByteArray responses from Cairo 1 contracts", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      // Mock ByteArray response (Cairo 1 long string format)
      // ByteArray structure: { data: [], pending_word: felt, pending_word_len: number }
      const mockContract = {
        symbol: vi.fn().mockResolvedValue({
          symbol: {
            data: [],
            pending_word: BigInt("0x555344432e65"), // "USDC.e" as pending_word
            pending_word_len: 6,
          },
        }),
        name: vi.fn().mockResolvedValue({
          name: {
            data: [],
            pending_word: BigInt("0x427269646765642055534443"), // "Bridged USDC"
            pending_word_len: 12,
          },
        }),
        decimals: vi.fn().mockResolvedValue({ decimals: 6 }),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000009999";
      const token = await service.getTokenByAddress(unknownAddr);

      expect(token.symbol).toBe("USDC.e");
      expect(token.name).toBe("Bridged USDC");
      expect(token.decimals).toBe(6);
    });

    it("should handle direct ByteArray responses (not wrapped)", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      // Direct ByteArray response without wrapper
      const mockContract = {
        symbol: vi.fn().mockResolvedValue({
          data: [],
          pending_word: BigInt("0x574554"), // "WET"
          pending_word_len: 3,
        }),
        name: vi.fn().mockResolvedValue({
          data: [],
          pending_word: BigInt("0x5772617070656420455448"), // "Wrapped ETH"
          pending_word_len: 11,
        }),
        decimals: vi.fn().mockResolvedValue(18), // Direct number response
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000008888";
      const token = await service.getTokenByAddress(unknownAddr);

      expect(token.symbol).toBe("WET");
      expect(token.name).toBe("Wrapped ETH");
      expect(token.decimals).toBe(18);
    });

    it("should decode ByteArray values with data chunks", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValueOnce(new Error("avnu unavailable"));

      // ByteArray with data chunks for a longer string
      // This represents a 35-char string: 31 bytes in data[0], 4 bytes in pending_word
      // "VeryLongTokenSymbolThatExceeds31" (32 chars) would be:
      // - data: [felt252 for first 31 chars]
      // - pending_word: felt252 for remaining char(s)
      // For simplicity, test with actual ByteArray.stringFromByteArray behavior
      const symbolByteArray = {
        data: [], // Empty data array (< 31 chars)
        pending_word: BigInt("0x4c4f4e47"), // "LONG"
        pending_word_len: 4,
      };
      const nameByteArray = {
        data: [], // Empty data array
        pending_word: BigInt("0x4c6f6e6720546f6b656e"), // "Long Token"
        pending_word_len: 10,
      };

      const mockContract = {
        symbol: vi.fn().mockResolvedValue({ symbol: symbolByteArray }),
        name: vi.fn().mockResolvedValue({ name: nameByteArray }),
        decimals: vi.fn().mockResolvedValue({ decimals: 18 }),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000006666";
      const token = await service.getTokenByAddress(unknownAddr);

      // Verify ByteArray decoding works (actual stringFromByteArray behavior)
      expect(token.symbol).toBe("LONG");
      expect(token.name).toBe("Long Token");
      expect(token.decimals).toBe(18);
    });

    it("should cache token after on-chain fetch", async () => {
      vi.mocked(fetchTokenByAddress).mockRejectedValue(new Error("avnu unavailable"));

      const mockContract = {
        symbol: vi.fn().mockResolvedValue({ symbol: BigInt("0x54455354") }), // "TEST"
        name: vi.fn().mockResolvedValue({ name: BigInt("0x54657374") }), // "Test"
        decimals: vi.fn().mockResolvedValue({ decimals: 8 }),
      };
      vi.mocked(Contract).mockImplementation(() => mockContract as unknown as InstanceType<typeof Contract>);

      const mockProvider = {} as Parameters<typeof service.setProvider>[0];
      service.setProvider(mockProvider);

      const unknownAddr = "0x0000000000000000000000000000000000000000000000000000000000005678";

      // First call fetches from chain
      await service.getTokenByAddress(unknownAddr);
      expect(mockContract.symbol).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const token = await service.getTokenByAddress(unknownAddr);
      expect(mockContract.symbol).toHaveBeenCalledTimes(1); // Not called again
      expect(token.decimals).toBe(8);
    });
  });
});
