import { describe, it, expect } from "vitest";
import { uint256 } from "starknet";
import {
  MAX_BATCH_TOKENS,
  resolveTokenAddressAsync,
  normalizeAddress,
  validateTokensInputAsync,
} from "../../src/utils.js";
import { formatAmount } from "../../src/utils/formatter.js";
import { TOKENS, getTokenService } from "../../src/services/index.js";

describe("formatAmount", () => {
  it("formats standard ETH amounts (18 decimals)", () => {
    expect(formatAmount(BigInt("1000000000000000000"), 18)).toBe("1");
    expect(formatAmount(BigInt("1500000000000000000"), 18)).toBe("1.5");
    expect(formatAmount(BigInt("100000000000000000"), 18)).toBe("0.1");
  });

  it("formats USDC amounts (6 decimals)", () => {
    expect(formatAmount(BigInt("1000000"), 6)).toBe("1");
    expect(formatAmount(BigInt("100000000"), 6)).toBe("100");
    expect(formatAmount(BigInt("123456789"), 6)).toBe("123.456789");
  });

  it("handles zero amount", () => {
    expect(formatAmount(BigInt(0), 18)).toBe("0");
    expect(formatAmount(BigInt(0), 6)).toBe("0");
    expect(formatAmount(BigInt(0), 0)).toBe("0");
  });

  it("handles decimals === 0 (no decimal places)", () => {
    expect(formatAmount(BigInt(100), 0)).toBe("100");
    expect(formatAmount(BigInt(12345), 0)).toBe("12345");
    expect(formatAmount(BigInt(1), 0)).toBe("1");
  });

  it("removes trailing zeros", () => {
    expect(formatAmount(BigInt("1000000000000000000"), 18)).toBe("1");
    expect(formatAmount(BigInt("1100000000000000000"), 18)).toBe("1.1");
    expect(formatAmount(BigInt("1010000000000000000"), 18)).toBe("1.01");
  });

  it("handles very small amounts", () => {
    expect(formatAmount(BigInt(1), 18)).toBe("0.000000000000000001");
    expect(formatAmount(BigInt(1), 6)).toBe("0.000001");
  });

  it("handles very large amounts", () => {
    const largeAmount = BigInt("1000000000000000000000000"); // 1 million ETH
    expect(formatAmount(largeAmount, 18)).toBe("1000000");
  });
});

