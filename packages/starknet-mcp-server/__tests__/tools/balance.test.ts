import { describe, it, expect } from "vitest";
import { uint256 } from "starknet";
import {
  TOKENS,
  TOKEN_DECIMALS,
  MAX_BATCH_TOKENS,
  resolveTokenAddress,
  formatAmount,
  normalizeAddress,
  getCachedDecimals,
} from "../../src/utils.js";

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

  it("handles zero decimals", () => {
    expect(formatAmount(BigInt(12345), 0)).toBe("12345");
  });
});

describe("uint256.uint256ToBN", () => {
  it("converts low-only values", () => {
    const mockBalance = { low: BigInt("1000000000000000000"), high: BigInt(0) };
    const result = uint256.uint256ToBN(mockBalance);
    expect(result.toString()).toBe("1000000000000000000");
  });

  it("handles large uint256 balances with high part", () => {
    const mockBalance = { low: BigInt(0), high: BigInt(1) };
    const result = uint256.uint256ToBN(mockBalance);
    // 2^128 is larger than max low value
    const maxLow = BigInt("340282366920938463463374607431768211455");
    expect(result > maxLow).toBe(true);
  });

  it("combines low and high correctly", () => {
    const mockBalance = { low: BigInt(100), high: BigInt(2) };
    const result = uint256.uint256ToBN(mockBalance);
    // 2 * 2^128 + 100
    const expected = BigInt(2) * (BigInt(1) << 128n) + BigInt(100);
    expect(result).toBe(expected);
  });
});

describe("normalizeAddress", () => {
  it("normalizes addresses to lowercase with full padding", () => {
    const addr = "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
    const normalized = normalizeAddress(addr);
    expect(normalized).toBe("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7");
    expect(normalized.length).toBe(66); // 0x + 64 chars
  });

  it("handles uppercase addresses", () => {
    const addr = "0x049D36570D4E46F48E99674BD3FCC84644DDD6B96F7C741B1562B82F9E004DC7";
    const normalized = normalizeAddress(addr);
    expect(normalized).toBe(TOKENS.ETH);
  });

  it("handles short addresses", () => {
    const addr = "0x123";
    const normalized = normalizeAddress(addr);
    expect(normalized).toBe("0x0000000000000000000000000000000000000000000000000000000000000123");
  });
});

describe("getCachedDecimals", () => {
  it("returns cached decimals for known tokens", () => {
    expect(getCachedDecimals(TOKENS.ETH)).toBe(18);
    expect(getCachedDecimals(TOKENS.STRK)).toBe(18);
    expect(getCachedDecimals(TOKENS.USDC)).toBe(6);
    expect(getCachedDecimals(TOKENS.USDT)).toBe(6);
  });

  it("returns undefined for unknown tokens", () => {
    expect(getCachedDecimals("0x123456")).toBeUndefined();
  });
});

describe("MAX_BATCH_TOKENS", () => {
  it("is set to 200", () => {
    expect(MAX_BATCH_TOKENS).toBe(200);
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
      const tokenAddr = normalizeAddress("0x" + BigInt(item.token).toString(16));
      const balance = uint256.uint256ToBN(item.balance);
      nonZeroBalances.set(tokenAddr, balance);
    }

    expect(nonZeroBalances.size).toBe(2);
    expect(nonZeroBalances.get(normalizeAddress(TOKENS.ETH))).toBe(BigInt("2000000000000000000"));
    expect(nonZeroBalances.get(normalizeAddress(TOKENS.USDC))).toBe(BigInt("1000000000"));
  });

  it("includes zero balances for tokens not in response", () => {
    const requestedTokens = ["ETH", "STRK", "USDC"];
    const tokenAddresses = requestedTokens.map(resolveTokenAddress);
    const normalizedAddresses = tokenAddresses.map(normalizeAddress);

    // Contract only returns non-zero balances
    const mockResponse = [
      {
        token: BigInt(TOKENS.ETH),
        balance: { low: BigInt("1000000000000000000"), high: BigInt(0) },
      },
    ];

    const nonZeroBalances = new Map<string, bigint>();
    for (const item of mockResponse) {
      const tokenAddr = normalizeAddress("0x" + BigInt(item.token).toString(16));
      const balance = uint256.uint256ToBN(item.balance);
      nonZeroBalances.set(tokenAddr, balance);
    }

    const balances = requestedTokens.map((token, index) => {
      const tokenAddress = tokenAddresses[index];
      const normalized = normalizedAddresses[index];
      const balance = nonZeroBalances.get(normalized) ?? BigInt(0);
      const decimals = getCachedDecimals(tokenAddress) ?? 18;

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
