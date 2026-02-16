import { describe, it, expect } from "vitest";
import { parseDecimalToBigInt } from "../../src/helpers/parseDecimal.js";

describe("parseDecimalToBigInt", () => {
  // ── Basic conversions ────────────────────────────────────────────────

  describe("basic conversions", () => {
    it("converts integer string with 18 decimals", () => {
      expect(parseDecimalToBigInt("1", 18)).toBe(1_000_000_000_000_000_000n);
    });

    it("converts integer string with 6 decimals", () => {
      expect(parseDecimalToBigInt("1", 6)).toBe(1_000_000n);
    });

    it("converts '1.5' with 18 decimals", () => {
      expect(parseDecimalToBigInt("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    });

    it("converts '0.1' with 6 decimals", () => {
      expect(parseDecimalToBigInt("0.1", 6)).toBe(100_000n);
    });

    it("converts '0.000001' with 6 decimals", () => {
      expect(parseDecimalToBigInt("0.000001", 6)).toBe(1n);
    });

    it("converts '0' with 18 decimals", () => {
      expect(parseDecimalToBigInt("0", 18)).toBe(0n);
    });

    it("converts '0.0' with 18 decimals", () => {
      expect(parseDecimalToBigInt("0.0", 18)).toBe(0n);
    });

    it("converts large integer '1000000' with 18 decimals", () => {
      expect(parseDecimalToBigInt("1000000", 18)).toBe(
        1_000_000_000_000_000_000_000_000n,
      );
    });
  });

  // ── Precision preservation ───────────────────────────────────────────

  describe("precision preservation", () => {
    it("handles 0.1 without floating-point loss", () => {
      // parseFloat("0.1") * 1e18 would give 99999999999999990 due to IEEE 754
      const result = parseDecimalToBigInt("0.1", 18);
      expect(result).toBe(100_000_000_000_000_000n);
    });

    it("handles 0.2 without floating-point loss", () => {
      const result = parseDecimalToBigInt("0.2", 18);
      expect(result).toBe(200_000_000_000_000_000n);
    });

    it("handles 0.3 without floating-point loss", () => {
      const result = parseDecimalToBigInt("0.3", 18);
      expect(result).toBe(300_000_000_000_000_000n);
    });

    it("handles 1.23456789 with 18 decimals precisely", () => {
      expect(parseDecimalToBigInt("1.23456789", 18)).toBe(
        1_234_567_890_000_000_000n,
      );
    });

    it("handles very small amounts: 0.000000000000000001 (1 wei)", () => {
      expect(parseDecimalToBigInt("0.000000000000000001", 18)).toBe(1n);
    });

    it("handles maximum ERC-20 balance string", () => {
      // 2^256 - 1 is the max uint256
      const maxStr = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      expect(parseDecimalToBigInt(maxStr, 0)).toBe(
        BigInt(maxStr),
      );
    });
  });

  // ── Fractional truncation ────────────────────────────────────────────

  describe("fractional truncation", () => {
    it("truncates excess decimal places", () => {
      // 6 decimals: "0.1234567" → truncated to "0.123456" → 123456n
      expect(parseDecimalToBigInt("0.1234567", 6)).toBe(123_456n);
    });

    it("truncates at exact boundary", () => {
      expect(parseDecimalToBigInt("0.123456", 6)).toBe(123_456n);
    });

    it("pads when fewer decimals than specified", () => {
      expect(parseDecimalToBigInt("0.1", 6)).toBe(100_000n);
    });

    it("0 decimals means integer only", () => {
      expect(parseDecimalToBigInt("42.999", 0)).toBe(42n);
    });
  });

  // ── Negative values are rejected ────────────────────────────────────

  describe("negative values", () => {
    it("rejects negative integer", () => {
      expect(() => parseDecimalToBigInt("-1", 18)).toThrow("non-negative");
    });

    it("rejects negative decimal", () => {
      expect(() => parseDecimalToBigInt("-0.5", 18)).toThrow("non-negative");
    });

    it("rejects negative zero", () => {
      expect(() => parseDecimalToBigInt("-0", 18)).toThrow("non-negative");
    });

    it("rejects negative zero with decimal", () => {
      expect(() => parseDecimalToBigInt("-0.0", 18)).toThrow("non-negative");
    });
  });

  // ── Whitespace handling ──────────────────────────────────────────────

  describe("whitespace handling", () => {
    it("trims leading spaces", () => {
      expect(parseDecimalToBigInt("  1.5", 18)).toBe(1_500_000_000_000_000_000n);
    });

    it("trims trailing spaces", () => {
      expect(parseDecimalToBigInt("1.5  ", 18)).toBe(1_500_000_000_000_000_000n);
    });

    it("trims both sides", () => {
      expect(parseDecimalToBigInt("  1.5  ", 18)).toBe(1_500_000_000_000_000_000n);
    });
  });

  // ── Invalid inputs ───────────────────────────────────────────────────

  describe("invalid inputs", () => {
    it("throws on empty string", () => {
      expect(() => parseDecimalToBigInt("", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on alphabetic input", () => {
      expect(() => parseDecimalToBigInt("abc", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on hex string", () => {
      expect(() => parseDecimalToBigInt("0xABC", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on multiple dots", () => {
      expect(() => parseDecimalToBigInt("1.2.3", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on comma-separated", () => {
      expect(() => parseDecimalToBigInt("1,000", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on scientific notation", () => {
      expect(() => parseDecimalToBigInt("1e18", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on plus sign prefix", () => {
      expect(() => parseDecimalToBigInt("+1", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on only whitespace", () => {
      expect(() => parseDecimalToBigInt("   ", 18)).toThrow("Invalid decimal amount");
    });

    it("throws on dot only", () => {
      expect(() => parseDecimalToBigInt(".", 18)).toThrow("Invalid decimal amount");
    });
  });

  // ── Property-based style tests (fuzz-like) ───────────────────────────

  describe("property-based invariants", () => {
    it("result is always >= 0 for non-negative inputs", () => {
      const values = ["0", "0.0", "1", "100.999", "0.000001", "999999999"];
      for (const v of values) {
        expect(parseDecimalToBigInt(v, 18)).toBeGreaterThanOrEqual(0n);
      }
    });

    it("integer input * 10^decimals equals result", () => {
      for (let i = 0; i < 20; i++) {
        const val = String(i);
        expect(parseDecimalToBigInt(val, 18)).toBe(BigInt(i) * 10n ** 18n);
      }
    });

    it("result increases monotonically with input", () => {
      const values = ["0.1", "0.2", "0.5", "1.0", "2.0", "10.0"];
      let prev = -1n;
      for (const v of values) {
        const result = parseDecimalToBigInt(v, 18);
        expect(result).toBeGreaterThan(prev);
        prev = result;
      }
    });

    it("conversion is inverse of division (integer values)", () => {
      // For integer values: parseDecimalToBigInt(n, d) / 10^d == n
      for (const n of [0, 1, 42, 1000, 999999]) {
        const result = parseDecimalToBigInt(String(n), 6);
        expect(result / (10n ** 6n)).toBe(BigInt(n));
      }
    });
  });
});
