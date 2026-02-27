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

  it("parses --recipient and --amount values", () => {
    const parsed = parseArgs(["--recipient", "0xabc", "--amount", "42"]);
    expect(parsed.recipient).toBe("0xabc");
    expect(parsed.amount).toBe("42");
  });

  it("supports --address-only and --evidence flags", () => {
    const parsed = parseArgs(["--address-only", "--evidence"]);
    expect(parsed.addressOnly).toBe(true);
    expect(parsed.evidence).toBe(true);
  });

  it("merges boolean flags and value arguments", () => {
    const parsed = parseArgs([
      "--sponsored",
      "--address-only",
      "--recipient",
      "0xabc",
      "--amount",
      "5",
      "--evidence",
    ]);
    expect(parsed.sponsored).toBe(true);
    expect(parsed.addressOnly).toBe(true);
    expect(parsed.evidence).toBe(true);
    expect(parsed.recipient).toBe("0xabc");
    expect(parsed.amount).toBe("5");
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
    expect(() => assertRecipientAddressFormat("0x" + "a".repeat(64))).not.toThrow();
    expect(() => assertRecipientAddressFormat("0x" + "a".repeat(65))).toThrow(
      "Invalid recipient address format",
    );
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

  it("redacts literal env-var secrets set in process.env", () => {
    const originalPrivateKey = process.env.PRIVATE_KEY;
    const originalPaymasterKey = process.env.AVNU_PAYMASTER_API_KEY;
    process.env.PRIVATE_KEY = "plain-private-key-value";
    process.env.AVNU_PAYMASTER_API_KEY = "plain-paymaster-secret";

    try {
      const sanitized = sanitizeErrorForLog(
        new Error(
          "Request failed with plain-private-key-value and plain-paymaster-secret",
        ),
      );
      expect(sanitized).not.toContain("plain-private-key-value");
      expect(sanitized).not.toContain("plain-paymaster-secret");
      expect(sanitized).toContain("[redacted-secret]");
    } finally {
      if (originalPrivateKey === undefined) {
        delete process.env.PRIVATE_KEY;
      } else {
        process.env.PRIVATE_KEY = originalPrivateKey;
      }
      if (originalPaymasterKey === undefined) {
        delete process.env.AVNU_PAYMASTER_API_KEY;
      } else {
        process.env.AVNU_PAYMASTER_API_KEY = originalPaymasterKey;
      }
    }
  });

  it("handles non-Error inputs", () => {
    expect(sanitizeErrorForLog("plain string error")).toBe("plain string error");
    expect(sanitizeErrorForLog(42)).toBe("42");
    expect(sanitizeErrorForLog({ code: "oops" })).toBe("[object Object]");
  });
});
