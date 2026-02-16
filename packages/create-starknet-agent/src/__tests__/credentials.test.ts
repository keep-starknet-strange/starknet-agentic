/**
 * Tests for credentials module
 */

import { describe, it, expect } from "vitest";
import {
  isValidAddress,
  isValidPrivateKey,
  isValidRpcUrl,
  validateCredentials,
  parseCredentialsArgs,
} from "../credentials.js";

describe("credentials", () => {
  describe("isValidAddress", () => {
    it("accepts valid Starknet addresses", () => {
      // Full length address
      expect(
        isValidAddress("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7")
      ).toBe(true);

      // Short address (leading zeros omitted)
      expect(isValidAddress("0x1234")).toBe(true);

      // Minimum valid address
      expect(isValidAddress("0x1")).toBe(true);

      // Mixed case hex
      expect(isValidAddress("0xAbCdEf1234567890")).toBe(true);
    });

    it("rejects invalid addresses", () => {
      // Missing 0x prefix
      expect(isValidAddress("1234")).toBe(false);

      // Empty after 0x
      expect(isValidAddress("0x")).toBe(false);

      // Non-hex characters
      expect(isValidAddress("0xGHIJ")).toBe(false);

      // Too long (more than 64 hex chars)
      expect(
        isValidAddress("0x" + "a".repeat(65))
      ).toBe(false);

      // Empty string
      expect(isValidAddress("")).toBe(false);
    });
  });

  describe("isValidPrivateKey", () => {
    it("accepts valid private keys", () => {
      // Full length key
      expect(
        isValidPrivateKey("0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7")
      ).toBe(true);

      // Shorter key
      expect(isValidPrivateKey("0xabc123")).toBe(true);
    });

    it("rejects invalid private keys", () => {
      // Missing 0x prefix
      expect(isValidPrivateKey("abc123")).toBe(false);

      // Empty after 0x
      expect(isValidPrivateKey("0x")).toBe(false);

      // Non-hex characters
      expect(isValidPrivateKey("0xZZZ")).toBe(false);
    });
  });

  describe("isValidRpcUrl", () => {
    it("accepts valid RPC URLs", () => {
      expect(isValidRpcUrl("https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/test")).toBe(true);
      expect(isValidRpcUrl("http://localhost:5050")).toBe(true);
      expect(isValidRpcUrl("https://api.example.com/rpc")).toBe(true);
    });

    it("rejects invalid URLs", () => {
      expect(isValidRpcUrl("not-a-url")).toBe(false);
      expect(isValidRpcUrl("ftp://example.com")).toBe(false);
      expect(isValidRpcUrl("")).toBe(false);
    });
  });

  describe("validateCredentials", () => {
    it("validates correct credentials", () => {
      const result = validateCredentials(
        "0x1234567890abcdef",
        "0xabcdef1234567890",
        "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/test"
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("reports invalid address", () => {
      const result = validateCredentials(
        "invalid-address",
        "0xabcdef1234567890",
        "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/test"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid address format (expected 0x + 1-64 hex characters)"
      );
    });

    it("reports invalid private key", () => {
      const result = validateCredentials(
        "0x1234567890abcdef",
        "invalid-key",
        "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/test"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Invalid private key format (expected 0x + 1-64 hex characters)"
      );
    });

    it("reports missing credentials", () => {
      const result = validateCredentials("", "", "");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Account address is required");
      expect(result.errors).toContain("Private key is required");
    });

    it("warns about missing RPC URL", () => {
      const result = validateCredentials(
        "0x1234567890abcdef",
        "0xabcdef1234567890",
        ""
      );

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        "No RPC URL provided, will use default public RPC"
      );
    });

    it("reports invalid RPC URL", () => {
      const result = validateCredentials(
        "0x1234567890abcdef",
        "0xabcdef1234567890",
        "not-a-url"
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Invalid RPC URL format");
    });
  });

  describe("parseCredentialsArgs", () => {
    it("parses --from-env flag", () => {
      const result = parseCredentialsArgs(["--from-env"]);
      expect(result.fromEnv).toBe(true);
    });

    it("parses --from-ready flag", () => {
      const result = parseCredentialsArgs(["--from-ready"]);
      expect(result.fromReady).toBe(true);
    });

    it("parses --from-braavos flag", () => {
      const result = parseCredentialsArgs(["--from-braavos"]);
      expect(result.fromBraavos).toBe(true);
    });

    it("parses --platform flag", () => {
      const result = parseCredentialsArgs(["--platform", "openclaw"]);
      expect(result.platform).toBe("openclaw");
    });

    it("parses --network flag", () => {
      const result = parseCredentialsArgs(["--network", "mainnet"]);
      expect(result.network).toBe("mainnet");
    });

    it("parses --json flag", () => {
      const result = parseCredentialsArgs(["--json"]);
      expect(result.jsonOutput).toBe(true);
    });

    it("parses --help flag", () => {
      const result = parseCredentialsArgs(["--help"]);
      expect(result.showHelp).toBe(true);
    });

    it("parses multiple flags", () => {
      const result = parseCredentialsArgs([
        "--platform",
        "claude-code",
        "--network",
        "sepolia",
        "--from-env",
      ]);
      expect(result.platform).toBe("claude-code");
      expect(result.network).toBe("sepolia");
      expect(result.fromEnv).toBe(true);
    });

    it("ignores invalid platform", () => {
      const result = parseCredentialsArgs(["--platform", "invalid"]);
      expect(result.platform).toBeUndefined();
    });

    it("ignores invalid network", () => {
      const result = parseCredentialsArgs(["--network", "invalid"]);
      expect(result.network).toBeUndefined();
    });
  });
});
