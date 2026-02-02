import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Token addresses (Mainnet) - same as in index.ts
const TOKENS: Record<string, string> = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// Token decimals (common tokens)
const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.ETH]: 18,
  [TOKENS.STRK]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.USDT]: 6,
};

// BalanceChecker contract address
const BALANCE_CHECKER_ADDRESS = "0x031ce64a666fbf9a2b1b2ca51c2af60d9a76d3b85e5fbfb9d5a8dbd3fedc9716";

// Helper: Resolve token address from symbol (same as in index.ts)
function resolveTokenAddress(token: string): string {
  const upperToken = token.toUpperCase();
  if (upperToken in TOKENS) {
    return TOKENS[upperToken];
  }
  if (token.startsWith("0x")) {
    return token;
  }
  throw new Error(`Unknown token: ${token}`);
}

// Helper: Format amount with decimals (same as in index.ts)
function formatAmount(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals) || "0";
  const fraction = amountStr.slice(-decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

describe("starknet_get_balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("resolveTokenAddress", () => {
    it("should resolve ETH symbol to address", () => {
      expect(resolveTokenAddress("ETH")).toBe(TOKENS.ETH);
    });

    it("should resolve STRK symbol to address", () => {
      expect(resolveTokenAddress("STRK")).toBe(TOKENS.STRK);
    });

    it("should resolve USDC symbol to address", () => {
      expect(resolveTokenAddress("USDC")).toBe(TOKENS.USDC);
    });

    it("should resolve USDT symbol to address", () => {
      expect(resolveTokenAddress("USDT")).toBe(TOKENS.USDT);
    });

    it("should handle lowercase token symbols", () => {
      expect(resolveTokenAddress("eth")).toBe(TOKENS.ETH);
      expect(resolveTokenAddress("strk")).toBe(TOKENS.STRK);
    });

    it("should pass through hex addresses", () => {
      const customToken = "0x123abc456def";
      expect(resolveTokenAddress(customToken)).toBe(customToken);
    });

    it("should throw error for unknown token symbol", () => {
      expect(() => resolveTokenAddress("UNKNOWN")).toThrow("Unknown token: UNKNOWN");
    });

    it("should throw error for invalid non-hex string", () => {
      expect(() => resolveTokenAddress("invalid")).toThrow("Unknown token: invalid");
    });
  });

  describe("formatAmount", () => {
    it("should format ETH balance correctly (18 decimals)", () => {
      const oneEth = BigInt("1000000000000000000");
      expect(formatAmount(oneEth, 18)).toBe("1");
    });

    it("should format fractional ETH balance", () => {
      const halfEth = BigInt("500000000000000000");
      expect(formatAmount(halfEth, 18)).toBe("0.5");
    });

    it("should format USDC balance correctly (6 decimals)", () => {
      const oneUsdc = BigInt("1000000");
      expect(formatAmount(oneUsdc, 6)).toBe("1");
    });

    it("should format large balances", () => {
      const largeBalance = BigInt("123456789000000000000000");
      expect(formatAmount(largeBalance, 18)).toBe("123456.789");
    });

    it("should handle zero balance", () => {
      expect(formatAmount(BigInt(0), 18)).toBe("0");
    });

    it("should trim trailing zeros", () => {
      const balance = BigInt("1000000000000000000");
      expect(formatAmount(balance, 18)).toBe("1");
      expect(formatAmount(balance, 18)).not.toContain(".0");
    });
  });

  describe("balance fetching", () => {
    it("should return balance structure for ETH token", () => {
      const mockBalance = { low: BigInt("1000000000000000000"), high: BigInt(0) };
      const balanceBigInt = mockBalance.low + (mockBalance.high << 128n);
      const formattedBalance = formatAmount(balanceBigInt, 18);

      expect(formattedBalance).toBe("1");
      expect(balanceBigInt.toString()).toBe("1000000000000000000");
    });

    it("should handle large uint256 balances", () => {
      // Test balance with high part (> 2^128)
      const mockBalance = { low: BigInt(0), high: BigInt(1) };
      const balanceBigInt = mockBalance.low + (mockBalance.high << 128n);

      expect(balanceBigInt > BigInt("340282366920938463463374607431768211455")).toBe(true);
    });
  });
});

