import { describe, it, expect } from "vitest";
import { formatAmount, formatQuoteFields, formatErrorMessage } from "../../src/utils/formatter";

describe("formatAmount", () => {
  it("should format whole amounts correctly", () => {
    expect(formatAmount(BigInt(1e18), 18)).toBe("1");
    expect(formatAmount(BigInt(100e6), 6)).toBe("100");
  });

  it("should format decimal amounts correctly", () => {
    expect(formatAmount(BigInt(15e17), 18)).toBe("1.5");
    expect(formatAmount(BigInt(1234567), 6)).toBe("1.234567");
  });

  it("should handle zero", () => {
    expect(formatAmount(BigInt(0), 18)).toBe("0");
  });

  it("should handle small amounts", () => {
    expect(formatAmount(BigInt(1), 18)).toBe("0.000000000000000001");
  });

  it("should strip trailing zeros", () => {
    expect(formatAmount(BigInt(1e18), 18)).toBe("1");
    expect(formatAmount(BigInt(10e17), 18)).toBe("1");
  });
});

describe("formatQuoteFields", () => {
  const mockQuote = {
    quoteId: "test-id",
    sellTokenAddress: "0x1",
    buyTokenAddress: "0x2",
    sellAmount: BigInt(1e18),
    buyAmount: BigInt(3200e6),
    sellAmountInUsd: 3200,
    buyAmountInUsd: 3199.5,
    priceImpact: 15, // 0.15% in basis points
    gasFees: BigInt(0),
    gasFeesInUsd: 0.0234,
    chainId: "SN_MAIN",
    routes: [
      { name: "Ekubo", address: "0x123", percent: 0.8, sellTokenAddress: "0x1", buyTokenAddress: "0x2", routes: [], alternativeSwapCount: 0 },
      { name: "JediSwap", address: "0x456", percent: 0.2, sellTokenAddress: "0x1", buyTokenAddress: "0x2", routes: [], alternativeSwapCount: 0 },
    ],
  } as any;

  it("should format buy amount with decimals", () => {
    const result = formatQuoteFields(mockQuote, 6);
    expect(result.buyAmount).toBe("3200");
  });

  it("should format price impact from basis points to percentage", () => {
    const result = formatQuoteFields(mockQuote, 6);
    expect(result.priceImpact).toBe("0.15%");
  });

  it("should format gas fees in USD", () => {
    const result = formatQuoteFields(mockQuote, 6);
    expect(result.gasFeesUsd).toBe("0.0234");
  });

  it("should format routes with name and percent", () => {
    const result = formatQuoteFields(mockQuote, 6);
    expect(result.routes).toHaveLength(2);
    expect(result.routes![0]).toEqual({ name: "Ekubo", percent: "80.0%" });
    expect(result.routes![1]).toEqual({ name: "JediSwap", percent: "20.0%" });
  });

  it("should handle missing optional fields", () => {
    const minimalQuote = { buyAmount: BigInt(1e6) } as any;
    const result = formatQuoteFields(minimalQuote, 6);
    expect(result.buyAmount).toBe("1");
    expect(result.priceImpact).toBeUndefined();
    expect(result.gasFeesUsd).toBeUndefined();
    expect(result.routes).toBeUndefined();
  });
});

describe("formatErrorMessage", () => {
  it("should format INSUFFICIENT_LIQUIDITY", () => {
    expect(formatErrorMessage("INSUFFICIENT_LIQUIDITY")).toBe(
      "Insufficient liquidity for this swap. Try a smaller amount or different token pair."
    );
  });

  it("should format insufficient liquidity lowercase", () => {
    expect(formatErrorMessage("Error: insufficient liquidity")).toBe(
      "Insufficient liquidity for this swap. Try a smaller amount or different token pair."
    );
  });

  it("should format SLIPPAGE errors", () => {
    expect(formatErrorMessage("SLIPPAGE exceeded")).toBe(
      "Slippage exceeded. Try increasing slippage tolerance."
    );
  });

  it("should format Insufficient tokens received", () => {
    expect(formatErrorMessage("Insufficient tokens received")).toBe(
      "Slippage exceeded. Try increasing slippage tolerance."
    );
  });

  it("should format QUOTE_EXPIRED", () => {
    expect(formatErrorMessage("QUOTE_EXPIRED")).toBe(
      "Quote expired. Please retry the operation."
    );
  });

  it("should format INSUFFICIENT_BALANCE", () => {
    expect(formatErrorMessage("INSUFFICIENT_BALANCE")).toBe(
      "Insufficient token balance for this operation."
    );
  });

  it("should format no quotes available", () => {
    expect(formatErrorMessage("No quotes available")).toBe(
      "No swap routes available for this token pair. The pair may not have liquidity."
    );
  });

  it("should return original message for unknown errors", () => {
    const unknownError = "Something unexpected happened";
    expect(formatErrorMessage(unknownError)).toBe(unknownError);
  });
});
