/**
 * Vesu integration tests — run against real Starknet mainnet RPC.
 * Skipped when STARKNET_RPC_URL is not set or is a mock URL.
 *
 * Run manually: STARKNET_RPC_URL=https://starknet-mainnet.public.blastapi.io pnpm test vesu.integration
 */

import { describe, it, expect, beforeAll } from "vitest";
import { RpcProvider } from "starknet";
import {
  getVTokenAddress,
  buildDepositCalls,
  buildWithdrawCalls,
  VESU_POOL_FACTORY,
  VESU_PRIME_POOL,
} from "../../src/helpers/vesu.js";

const MAINNET_RPC = process.env.STARKNET_RPC_URL;

function isMockOrSepoliaRpc(url?: string): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "example.com" || host.endsWith(".example.com") || host.includes("sepolia");
  } catch {
    const normalized = url.toLowerCase();
    return (
      normalized === "example.com" ||
      normalized.endsWith(".example.com") ||
      normalized.includes("sepolia")
    );
  }
}

const SKIP_REASON = isMockOrSepoliaRpc(MAINNET_RPC);

const TOKENS = {
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
};

describe.skipIf(SKIP_REASON)("Vesu integration (live RPC)", () => {
  let provider: RpcProvider;

  beforeAll(() => {
    provider = new RpcProvider({ nodeUrl: MAINNET_RPC! });
  });

  describe("getVTokenAddress", () => {
    it("fetches vToken for STRK in Prime pool", async () => {
      const vToken = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.STRK
      );
      expect(vToken).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(vToken).not.toBe(TOKENS.STRK);
      expect(vToken).not.toBe(VESU_PRIME_POOL);
    });

    it("fetches vToken for USDC in Prime pool", async () => {
      const vToken = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.USDC
      );
      expect(vToken).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(vToken).not.toBe(TOKENS.USDC);
    });

    it("fetches vToken for ETH in Prime pool", async () => {
      const vToken = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.ETH
      );
      expect(vToken).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it("returns different vTokens for different assets", async () => {
      const [strkVToken, usdcVToken] = await Promise.all([
        getVTokenAddress(provider, VESU_PRIME_POOL, TOKENS.STRK),
        getVTokenAddress(provider, VESU_PRIME_POOL, TOKENS.USDC),
      ]);
      expect(strkVToken).not.toBe(usdcVToken);
    });
  });

  describe("vToken balanceOf and convert_to_assets", () => {
    it("calls balance_of on vToken (zero balance address)", async () => {
      const vToken = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.STRK
      );
      const zeroAddr =
        "0x0000000000000000000000000000000000000000000000000000000000000001";

      const result = await provider.callContract({
        contractAddress: vToken,
        entrypoint: "balance_of",
        calldata: [zeroAddr],
      });

      const arr = Array.isArray(result) ? result : (result as { result?: string[] }).result ?? [];
      expect(arr.length).toBeGreaterThanOrEqual(2);
      const low = BigInt(arr[0]);
      const high = BigInt(arr[1] ?? 0);
      expect(low).toBe(0n);
      expect(high).toBe(0n);
    });

    it("calls convert_to_assets with shares", async () => {
      const vToken = await getVTokenAddress(
        provider,
        VESU_PRIME_POOL,
        TOKENS.STRK
      );
      const oneStrk = 1_000_000_000_000_000_000n;
      const sharesLow = oneStrk & ((1n << 128n) - 1n);
      const sharesHigh = oneStrk >> 128n;

      const result = await provider.callContract({
        contractAddress: vToken,
        entrypoint: "convert_to_assets",
        calldata: [sharesLow.toString(), sharesHigh.toString()],
      });

      const arr = Array.isArray(result) ? result : (result as { result?: string[] }).result ?? [];
      expect(arr.length).toBeGreaterThanOrEqual(2);
      const low = BigInt(arr[0]);
      const high = BigInt(arr[1] ?? 0);
      const assets = low + (high << 128n);
      expect(assets).toBeGreaterThanOrEqual(0n);
    });
  });

  describe("buildDepositCalls / buildWithdrawCalls", () => {
    it("buildDepositCalls produces valid call structure", () => {
      const receiver =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const vToken =
        "0x01a1b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";
      const calls = buildDepositCalls(
        TOKENS.STRK,
        vToken,
        1_000_000_000_000_000_000n,
        receiver
      );
      expect(calls).toHaveLength(2);
      expect(calls[0].entrypoint).toBe("approve");
      expect(calls[1].entrypoint).toBe("deposit");
      expect(calls[0].calldata).toBeDefined();
      expect(calls[1].calldata).toBeDefined();
    });

    it("buildWithdrawCalls produces valid call structure", () => {
      const owner =
        "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const vToken =
        "0x01a1b2c3d4e5f60708192a3b4c5d6e7f8090a1b2c3d4e5f60708192a3b4c5d6e";
      const calls = buildWithdrawCalls(vToken, 1_000_000n, owner, owner);
      expect(calls).toHaveLength(1);
      expect(calls[0].entrypoint).toBe("withdraw");
      expect(calls[0].calldata).toHaveLength(4);
    });
  });
});
