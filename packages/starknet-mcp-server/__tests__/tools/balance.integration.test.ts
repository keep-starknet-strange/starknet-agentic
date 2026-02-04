import { describe, it, expect, vi, beforeEach } from "vitest";
import { TOKENS } from "../../src/services/index.js";

const BALANCE_CHECKER_ADDRESS = "0x031ce64a666fbf9a2b1b2ca51c2af60d9a76d3b85e5fbfb9d5a8dbd3fedc9716";

// Mock starknet.js Contract and RpcProvider
const mockBalanceCheckerCall = vi.fn();
const mockErc20BalanceOf = vi.fn();
const mockErc20Decimals = vi.fn();

vi.mock("starknet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("starknet")>();
  return {
    ...actual,
    Contract: vi.fn().mockImplementation(({ address }: { address: string }) => {
      if (address === BALANCE_CHECKER_ADDRESS) {
        return { get_balances: mockBalanceCheckerCall };
      }
      return {
        balanceOf: mockErc20BalanceOf,
        decimals: mockErc20Decimals,
      };
    }),
    RpcProvider: vi.fn().mockImplementation(() => ({})),
  };
});

// Import AFTER mocking starknet
const { fetchTokenBalance, fetchTokenBalances } = await import("../../src/helpers/balance.js");
const { RpcProvider } = await import("starknet");

// Create mock provider (with batch: 0 like production)
const mockProvider = new RpcProvider({ nodeUrl: "http://localhost", batch: 0 });

describe("fetchTokenBalance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns balance as bigint when contract returns bigint", async () => {
    mockErc20BalanceOf.mockResolvedValue(BigInt("1000000000000000000"));
    mockErc20Decimals.mockResolvedValue(18);

    const result = await fetchTokenBalance("0x123", TOKENS.ETH, mockProvider);

    expect(result.balance).toBe(BigInt("1000000000000000000"));
    expect(result.decimals).toBe(18);
  });

  it("converts u256 {low, high} to bigint", async () => {
    mockErc20BalanceOf.mockResolvedValue({
      balance: { low: BigInt("1000000000000000000"), high: BigInt(0) },
    });
    mockErc20Decimals.mockResolvedValue(18);

    const result = await fetchTokenBalance("0x123", TOKENS.ETH, mockProvider);

    expect(result.balance).toBe(BigInt("1000000000000000000"));
    expect(result.decimals).toBe(18);
  });

  it("uses cached decimals for known tokens", async () => {
    mockErc20BalanceOf.mockResolvedValue(BigInt("1000000"));

    const result = await fetchTokenBalance("0x123", TOKENS.USDC, mockProvider);

    expect(result.decimals).toBe(6);
    expect(mockErc20Decimals).not.toHaveBeenCalled();
  });

  it("handles very large u256 values with high part", async () => {
    mockErc20BalanceOf.mockResolvedValue({
      balance: { low: BigInt(100), high: BigInt(2) },
    });
    mockErc20Decimals.mockResolvedValue(18);

    const result = await fetchTokenBalance("0x123", TOKENS.ETH, mockProvider);

    // 2 * 2^128 + 100
    const expected = BigInt(2) * (BigInt(1) << 128n) + BigInt(100);
    expect(result.balance).toBe(expected);
  });
});

