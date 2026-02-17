import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getVTokenAddress,
  buildDepositCalls,
  buildWithdrawCalls,
  VESU_POOL_FACTORY,
  VESU_PRIME_POOL,
} from "../../src/helpers/vesu.js";

const TOKENS = {
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

// Valid Starknet addresses (must fit in felt252: < 2^251)
const MOCK_VTOKEN_STRK =
  "0x01a1b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";
const RECEIVER = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const OWNER = "0x0023456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("vesu helper", () => {
  describe("constants", () => {
    it("exports PoolFactory address", () => {
      expect(VESU_POOL_FACTORY).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it("exports Prime pool address", () => {
      expect(VESU_PRIME_POOL).toMatch(/^0x[0-9a-f]{64}$/i);
    });
  });

  describe("getVTokenAddress", () => {
    let mockCallContract: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockCallContract = vi.fn();
    });

    it("calls PoolFactory.v_token_for_asset with correct args", async () => {
      mockCallContract.mockResolvedValue([MOCK_VTOKEN_STRK]);

      const provider = { callContract: mockCallContract } as any;
      const result = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.STRK
      );

      expect(result).toBe(MOCK_VTOKEN_STRK);
      expect(mockCallContract).toHaveBeenCalledWith({
        contractAddress: VESU_POOL_FACTORY,
        entrypoint: "v_token_for_asset",
        calldata: [VESU_PRIME_POOL, TOKENS.STRK],
      });
    });

    it("returns vToken for USDC", async () => {
      const usdcVToken =
        "0x02b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";
      mockCallContract.mockResolvedValue([usdcVToken]);

      const provider = { callContract: mockCallContract } as any;
      const result = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.USDC
      );

      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
      expect(BigInt(result)).toBe(BigInt(usdcVToken));
    });

    it("normalizes vToken address to lowercase", async () => {
      mockCallContract.mockResolvedValue([
        "0x01A1B2C3D4E5F60708192A3B4C5D6E7F8090A1B2C3D4E5F60708192A3B4C5D6E",
      ]);

      const provider = { callContract: mockCallContract } as any;
      const result = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.STRK
      );

      expect(result).toBe(MOCK_VTOKEN_STRK);
    });

    it("throws when PoolFactory returns empty", async () => {
      mockCallContract.mockResolvedValue([]);

      const provider = { callContract: mockCallContract } as any;
      await expect(
        getVTokenAddress(provider, VESU_PRIME_POOL, TOKENS.STRK)
      ).rejects.toThrow("vToken not found");
    });

    it("propagates RPC errors", async () => {
      mockCallContract.mockRejectedValue(new Error("RPC failed"));

      const provider = { callContract: mockCallContract } as any;
      await expect(
        getVTokenAddress(provider, VESU_PRIME_POOL, TOKENS.STRK)
      ).rejects.toThrow("RPC failed");
    });
  });

  describe("buildDepositCalls", () => {
    it("returns approve + deposit in correct order", () => {
      const amountWei = 1_000_000_000_000_000_000n; // 1 STRK
      const calls = buildDepositCalls(
        TOKENS.STRK,
        MOCK_VTOKEN_STRK,
        amountWei,
        RECEIVER
      );

      expect(calls).toHaveLength(2);

      expect(calls[0].contractAddress).toBe(TOKENS.STRK);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[0].calldata).toBeDefined();
      expect(calls[0].calldata!.length).toBeGreaterThan(0);

      expect(calls[1].contractAddress).toBe(MOCK_VTOKEN_STRK);
      expect(calls[1].entrypoint).toBe("deposit");
      expect(calls[1].calldata).toBeDefined();
      expect(calls[1].calldata!.length).toBeGreaterThan(0);
    });

    it("approve calldata has spender and amount (u256)", () => {
      const calls = buildDepositCalls(
        TOKENS.STRK,
        MOCK_VTOKEN_STRK,
        1000n,
        RECEIVER
      );
      const approveCalldata = calls[0].calldata as string[];
      expect(approveCalldata).toHaveLength(3); // spender, amount.low, amount.high
      expect(BigInt(approveCalldata[0])).toBe(BigInt(MOCK_VTOKEN_STRK));
    });

    it("deposit calldata has assets (u256) and receiver", () => {
      const calls = buildDepositCalls(
        TOKENS.STRK,
        MOCK_VTOKEN_STRK,
        1000n,
        RECEIVER
      );
      const depositCalldata = calls[1].calldata as string[];
      expect(depositCalldata).toHaveLength(3); // assets.low, assets.high, receiver
      expect(BigInt(depositCalldata[2])).toBe(BigInt(RECEIVER));
    });

    it("rejects zero amount", () => {
      expect(() =>
        buildDepositCalls(TOKENS.STRK, MOCK_VTOKEN_STRK, 0n, RECEIVER)
      ).toThrow("amount must be positive");
    });

    it("rejects negative amount", () => {
      expect(() =>
        buildDepositCalls(TOKENS.STRK, MOCK_VTOKEN_STRK, -1n, RECEIVER)
      ).toThrow("amount must be positive");
    });

    it("handles large amounts (u256)", () => {
      const large = (1n << 128n) - 1n;
      const calls = buildDepositCalls(
        TOKENS.STRK,
        MOCK_VTOKEN_STRK,
        large,
        RECEIVER
      );
      expect(calls).toHaveLength(2);
      expect(calls[0].calldata).toBeDefined();
      expect(calls[1].calldata).toBeDefined();
    });
  });

  describe("buildWithdrawCalls", () => {
    it("returns single withdraw call", () => {
      const amountWei = 1_000_000n; // 1 USDC
      const calls = buildWithdrawCalls(
        MOCK_VTOKEN_STRK,
        amountWei,
        RECEIVER,
        OWNER
      );

      expect(calls).toHaveLength(1);
      expect(calls[0].contractAddress).toBe(MOCK_VTOKEN_STRK);
      expect(calls[0].entrypoint).toBe("withdraw");
      expect(calls[0].calldata).toBeDefined();
      expect(calls[0].calldata!.length).toBeGreaterThan(0);
    });

    it("withdraw calldata: assets (u256), receiver, owner", () => {
      const amountWei = 500_000n;
      const calls = buildWithdrawCalls(
        MOCK_VTOKEN_STRK,
        amountWei,
        RECEIVER,
        OWNER
      );
      const calldata = calls[0].calldata as string[];
      expect(calldata).toHaveLength(4); // assets.low, assets.high, receiver, owner
      expect(BigInt(calldata[2])).toBe(BigInt(RECEIVER));
      expect(BigInt(calldata[3])).toBe(BigInt(OWNER));
    });

    it("rejects zero amount", () => {
      expect(() =>
        buildWithdrawCalls(MOCK_VTOKEN_STRK, 0n, RECEIVER, OWNER)
      ).toThrow("amount must be positive");
    });

    it("rejects negative amount", () => {
      expect(() =>
        buildWithdrawCalls(MOCK_VTOKEN_STRK, -1n, RECEIVER, OWNER)
      ).toThrow("amount must be positive");
    });

    it("owner and receiver can be same address", () => {
      const calls = buildWithdrawCalls(
        MOCK_VTOKEN_STRK,
        100n,
        RECEIVER,
        RECEIVER
      );
      expect(calls).toHaveLength(1);
      const calldata = calls[0].calldata as string[];
      expect(calldata).toHaveLength(4);
      expect(BigInt(calldata[2])).toBe(BigInt(calldata[3]));
    });
  });

  describe("edge cases and invalid inputs", () => {
    it("buildDepositCalls throws on invalid asset address", () => {
      expect(() =>
        buildDepositCalls("0xinvalid", MOCK_VTOKEN_STRK, 100n, RECEIVER)
      ).toThrow();
    });

    it("buildDepositCalls throws on invalid vToken address", () => {
      expect(() =>
        buildDepositCalls(TOKENS.STRK, "not-an-address", 100n, RECEIVER)
      ).toThrow();
    });

    it("buildDepositCalls throws on invalid receiver", () => {
      expect(() =>
        buildDepositCalls(TOKENS.STRK, MOCK_VTOKEN_STRK, 100n, "")
      ).toThrow();
    });

    it("buildWithdrawCalls throws on invalid vToken address", () => {
      expect(() =>
        buildWithdrawCalls("0xinvalid", 100n, RECEIVER, OWNER)
      ).toThrow();
    });

    it("getVTokenAddress rejects empty calldata response", async () => {
      const mockCall = vi.fn().mockResolvedValue([]);
      const provider = { callContract: mockCall } as any;
      await expect(
        getVTokenAddress(provider, VESU_PRIME_POOL, TOKENS.STRK)
      ).rejects.toThrow("vToken not found");
    });

    it("getVTokenAddress handles result wrapped in object", async () => {
      const mockCall = vi.fn().mockResolvedValue({ result: [MOCK_VTOKEN_STRK] });
      const prov = { callContract: mockCall } as any;
      const result = await getVTokenAddress(prov, VESU_PRIME_POOL, TOKENS.STRK);
      expect(result).toBe(MOCK_VTOKEN_STRK);
    });
  });

  describe("fuzz / property-based", () => {
    it("buildDepositCalls amount equals parsed input for various values", () => {
      const amounts = [
        1n,
        1000n,
        1_000_000n,
        1_000_000_000_000_000_000n,
        (1n << 128n) - 1n,
      ];
      for (const parsed of amounts) {
        const calls = buildDepositCalls(
          TOKENS.STRK,
          MOCK_VTOKEN_STRK,
          parsed,
          RECEIVER
        );
        const depositCalldata = calls[1].calldata as string[];
        const assetsLow = BigInt(depositCalldata[0]);
        const assetsHigh = BigInt(depositCalldata[1] ?? 0);
        const assets = assetsLow + (assetsHigh << 128n);
        expect(assets).toBe(parsed);
      }
    });

    it("buildWithdrawCalls preserves amount through u256 encoding", () => {
      const amounts = [1n, 1000n, 1_000_000n, 1_000_000_000_000_000_000n];
      for (const amt of amounts) {
        const calls = buildWithdrawCalls(
          MOCK_VTOKEN_STRK,
          amt,
          RECEIVER,
          OWNER
        );
        const calldata = calls[0].calldata as string[];
        const assetsLow = BigInt(calldata[0]);
        const assetsHigh = BigInt(calldata[1] ?? 0);
        const assets = assetsLow + (assetsHigh << 128n);
        expect(assets).toBe(amt);
      }
    });
  });
});
