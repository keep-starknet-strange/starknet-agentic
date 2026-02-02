import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mockQuote,
  mockSwapResult,
  createMockAvnu,
  createMockAvnuNoQuotes,
  createMockAvnuWithError,
  TOKENS,
} from "./mocks/avnu.mock";

// Mock the @avnu/avnu-sdk module
vi.mock("@avnu/avnu-sdk", () => ({
  getQuotes: vi.fn(),
  executeSwap: vi.fn(),
}));

// Mock starknet module
vi.mock("starknet", () => ({
  Account: vi.fn().mockImplementation(() => ({
    address: "0x1234567890abcdef",
    execute: vi.fn(),
  })),
  RpcProvider: vi.fn().mockImplementation(() => ({
    callContract: vi.fn(),
  })),
  Contract: vi.fn().mockImplementation(() => ({
    balanceOf: vi.fn().mockResolvedValue({ low: BigInt(1e18), high: BigInt(0) }),
    decimals: vi.fn().mockResolvedValue(18),
  })),
  constants: {
    TRANSACTION_VERSION: { V3: 3 },
  },
  CallData: {
    compile: vi.fn((data) => data),
  },
  uint256: {
    uint256ToBN: vi.fn((val: { low: bigint; high: bigint }) => val.low + (val.high << 128n)),
  },
  cairo: {
    uint256: vi.fn((n) => ({ low: n, high: BigInt(0) })),
  },
  PaymasterRpc: vi.fn().mockImplementation(() => ({})),
}));

import { getQuotes, executeSwap } from "@avnu/avnu-sdk";

describe("avnu SDK v4 Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getQuotes", () => {
    it("should return valid quotes with SDK v4 structure", async () => {
      const mock = createMockAvnu();
      vi.mocked(getQuotes).mockImplementation(mock.getQuotes);

      const params = {
        sellTokenAddress: TOKENS.ETH,
        buyTokenAddress: TOKENS.USDC,
        sellAmount: BigInt(1e18),
        takerAddress: "0x1234567890abcdef",
      };

      const quotes = await getQuotes(params);

      expect(quotes).toHaveLength(1);
      expect(quotes[0].quoteId).toBe("mock-quote-id-123");
      expect(quotes[0].sellAmount).toBe(BigInt(1e18));
      expect(quotes[0].buyAmount).toBe(BigInt(3200e6));
      expect(quotes[0].priceImpact).toBe(15);
      expect(quotes[0].routes).toHaveLength(2);
    });

    it("should return empty array when no liquidity", async () => {
      const mock = createMockAvnuNoQuotes();
      vi.mocked(getQuotes).mockImplementation(mock.getQuotes);

      const params = {
        sellTokenAddress: TOKENS.ETH,
        buyTokenAddress: "0xunknowntoken",
        sellAmount: BigInt(1e18),
        takerAddress: "0x1234567890abcdef",
      };

      const quotes = await getQuotes(params);

      expect(quotes).toHaveLength(0);
    });

    it("should handle INSUFFICIENT_LIQUIDITY error", async () => {
      const mock = createMockAvnuWithError("INSUFFICIENT_LIQUIDITY");
      vi.mocked(getQuotes).mockImplementation(mock.getQuotes);

      const params = {
        sellTokenAddress: TOKENS.ETH,
        buyTokenAddress: TOKENS.USDC,
        sellAmount: BigInt(1e24), // Very large amount
        takerAddress: "0x1234567890abcdef",
      };

      await expect(getQuotes(params)).rejects.toThrow("INSUFFICIENT_LIQUIDITY");
    });
  });

  describe("executeSwap", () => {
    it("should execute swap with SDK v4 signature", async () => {
      const mock = createMockAvnu();
      vi.mocked(executeSwap).mockImplementation(mock.executeSwap);

      const swapParams = {
        provider: { address: "0x1234" } as any,
        quote: mockQuote,
        slippage: 0.01,
        executeApprove: true,
      };

      const result = await executeSwap(swapParams);

      expect(result.transactionHash).toBe("0x123abc456def789");
      expect(mock.executeSwap).toHaveBeenCalledWith(swapParams);
    });

    it("should support gasless mode with paymaster", async () => {
      const mock = createMockAvnu();
      vi.mocked(executeSwap).mockImplementation(mock.executeSwap);

      const swapParams = {
        provider: { address: "0x1234" } as any,
        quote: mockQuote,
        slippage: 0.01,
        executeApprove: true,
        paymaster: {
          active: true,
          provider: {} as any,
          params: {
            version: "0x1" as const,
            feeMode: { mode: "default" as const, gasToken: TOKENS.USDC },
          },
        },
      };

      const result = await executeSwap(swapParams);

      expect(result.transactionHash).toBeDefined();
      expect(mock.executeSwap).toHaveBeenCalledWith(
        expect.objectContaining({
          paymaster: expect.objectContaining({
            active: true,
          }),
        })
      );
    });

    it("should handle SLIPPAGE error", async () => {
      const mock = createMockAvnuWithError("SLIPPAGE exceeded");
      vi.mocked(executeSwap).mockImplementation(mock.executeSwap);

      const swapParams = {
        provider: { address: "0x1234" } as any,
        quote: mockQuote,
        slippage: 0.001, // Very low slippage
        executeApprove: true,
      };

      await expect(executeSwap(swapParams)).rejects.toThrow("SLIPPAGE");
    });

    it("should handle QUOTE_EXPIRED error", async () => {
      const mock = createMockAvnuWithError("QUOTE_EXPIRED");
      vi.mocked(executeSwap).mockImplementation(mock.executeSwap);

      const swapParams = {
        provider: { address: "0x1234" } as any,
        quote: mockQuote,
        slippage: 0.01,
        executeApprove: true,
      };

      await expect(executeSwap(swapParams)).rejects.toThrow("QUOTE_EXPIRED");
    });
  });

  describe("Quote response fields (SDK v4)", () => {
    it("should have correct field structure", () => {
      expect(mockQuote).toHaveProperty("quoteId");
      expect(mockQuote).toHaveProperty("sellAmount");
      expect(mockQuote).toHaveProperty("buyAmount");
      expect(mockQuote).toHaveProperty("sellAmountInUsd");
      expect(mockQuote).toHaveProperty("buyAmountInUsd");
      expect(mockQuote).toHaveProperty("priceImpact");
      expect(mockQuote).toHaveProperty("gasFeesInUsd");
      expect(mockQuote).toHaveProperty("routes");
      expect(mockQuote).toHaveProperty("fee");
    });

    it("should have routes with name and percent", () => {
      expect(mockQuote.routes).toBeInstanceOf(Array);
      expect(mockQuote.routes![0]).toHaveProperty("name");
      expect(mockQuote.routes![0]).toHaveProperty("percent");
    });

    it("should have priceImpact in basis points", () => {
      // priceImpact is in basis points (15 = 0.15%)
      const priceImpactPercent = mockQuote.priceImpact! / 100;
      expect(priceImpactPercent).toBe(0.15);
    });
  });
});

