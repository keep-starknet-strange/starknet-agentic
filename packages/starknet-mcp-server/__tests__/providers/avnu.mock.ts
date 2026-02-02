import { vi } from "vitest";
import type { Quote, AvnuCalls } from "@avnu/avnu-sdk";

// Token addresses for testing
export const TOKENS = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// Mock quote matching SDK v4 structure
export const mockQuote = {
  quoteId: "mock-quote-id-123",
  sellTokenAddress: TOKENS.ETH,
  buyTokenAddress: TOKENS.USDC,
  sellAmount: BigInt(1e18), // 1 ETH
  buyAmount: BigInt(3200e6), // 3200 USDC
  sellAmountInUsd: 3200.0,
  buyAmountInUsd: 3199.5,
  priceImpact: 15, // 0.15% in basis points
  gasFees: BigInt(0),
  gasFeesInUsd: 0.02,
  chainId: "SN_MAIN",
  routes: [
    { name: "Ekubo", address: "0x123", percent: 0.8, sellTokenAddress: TOKENS.ETH, buyTokenAddress: TOKENS.USDC, routes: [], alternativeSwapCount: 0 },
    { name: "JediSwap", address: "0x456", percent: 0.2, sellTokenAddress: TOKENS.ETH, buyTokenAddress: TOKENS.USDC, routes: [], alternativeSwapCount: 0 },
  ],
  fee: {
    feeToken: TOKENS.ETH,
    avnuFees: BigInt(0),
    avnuFeesInUsd: 0,
    avnuFeesBps: BigInt(0),
    integratorFees: BigInt(0),
    integratorFeesInUsd: 0,
    integratorFeesBps: BigInt(0),
  },
} as Quote;

// Mock quote with no liquidity
export const mockEmptyQuotes: Quote[] = [];

// Mock swap result
export const mockSwapResult = {
  transactionHash: "0x123abc456def789",
};

// Mock quoteToCalls result - returns calls array for use with account.execute()
export const mockQuoteToCalls: AvnuCalls = {
  calls: [
    {
      contractAddress: TOKENS.ETH,
      entrypoint: "approve",
      calldata: ["0xavnu_router", "1000000000000000000", "0"],
    },
    {
      contractAddress: "0xavnu_router",
      entrypoint: "multi_route_swap",
      calldata: ["0x123", "0x456"],
    },
  ],
  chainId: "SN_MAIN",
};

// Create mock avnu SDK functions
export function createMockAvnu() {
  return {
    getQuotes: vi.fn().mockResolvedValue([mockQuote]),
    quoteToCalls: vi.fn().mockResolvedValue(mockQuoteToCalls),
    executeSwap: vi.fn().mockResolvedValue(mockSwapResult),
  };
}

// Create mock for no quotes scenario
export function createMockAvnuNoQuotes() {
  return {
    getQuotes: vi.fn().mockResolvedValue([]),
    quoteToCalls: vi.fn().mockRejectedValue(new Error("No quotes available")),
    executeSwap: vi.fn().mockRejectedValue(new Error("No quotes available")),
  };
}

// Create mock for error scenarios
export function createMockAvnuWithError(errorMessage: string) {
  return {
    getQuotes: vi.fn().mockRejectedValue(new Error(errorMessage)),
    quoteToCalls: vi.fn().mockRejectedValue(new Error(errorMessage)),
    executeSwap: vi.fn().mockRejectedValue(new Error(errorMessage)),
  };
}