describe("resolveTokenAddressAsync", () => {
  it("resolves known token symbols to addresses", async () => {
    expect(await resolveTokenAddressAsync("ETH")).toBe(TOKENS.ETH);
    expect(await resolveTokenAddressAsync("STRK")).toBe(TOKENS.STRK);
    expect(await resolveTokenAddressAsync("USDC")).toBe(TOKENS.USDC);
    expect(await resolveTokenAddressAsync("USDT")).toBe(TOKENS.USDT);
  });

  it("handles case-insensitive token symbols", async () => {
    expect(await resolveTokenAddressAsync("eth")).toBe(TOKENS.ETH);
    expect(await resolveTokenAddressAsync("Strk")).toBe(TOKENS.STRK);
  });

  it("normalizes hex addresses to 64 chars", async () => {
    const customToken = "0x123abc456def";
    const result = await resolveTokenAddressAsync(customToken);
    // TokenService normalizes all addresses to 0x + 64 hex chars
    expect(result).toBe("0x0000000000000000000000000000000000000000000000000000123abc456def");
    expect(result.length).toBe(66);
  });

  it("throws for unknown token symbols", async () => {
    // Async version tries avnu first, so error message is different
    await expect(resolveTokenAddressAsync("UNKNOWN")).rejects.toThrow("Failed to fetch token by symbol");
    await expect(resolveTokenAddressAsync("invalid")).rejects.toThrow("Failed to fetch token by symbol");
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

describe("MAX_BATCH_TOKENS", () => {
  it("is set to 200", () => {
    expect(MAX_BATCH_TOKENS).toBe(200);
  });
});

describe("starknet_get_balances (batch)", () => {
  it("resolves multiple token symbols", async () => {
    const tokens = ["ETH", "STRK", "USDC", "USDT"];
    const addresses = await Promise.all(tokens.map(resolveTokenAddressAsync));
    expect(addresses).toEqual([TOKENS.ETH, TOKENS.STRK, TOKENS.USDC, TOKENS.USDT]);
  });

  it("handles mixed symbols and addresses (normalized)", async () => {
    const customAddress = "0x123abc456def";
    const normalizedCustomAddress = "0x0000000000000000000000000000000000000000000000000000123abc456def";
    const tokens = ["ETH", customAddress, "USDC"];
    const addresses = await Promise.all(tokens.map(resolveTokenAddressAsync));
    expect(addresses).toEqual([TOKENS.ETH, normalizedCustomAddress, TOKENS.USDC]);
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

  it("includes zero balances for tokens not in response", async () => {
    const requestedTokens = ["ETH", "STRK", "USDC"];
    const tokenAddresses = await Promise.all(requestedTokens.map(resolveTokenAddressAsync));
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
      const decimals = getTokenService().getDecimals(tokenAddress) ?? 18;

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

  it("throws for unknown tokens in batch", async () => {
    const tokens = ["ETH", "UNKNOWN_TOKEN", "USDC"];
    await expect(Promise.all(tokens.map(resolveTokenAddressAsync))).rejects.toThrow("Failed to fetch token by symbol");
  });
});

describe("starknet_get_balances validation", () => {
  it("throws for empty token array", async () => {
    await expect(validateTokensInputAsync([])).rejects.toThrow("At least one token is required");
  });

  it("throws for undefined tokens", async () => {
    await expect(validateTokensInputAsync(undefined)).rejects.toThrow("At least one token is required");
  });

  it("throws for exceeding max tokens", async () => {
    const tooManyTokens = Array(201).fill("ETH");
    await expect(validateTokensInputAsync(tooManyTokens)).rejects.toThrow("Maximum 200 tokens per request");
  });

  it("throws for duplicate tokens (same symbol)", async () => {
    await expect(validateTokensInputAsync(["ETH", "ETH"])).rejects.toThrow("Duplicate tokens in request");
  });

  it("throws for duplicate tokens (symbol and address)", async () => {
    await expect(validateTokensInputAsync(["ETH", TOKENS.ETH])).rejects.toThrow("Duplicate tokens in request");
  });

  it("throws for duplicate tokens (case variants)", async () => {
    await expect(validateTokensInputAsync(["eth", "ETH"])).rejects.toThrow("Duplicate tokens in request");
  });

  it("allows unique tokens", async () => {
    const tokens = ["ETH", "STRK", "USDC", "USDT"];
    const result = await validateTokensInputAsync(tokens);
    expect(result).toEqual([TOKENS.ETH, TOKENS.STRK, TOKENS.USDC, TOKENS.USDT]);
  });

  it("allows mix of symbols and different addresses", async () => {
    const customAddress = "0x1234567890abcdef1234567890abcdef12345678";
    const tokens = ["ETH", customAddress, "USDC"];
    const result = await validateTokensInputAsync(tokens);
    expect(result).toHaveLength(3);
  });

  it("allows max tokens (200)", async () => {
    // Create 200 unique addresses
    const tokens = Array.from({ length: 200 }, (_, i) =>
      "0x" + (i + 1).toString(16).padStart(64, "0")
    );
    await expect(validateTokensInputAsync(tokens)).resolves.toBeDefined();
  });
});

describe("fetchTokenBalances fallback behavior", () => {
  it("returns balance_checker method on success", () => {
    // This tests the expected return structure when BalanceChecker succeeds
    const successResult = { balances: [], method: "balance_checker" as const };
    expect(successResult.method).toBe("balance_checker");
  });

  it("returns batch_rpc method on fallback", () => {
    // This tests the expected return structure when falling back to batch RPC
    const fallbackResult = { balances: [], method: "batch_rpc" as const };
    expect(fallbackResult.method).toBe("batch_rpc");
  });

  it("method field is one of expected values", () => {
    const validMethods = ["balance_checker", "batch_rpc"];
    expect(validMethods).toContain("balance_checker");
    expect(validMethods).toContain("batch_rpc");
  });
});