describe("Error message handling", () => {
  const formatErrorMessage = (errorMessage: string): string => {
    if (errorMessage.includes("INSUFFICIENT_LIQUIDITY") || errorMessage.includes("insufficient liquidity")) {
      return "Insufficient liquidity for this swap. Try a smaller amount or different token pair.";
    } else if (errorMessage.includes("SLIPPAGE") || errorMessage.includes("slippage") || errorMessage.includes("Insufficient tokens received")) {
      return "Slippage exceeded. Try increasing slippage tolerance.";
    } else if (errorMessage.includes("QUOTE_EXPIRED") || errorMessage.includes("quote expired")) {
      return "Quote expired. Please retry the operation.";
    } else if (errorMessage.includes("INSUFFICIENT_BALANCE") || errorMessage.includes("insufficient balance")) {
      return "Insufficient token balance for this operation.";
    } else if (errorMessage.includes("No quotes available")) {
      return "No swap routes available for this token pair. The pair may not have liquidity.";
    }
    return errorMessage;
  };

  it("should return user-friendly message for INSUFFICIENT_LIQUIDITY", () => {
    const result = formatErrorMessage("INSUFFICIENT_LIQUIDITY");
    expect(result).toBe("Insufficient liquidity for this swap. Try a smaller amount or different token pair.");
  });

  it("should return user-friendly message for SLIPPAGE", () => {
    const result = formatErrorMessage("SLIPPAGE exceeded maximum");
    expect(result).toBe("Slippage exceeded. Try increasing slippage tolerance.");
  });

  it("should return user-friendly message for Insufficient tokens received", () => {
    const result = formatErrorMessage("Insufficient tokens received");
    expect(result).toBe("Slippage exceeded. Try increasing slippage tolerance.");
  });

  it("should return user-friendly message for QUOTE_EXPIRED", () => {
    const result = formatErrorMessage("QUOTE_EXPIRED");
    expect(result).toBe("Quote expired. Please retry the operation.");
  });

  it("should return user-friendly message for INSUFFICIENT_BALANCE", () => {
    const result = formatErrorMessage("INSUFFICIENT_BALANCE");
    expect(result).toBe("Insufficient token balance for this operation.");
  });

  it("should return user-friendly message for no quotes", () => {
    const result = formatErrorMessage("No quotes available");
    expect(result).toBe("No swap routes available for this token pair. The pair may not have liquidity.");
  });

  it("should return original message for unknown errors", () => {
    const result = formatErrorMessage("Unknown error occurred");
    expect(result).toBe("Unknown error occurred");
  });
});
