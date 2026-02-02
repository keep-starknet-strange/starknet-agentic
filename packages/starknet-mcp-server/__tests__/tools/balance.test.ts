import { describe, it, expect } from "vitest";

// Token addresses (Mainnet) - mirrored from index.ts for testing
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

// Helper: Resolve token address from symbol (same logic as index.ts)
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

// Helper: Format amount with decimals (same logic as index.ts)
function formatAmount(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals) || "0";
  const fraction = amountStr.slice(-decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

// Helper: Parse uint256 from low/high parts (simulates contract response)
function uint256ToBigInt(value: { low: bigint; high: bigint }): bigint {
  return value.low + (value.high << 128n);
}

describe("resolveTokenAddress", () => {
  it("resolves known token symbols to addresses", () => {
    expect(resolveTokenAddress("ETH")).toBe(TOKENS.ETH);
    expect(resolveTokenAddress("STRK")).toBe(TOKENS.STRK);
    expect(resolveTokenAddress("USDC")).toBe(TOKENS.USDC);
    expect(resolveTokenAddress("USDT")).toBe(TOKENS.USDT);
  });

  it("handles case-insensitive token symbols", () => {
    expect(resolveTokenAddress("eth")).toBe(TOKENS.ETH);
    expect(resolveTokenAddress("Strk")).toBe(TOKENS.STRK);
  });

  it("passes through hex addresses unchanged", () => {
    const customToken = "0x123abc456def";
    expect(resolveTokenAddress(customToken)).toBe(customToken);
  });

  it("throws for unknown token symbols", () => {
    expect(() => resolveTokenAddress("UNKNOWN")).toThrow("Unknown token: UNKNOWN");
    expect(() => resolveTokenAddress("invalid")).toThrow("Unknown token: invalid");
  });
});

describe("formatAmount", () => {
  it("formats whole token amounts", () => {
    expect(formatAmount(BigInt("1000000000000000000"), 18)).toBe("1");
    expect(formatAmount(BigInt("1000000"), 6)).toBe("1");
  });

  it("formats fractional amounts", () => {
    expect(formatAmount(BigInt("500000000000000000"), 18)).toBe("0.5");
    expect(formatAmount(BigInt("2500000000000000000"), 18)).toBe("2.5");
  });

  it("formats large balances", () => {
    expect(formatAmount(BigInt("123456789000000000000000"), 18)).toBe("123456.789");
  });

  it("handles zero balance", () => {
    expect(formatAmount(BigInt(0), 18)).toBe("0");
    expect(formatAmount(BigInt(0), 6)).toBe("0");
  });

  it("trims trailing zeros", () => {
    const oneEth = BigInt("1000000000000000000");
    const result = formatAmount(oneEth, 18);
    expect(result).toBe("1");
    expect(result).not.toContain(".");
  });
});

describe("starknet_get_balance", () => {
  it("converts uint256 balance to bigint correctly", () => {
    const mockBalance = { low: BigInt("1000000000000000000"), high: BigInt(0) };
    const balanceBigInt = uint256ToBigInt(mockBalance);

    expect(balanceBigInt.toString()).toBe("1000000000000000000");
    expect(formatAmount(balanceBigInt, 18)).toBe("1");
  });

  it("handles large uint256 balances with high part", () => {
    const mockBalance = { low: BigInt(0), high: BigInt(1) };
    const balanceBigInt = uint256ToBigInt(mockBalance);

    // 2^128 is larger than max low value
    const maxLow = BigInt("340282366920938463463374607431768211455");
    expect(balanceBigInt > maxLow).toBe(true);
  });
});

describe("starknet_get_balances (batch)", () => {
  it("resolves multiple token symbols", () => {
    const tokens = ["ETH", "STRK", "USDC", "USDT"];
    const addresses = tokens.map(resolveTokenAddress);

    expect(addresses).toEqual([TOKENS.ETH, TOKENS.STRK, TOKENS.USDC, TOKENS.USDT]);
  });

  it("handles mixed symbols and addresses", () => {
    const customAddress = "0x123abc456def";
    const tokens = ["ETH", customAddress, "USDC"];
    const addresses = tokens.map(resolveTokenAddress);

    expect(addresses).toEqual([TOKENS.ETH, customAddress, TOKENS.USDC]);
  });

  it("parses NonZeroBalance response structure", () => {
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

    const nonZeroBalances = new Map<string, bigint>();
    for (const item of mockResponse) {
      const tokenAddr = "0x" + BigInt(item.token).toString(16).padStart(64, "0");
      const balance = uint256ToBigInt(item.balance);
      nonZeroBalances.set(tokenAddr.toLowerCase(), balance);
    }

    expect(nonZeroBalances.size).toBe(2);
    expect(nonZeroBalances.get(TOKENS.ETH.toLowerCase())).toBe(BigInt("2000000000000000000"));
    expect(nonZeroBalances.get(TOKENS.USDC.toLowerCase())).toBe(BigInt("1000000000"));
  });

  it("includes zero balances for tokens not in response", () => {
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
      const balance = uint256ToBigInt(item.balance);
      nonZeroBalances.set(tokenAddr.toLowerCase(), balance);
    }

    const balances = requestedTokens.map((token, index) => {
      const tokenAddress = tokenAddresses[index];
      const balance = nonZeroBalances.get(tokenAddress.toLowerCase()) ?? BigInt(0);
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

  it("throws for unknown tokens in batch", () => {
    const tokens = ["ETH", "UNKNOWN_TOKEN", "USDC"];
    expect(() => tokens.map(resolveTokenAddress)).toThrow("Unknown token: UNKNOWN_TOKEN");
  });
});
