import { describe, expect, it } from "vitest";
import {
  assertPositiveAmount,
  assertPrivateKeyFormat,
  assertRecipientAddressFormat,
  parseArgs,
  sanitizeErrorForLog,
} from "./lib";

describe("parseArgs", () => {
  it("defaults to user-paid mode", () => {
    const parsed = parseArgs([]);
    expect(parsed.sponsored).toBe(false);
    expect(parsed.amount).toBe("10");
  });

  it("supports sponsored mode explicitly", () => {
    const parsed = parseArgs(["--sponsored"]);
    expect(parsed.sponsored).toBe(true);
  });

  it("throws on missing --recipient value", () => {
    expect(() => parseArgs(["--recipient"])).toThrow(
      "Missing value for --recipient",
    );
  });

  it("throws on missing --amount value", () => {
    expect(() => parseArgs(["--amount"])).toThrow("Missing value for --amount");
  });

  it("throws on unknown arguments", () => {
    expect(() => parseArgs(["--wat"])).toThrow("Unknown argument: --wat");
  });
});

describe("validators", () => {
  it("validates private key format", () => {
    expect(() => assertPrivateKeyFormat("0x" + "a".repeat(64))).not.toThrow();
    expect(() => assertPrivateKeyFormat("abc")).toThrow(
      "Invalid PRIVATE_KEY format",
    );
  });

  it("validates recipient address format", () => {
    expect(() => assertRecipientAddressFormat("0x123abc")).not.toThrow();
    expect(() => assertRecipientAddressFormat("123abc")).toThrow(
      "Invalid recipient address format",
    );
  });

  it("rejects non-positive amounts", () => {
    expect(() => assertPositiveAmount("1")).not.toThrow();
    expect(() => assertPositiveAmount("0")).toThrow(
      "Amount must be a positive number.",
    );
    expect(() => assertPositiveAmount("-1")).toThrow(
      "Amount must be a positive number.",
    );
    expect(() => assertPositiveAmount("nope")).toThrow(
      "Amount must be a positive number.",
    );
  });
});

describe("sanitizeErrorForLog", () => {
  it("redacts hex private keys and secret assignments", () => {
    const message = `PRIVATE_KEY=0x${"b".repeat(64)} AVNU_PAYMASTER_API_KEY=secret_12345678901234567890`;
    const sanitized = sanitizeErrorForLog(new Error(message));
    expect(sanitized).not.toContain("secret_12345678901234567890");
    expect(sanitized).not.toContain("0x" + "b".repeat(64));
    expect(sanitized).toContain("PRIVATE_KEY=[redacted]");
    expect(sanitized).toContain("AVNU_PAYMASTER_API_KEY=[redacted]");
  });
});