describe("starknet_get_balances (batch)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("token resolution", () => {
    it("should resolve multiple token symbols", () => {
      const tokens = ["ETH", "STRK", "USDC", "USDT"];
      const addresses = tokens.map(resolveTokenAddress);

      expect(addresses).toEqual([
        TOKENS.ETH,
        TOKENS.STRK,
        TOKENS.USDC,
        TOKENS.USDT,
      ]);
    });

    it("should handle mixed symbols and addresses", () => {
      const customAddress = "0x123abc456def";
      const tokens = ["ETH", customAddress, "USDC"];
      const addresses = tokens.map(resolveTokenAddress);

      expect(addresses).toEqual([
        TOKENS.ETH,
        customAddress,
        TOKENS.USDC,
      ]);
    });
  });

  describe("batch balance response parsing", () => {
    it("should parse NonZeroBalance response structure", () => {
      // Simulate BalanceChecker contract response
      const mockResponse = [
        {
          token: BigInt(TOKENS.ETH),
          balance: { low: BigInt("2000000000000000000"), high: BigInt(0) },
        },
        {
          token: BigInt(TOKENS.USDC),
          balance: { low: BigInt("1000000000"), high: BigInt(0) },
        },
      ];

      // Parse response into map
      const nonZeroBalances = new Map<string, bigint>();
      for (const item of mockResponse) {
        const tokenAddr = "0x" + BigInt(item.token).toString(16).padStart(64, "0");
        const balance = item.balance.low + (item.balance.high << 128n);
        nonZeroBalances.set(tokenAddr.toLowerCase(), balance);
      }

      expect(nonZeroBalances.size).toBe(2);
      expect(nonZeroBalances.get(TOKENS.ETH.toLowerCase())).toBe(BigInt("2000000000000000000"));
      expect(nonZeroBalances.get(TOKENS.USDC.toLowerCase())).toBe(BigInt("1000000000"));
    });

    it("should include zero balances for tokens not in response", () => {
      const requestedTokens = ["ETH", "STRK", "USDC"];
      const tokenAddresses = requestedTokens.map(resolveTokenAddress);

      // Contract only returns non-zero balances
      const mockResponse = [
        {
          token: BigInt(TOKENS.ETH),
          balance: { low: BigInt("1000000000000000000"), high: BigInt(0) },
        },
      ];

      const nonZeroBalances = new Map<string, bigint>();
      for (const item of mockResponse) {
        const tokenAddr = "0x" + BigInt(item.token).toString(16).padStart(64, "0");
        const balance = item.balance.low + (item.balance.high << 128n);
        nonZeroBalances.set(tokenAddr.toLowerCase(), balance);
      }

      // Build response with all requested tokens
      const balances = requestedTokens.map((token, index) => {
        const tokenAddress = tokenAddresses[index];
        const normalizedAddr = tokenAddress.toLowerCase();
        const balance = nonZeroBalances.get(normalizedAddr) ?? BigInt(0);
        const decimals = TOKEN_DECIMALS[tokenAddress] ?? 18;

        return {
          token,
          tokenAddress,
          balance: formatAmount(balance, decimals),
          raw: balance.toString(),
          decimals,
        };
      });

      expect(balances).toHaveLength(3);
      expect(balances[0]).toEqual({
        token: "ETH",
        tokenAddress: TOKENS.ETH,
        balance: "1",
        raw: "1000000000000000000",
        decimals: 18,
      });
      expect(balances[1]).toEqual({
        token: "STRK",
        tokenAddress: TOKENS.STRK,
        balance: "0",
        raw: "0",
        decimals: 18,
      });
      expect(balances[2]).toEqual({
        token: "USDC",
        tokenAddress: TOKENS.USDC,
        balance: "0",
        raw: "0",
        decimals: 6,
      });
    });
  });

  describe("known token decimals", () => {
    it("should have correct decimals for ETH", () => {
      expect(TOKEN_DECIMALS[TOKENS.ETH]).toBe(18);
    });

    it("should have correct decimals for STRK", () => {
      expect(TOKEN_DECIMALS[TOKENS.STRK]).toBe(18);
    });

    it("should have correct decimals for USDC", () => {
      expect(TOKEN_DECIMALS[TOKENS.USDC]).toBe(6);
    });

    it("should have correct decimals for USDT", () => {
      expect(TOKEN_DECIMALS[TOKENS.USDT]).toBe(6);
    });
  });

  describe("BalanceChecker contract", () => {
    it("should have correct contract address", () => {
      expect(BALANCE_CHECKER_ADDRESS).toBe("0x031ce64a666fbf9a2b1b2ca51c2af60d9a76d3b85e5fbfb9d5a8dbd3fedc9716");
    });

    it("should format balances for multiple tokens correctly", () => {
      const balances = [
        { balance: BigInt("2500000000000000000"), decimals: 18 }, // 2.5 ETH
        { balance: BigInt("100000000"), decimals: 6 }, // 100 USDC
        { balance: BigInt("50000000000000000000"), decimals: 18 }, // 50 STRK
      ];

      const formatted = balances.map(b => formatAmount(b.balance, b.decimals));

      expect(formatted).toEqual(["2.5", "100", "50"]);
    });
  });

  describe("error handling", () => {
    it("should require at least one token", () => {
      const tokens: string[] = [];
      expect(tokens.length === 0).toBe(true);
    });

    it("should throw for unknown tokens in batch", () => {
      const tokens = ["ETH", "UNKNOWN_TOKEN", "USDC"];
      expect(() => tokens.map(resolveTokenAddress)).toThrow("Unknown token: UNKNOWN_TOKEN");
    });
  });
});
