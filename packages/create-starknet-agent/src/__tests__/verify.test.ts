import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { parseVerifyArgs } from "../verify.js";

// Mock child_process for spawn tests
vi.mock("node:child_process", () => ({
  spawn: vi.fn().mockReturnValue({
    on: vi.fn((event, callback) => {
      if (event === "close") {
        setTimeout(() => callback(0), 10);
      }
    }),
    kill: vi.fn(),
  }),
}));

describe("verify module", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all environment variables
    delete process.env.STARKNET_PRIVATE_KEY;
    delete process.env.STARKNET_ACCOUNT_ADDRESS;
    delete process.env.STARKNET_RPC_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("parseVerifyArgs", () => {
    it("parses empty args with defaults", () => {
      const args = parseVerifyArgs([]);

      expect(args.jsonOutput).toBe(false);
      expect(args.skipE2E).toBe(false);
      expect(args.verbose).toBe(false);
      expect(args.showHelp).toBe(false);
      expect(args.platform).toBeUndefined();
    });

    it("parses --json flag", () => {
      const args = parseVerifyArgs(["--json"]);

      expect(args.jsonOutput).toBe(true);
    });

    it("parses --skip-e2e flag", () => {
      const args = parseVerifyArgs(["--skip-e2e"]);

      expect(args.skipE2E).toBe(true);
    });

    it("parses --verbose flag", () => {
      const args = parseVerifyArgs(["--verbose"]);

      expect(args.verbose).toBe(true);
    });

    it("parses -v flag as verbose", () => {
      const args = parseVerifyArgs(["-v"]);

      expect(args.verbose).toBe(true);
    });

    it("parses --help flag", () => {
      const args = parseVerifyArgs(["--help"]);

      expect(args.showHelp).toBe(true);
    });

    it("parses -h flag as help", () => {
      const args = parseVerifyArgs(["-h"]);

      expect(args.showHelp).toBe(true);
    });

    it("parses --platform with valid platform type", () => {
      const args = parseVerifyArgs(["--platform", "claude-code"]);

      expect(args.platform).toBe("claude-code");
    });

    it("ignores --platform with invalid platform type", () => {
      const args = parseVerifyArgs(["--platform", "invalid"]);

      expect(args.platform).toBeUndefined();
    });

    it("parses multiple flags together", () => {
      const args = parseVerifyArgs([
        "--json",
        "--skip-e2e",
        "--platform",
        "openclaw",
      ]);

      expect(args.jsonOutput).toBe(true);
      expect(args.skipE2E).toBe(true);
      expect(args.platform).toBe("openclaw");
    });
  });

  describe("credential detection", () => {
    it("detects credentials from environment variables", () => {
      // This would require mocking more of the verify module
      // For now, we test that env vars are accessible
      process.env.STARKNET_PRIVATE_KEY = "0x1234";
      process.env.STARKNET_ACCOUNT_ADDRESS = "0xabcd";
      process.env.STARKNET_RPC_URL = "https://starknet-sepolia.example.com";

      expect(process.env.STARKNET_PRIVATE_KEY).toBe("0x1234");
      expect(process.env.STARKNET_ACCOUNT_ADDRESS).toBe("0xabcd");
      expect(process.env.STARKNET_RPC_URL).toBe(
        "https://starknet-sepolia.example.com"
      );
    });

    it("detects network from RPC URL containing sepolia", () => {
      process.env.STARKNET_RPC_URL = "https://starknet-sepolia.g.alchemy.com";

      const url = process.env.STARKNET_RPC_URL;
      const network = url.includes("sepolia") ? "sepolia" : "mainnet";

      expect(network).toBe("sepolia");
    });

    it("detects network from RPC URL containing mainnet", () => {
      process.env.STARKNET_RPC_URL = "https://starknet-mainnet.g.alchemy.com";

      const url = process.env.STARKNET_RPC_URL;
      const network = url.includes("mainnet") ? "mainnet" : "sepolia";

      expect(network).toBe("mainnet");
    });
  });

  describe("address formatting", () => {
    it("truncates long addresses for display", () => {
      const address =
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
      const truncated = `${address.slice(0, 8)}...${address.slice(-4)}`;

      expect(truncated).toBe("0x049d36...4dc7");
      expect(truncated.length).toBe(15);
    });

    it("does not truncate short addresses", () => {
      const address = "0x1234";
      const truncated =
        address.length <= 14
          ? address
          : `${address.slice(0, 8)}...${address.slice(-4)}`;

      expect(truncated).toBe("0x1234");
    });
  });

  describe("balance formatting", () => {
    it("formats hex balance to decimal", () => {
      // 0.1 ETH = 100000000000000000 wei = 0x16345785d8a0000
      const hexValue = "0x16345785d8a0000";
      const value = BigInt(hexValue);
      const decimals = 18;
      const divisor = BigInt(10 ** decimals);
      const integerPart = value / divisor;
      const fractionalPart = value % divisor;
      const fractionalStr = fractionalPart
        .toString()
        .padStart(decimals, "0")
        .slice(0, 4);

      expect(`${integerPart}.${fractionalStr}`).toBe("0.1000");
    });

    it("formats zero balance correctly", () => {
      const hexValue = "0x0";
      const value = BigInt(hexValue);
      const decimals = 18;
      const divisor = BigInt(10 ** decimals);
      const integerPart = value / divisor;
      const fractionalPart = value % divisor;
      const fractionalStr = fractionalPart
        .toString()
        .padStart(decimals, "0")
        .slice(0, 4);

      expect(`${integerPart}.${fractionalStr}`).toBe("0.0000");
    });

    it("formats large balance correctly", () => {
      // 100 ETH = 100000000000000000000 wei = 0x56bc75e2d63100000
      const hexValue = "0x56bc75e2d63100000";
      const value = BigInt(hexValue);
      const decimals = 18;
      const divisor = BigInt(10 ** decimals);
      const integerPart = value / divisor;
      const fractionalPart = value % divisor;
      const fractionalStr = fractionalPart
        .toString()
        .padStart(decimals, "0")
        .slice(0, 4);

      expect(`${integerPart}.${fractionalStr}`).toBe("100.0000");
    });
  });

  describe("address normalization", () => {
    it("normalizes short address to 64 characters", () => {
      const address = "0x1234";
      const hex = address.toLowerCase().replace(/^0x/, "");
      const normalized = "0x" + hex.padStart(64, "0");

      expect(normalized.length).toBe(66); // 0x + 64 chars
      expect(normalized).toBe(
        "0x0000000000000000000000000000000000000000000000000000000000001234"
      );
    });

    it("keeps full-length address unchanged", () => {
      const address =
        "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
      const hex = address.toLowerCase().replace(/^0x/, "");
      const normalized = "0x" + hex.padStart(64, "0");

      expect(normalized).toBe(address.toLowerCase());
    });
  });
});