describe("fetchTokenBalances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses BalanceChecker when available and returns balance_checker method", async () => {
    mockBalanceCheckerCall.mockResolvedValue([
      { token: BigInt(TOKENS.ETH), balance: BigInt("1000000000000000000") },
    ]);

    const result = await fetchTokenBalances(
      "0x123",
      ["ETH"],
      [TOKENS.ETH],
      mockProvider
    );

    expect(result.method).toBe("balance_checker");
    expect(result.balances).toHaveLength(1);
    expect(result.balances[0].balance).toBe(BigInt("1000000000000000000"));
    expect(mockBalanceCheckerCall).toHaveBeenCalled();
  });

  it("falls back to batch RPC when BalanceChecker throws", async () => {
    mockBalanceCheckerCall.mockRejectedValue(new Error("Contract not found"));
    mockErc20BalanceOf.mockResolvedValue(BigInt("1000000000000000000"));
    mockErc20Decimals.mockResolvedValue(18);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchTokenBalances(
      "0x123",
      ["ETH"],
      [TOKENS.ETH],
      mockProvider
    );

    expect(result.method).toBe("batch_rpc");
    expect(result.balances).toHaveLength(1);
    expect(mockBalanceCheckerCall).toHaveBeenCalled();
    expect(mockErc20BalanceOf).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "BalanceChecker contract unavailable, falling back to batch RPC:",
      "Contract not found"
    );

    consoleSpy.mockRestore();
  });

  it("propagates error when both methods fail", async () => {
    mockBalanceCheckerCall.mockRejectedValue(new Error("BalanceChecker failed"));
    mockErc20BalanceOf.mockRejectedValue(new Error("RPC failed"));

    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      fetchTokenBalances("0x123", ["ETH"], [TOKENS.ETH], mockProvider)
    ).rejects.toThrow("RPC failed");
  });

  it("handles u256 {low, high} format from BalanceChecker", async () => {
    mockBalanceCheckerCall.mockResolvedValue([
      {
        token: BigInt(TOKENS.ETH),
        balance: { low: BigInt("1000000000000000000"), high: BigInt(0) },
      },
    ]);

    const result = await fetchTokenBalances(
      "0x123",
      ["ETH"],
      [TOKENS.ETH],
      mockProvider
    );

    expect(result.balances[0].balance).toBe(BigInt("1000000000000000000"));
  });

  it("returns zero balance for tokens not in BalanceChecker response", async () => {
    mockBalanceCheckerCall.mockResolvedValue([
      { token: BigInt(TOKENS.ETH), balance: BigInt("1000000000000000000") },
    ]);

    const result = await fetchTokenBalances(
      "0x123",
      ["ETH", "STRK"],
      [TOKENS.ETH, TOKENS.STRK],
      mockProvider
    );

    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].balance).toBe(BigInt("1000000000000000000"));
    expect(result.balances[1].balance).toBe(BigInt(0));
  });

  it("queries multiple tokens via batch RPC fallback", async () => {
    mockBalanceCheckerCall.mockRejectedValue(new Error("unavailable"));
    mockErc20BalanceOf
      .mockResolvedValueOnce(BigInt("1000000000000000000"))
      .mockResolvedValueOnce(BigInt("2000000000000000000"));
    mockErc20Decimals.mockResolvedValue(18);

    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await fetchTokenBalances(
      "0x123",
      ["ETH", "STRK"],
      [TOKENS.ETH, TOKENS.STRK],
      mockProvider
    );

    expect(result.method).toBe("batch_rpc");
    expect(result.balances).toHaveLength(2);
    expect(result.balances[0].balance).toBe(BigInt("1000000000000000000"));
    expect(result.balances[1].balance).toBe(BigInt("2000000000000000000"));
  });
});

describe("response format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetchTokenBalance returns balance and decimals", async () => {
    mockErc20BalanceOf.mockResolvedValue(BigInt("1500000000000000000"));
    mockErc20Decimals.mockResolvedValue(18);

    const result = await fetchTokenBalance("0x123", TOKENS.ETH, mockProvider);

    expect(result).toHaveProperty("balance", BigInt("1500000000000000000"));
    expect(result).toHaveProperty("decimals", 18);
  });

  it("fetchTokenBalances returns all required fields", async () => {
    mockBalanceCheckerCall.mockResolvedValue([
      { token: BigInt(TOKENS.ETH), balance: BigInt("1500000000000000000") },
    ]);

    const result = await fetchTokenBalances(
      "0x123",
      ["ETH"],
      [TOKENS.ETH],
      mockProvider
    );

    expect(result).toHaveProperty("method");
    expect(result).toHaveProperty("balances");
    expect(["balance_checker", "batch_rpc"]).toContain(result.method);

    const balance = result.balances[0];
    expect(balance).toHaveProperty("token", "ETH");
    expect(balance).toHaveProperty("tokenAddress", TOKENS.ETH);
    expect(balance).toHaveProperty("balance", BigInt("1500000000000000000"));
    expect(balance).toHaveProperty("decimals", 18);
  });
});
