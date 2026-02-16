import { describe, it, expect } from "vitest";
import {
  PolicyGuard,
  compareDecimalStrings,
  type PolicyConfig,
} from "../../src/middleware/policyGuard.js";

describe("PolicyGuard", () => {
  // ── Transfer policy ──────────────────────────────────────────────────

  describe("starknet_transfer", () => {
    it("allows transfer when no policy is configured", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "1000",
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks transfer exceeding maxAmountPerCall", () => {
      const guard = new PolicyGuard({
        transfer: { maxAmountPerCall: "100" },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "150",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("150");
      expect(result.reason).toContain("100");
    });

    it("allows transfer within maxAmountPerCall", () => {
      const guard = new PolicyGuard({
        transfer: { maxAmountPerCall: "100" },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "50",
      });
      expect(result.allowed).toBe(true);
    });

    it("allows transfer at exact maxAmountPerCall", () => {
      const guard = new PolicyGuard({
        transfer: { maxAmountPerCall: "100" },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "100",
      });
      expect(result.allowed).toBe(true);
    });

    it("handles decimal amounts in maxAmountPerCall", () => {
      const guard = new PolicyGuard({
        transfer: { maxAmountPerCall: "1.5" },
      });
      const blocked = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "1.6",
      });
      expect(blocked.allowed).toBe(false);

      const allowed = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "1.4",
      });
      expect(allowed.allowed).toBe(true);
    });

    it("blocks transfer to non-allowed recipient", () => {
      const guard = new PolicyGuard({
        transfer: {
          allowedRecipients: [
            "0x0111111111111111111111111111111111111111111111111111111111111111",
          ],
        },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0x0222222222222222222222222222222222222222222222222222222222222222",
        token: "ETH",
        amount: "1",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the allowed recipients");
    });

    it("allows transfer to allowed recipient (case-insensitive)", () => {
      const guard = new PolicyGuard({
        transfer: {
          allowedRecipients: [
            "0x0ABC111111111111111111111111111111111111111111111111111111111111",
          ],
        },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0x0abc111111111111111111111111111111111111111111111111111111111111",
        token: "ETH",
        amount: "1",
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks transfer to blocked recipient", () => {
      const guard = new PolicyGuard({
        transfer: {
          blockedRecipients: [
            "0x0bad000000000000000000000000000000000000000000000000000000000000",
          ],
        },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0x0bad000000000000000000000000000000000000000000000000000000000000",
        token: "ETH",
        amount: "1",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked by policy");
    });

    it("blocks transfer of non-allowed token", () => {
      const guard = new PolicyGuard({
        transfer: { allowedTokens: ["ETH", "STRK"] },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "USDC",
        amount: "100",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the allowed tokens");
    });

    it("allows transfer of allowed token (case-insensitive)", () => {
      const guard = new PolicyGuard({
        transfer: { allowedTokens: ["ETH", "STRK"] },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "eth",
        amount: "1",
      });
      expect(result.allowed).toBe(true);
    });
  });

  // ── Invoke policy ────────────────────────────────────────────────────

  describe("starknet_invoke_contract", () => {
    it("blocks privileged entrypoints by default (no explicit policy)", () => {
      const guard = new PolicyGuard({});
      const blocked = [
        "upgrade",
        "set_owner",
        "transfer_ownership",
        "transferOwnership",
        "renounce_ownership",
        "register_session_key",
        "revoke_session_key",
        "emergency_revoke_all",
        "schedule_upgrade",
        "execute_upgrade",
      ];

      for (const entrypoint of blocked) {
        const result = guard.evaluate("starknet_invoke_contract", {
          contractAddress: "0xabc",
          entrypoint,
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("blocked by default security policy");
        expect(result.reason).toContain(entrypoint);
      }
    });

    it("allows non-privileged entrypoints", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_invoke_contract", {
        contractAddress: "0xabc",
        entrypoint: "transfer",
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks custom blocked entrypoints", () => {
      const guard = new PolicyGuard({
        invoke: { blockedEntrypoints: ["dangerous_function"] },
      });
      const result = guard.evaluate("starknet_invoke_contract", {
        contractAddress: "0xabc",
        entrypoint: "dangerous_function",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked by policy");
    });

    it("blocks invoke to non-allowed contract", () => {
      const guard = new PolicyGuard({
        invoke: {
          allowedContracts: [
            "0x0111111111111111111111111111111111111111111111111111111111111111",
          ],
        },
      });
      const result = guard.evaluate("starknet_invoke_contract", {
        contractAddress: "0x0222222222222222222222222222222222222222222222222222222222222222",
        entrypoint: "transfer",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not in the allowed contracts");
    });

    it("allows invoke to allowed contract", () => {
      const guard = new PolicyGuard({
        invoke: {
          allowedContracts: [
            "0x0111111111111111111111111111111111111111111111111111111111111111",
          ],
        },
      });
      const result = guard.evaluate("starknet_invoke_contract", {
        contractAddress: "0x0111111111111111111111111111111111111111111111111111111111111111",
        entrypoint: "transfer",
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks invoke to blocked contract", () => {
      const guard = new PolicyGuard({
        invoke: {
          blockedContracts: [
            "0x0bad000000000000000000000000000000000000000000000000000000000000",
          ],
        },
      });
      const result = guard.evaluate("starknet_invoke_contract", {
        contractAddress: "0x0bad000000000000000000000000000000000000000000000000000000000000",
        entrypoint: "transfer",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked by policy");
    });
  });

  // ── Swap policy ──────────────────────────────────────────────────────

  describe("starknet_swap", () => {
    it("allows swap when no policy is configured", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "100",
        slippage: 0.05,
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks swap exceeding maxSlippage", () => {
      const guard = new PolicyGuard({
        swap: { maxSlippage: 0.03 },
      });
      const result = guard.evaluate("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
        slippage: 0.05,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Slippage");
      expect(result.reason).toContain("0.03");
    });

    it("allows swap within maxSlippage", () => {
      const guard = new PolicyGuard({
        swap: { maxSlippage: 0.03 },
      });
      const result = guard.evaluate("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "1",
        slippage: 0.02,
      });
      expect(result.allowed).toBe(true);
    });

    it("blocks swap exceeding maxAmountPerCall", () => {
      const guard = new PolicyGuard({
        swap: { maxAmountPerCall: "10" },
      });
      const result = guard.evaluate("starknet_swap", {
        sellToken: "ETH",
        buyToken: "USDC",
        amount: "50",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("50");
      expect(result.reason).toContain("10");
    });

    it("blocks swap into blocked buy token", () => {
      const guard = new PolicyGuard({
        swap: { blockedBuyTokens: ["SCAM_TOKEN"] },
      });
      const result = guard.evaluate("starknet_swap", {
        sellToken: "ETH",
        buyToken: "SCAM_TOKEN",
        amount: "1",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("blocked by policy");
    });

    it("blocked buy token check is case-insensitive", () => {
      const guard = new PolicyGuard({
        swap: { blockedBuyTokens: ["scam_token"] },
      });
      const result = guard.evaluate("starknet_swap", {
        sellToken: "ETH",
        buyToken: "SCAM_TOKEN",
        amount: "1",
      });
      expect(result.allowed).toBe(false);
    });
  });

  // ── Build calls policy ───────────────────────────────────────────────

  describe("starknet_build_calls", () => {
    it("blocks build_calls containing privileged entrypoints", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_build_calls", {
        calls: [
          { contractAddress: "0xabc", entrypoint: "transfer" },
          { contractAddress: "0xdef", entrypoint: "upgrade" },
        ],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("calls[1]");
      expect(result.reason).toContain("upgrade");
    });

    it("allows build_calls with safe entrypoints", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_build_calls", {
        calls: [
          { contractAddress: "0xabc", entrypoint: "transfer" },
          { contractAddress: "0xdef", entrypoint: "approve" },
        ],
      });
      expect(result.allowed).toBe(true);
    });

    it("applies invoke contract policy to each call in build_calls", () => {
      const guard = new PolicyGuard({
        invoke: {
          blockedContracts: ["0x0bad"],
        },
      });
      const result = guard.evaluate("starknet_build_calls", {
        calls: [
          { contractAddress: "0x0bad", entrypoint: "transfer" },
        ],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("calls[0]");
    });
  });

  // ── denyUnknownTools ─────────────────────────────────────────────────

  describe("denyUnknownTools", () => {
    it("allows unknown tools by default", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_get_balance", {});
      expect(result.allowed).toBe(true);
    });

    it("blocks unknown tools when denyUnknownTools is true", () => {
      const guard = new PolicyGuard({ denyUnknownTools: true });
      const result = guard.evaluate("starknet_get_balance", {});
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not covered by policy");
    });

    it("still evaluates known tools normally when denyUnknownTools is true", () => {
      const guard = new PolicyGuard({
        denyUnknownTools: true,
        transfer: { maxAmountPerCall: "100" },
      });
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
        amount: "50",
      });
      expect(result.allowed).toBe(true);
    });
  });

  // ── Adversarial cases ────────────────────────────────────────────────

  describe("adversarial cases", () => {
    it("blocks multicall encoding privileged selectors via build_calls", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_build_calls", {
        calls: [
          { contractAddress: "0xabc", entrypoint: "transfer" },
          { contractAddress: "0xabc", entrypoint: "set_owner" },
          { contractAddress: "0xabc", entrypoint: "transfer" },
        ],
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("calls[1]");
      expect(result.reason).toContain("set_owner");
    });

    it("handles missing args gracefully", () => {
      const guard = new PolicyGuard({
        transfer: { maxAmountPerCall: "100" },
      });
      // Missing amount
      const result = guard.evaluate("starknet_transfer", {
        recipient: "0xabc",
        token: "ETH",
      });
      expect(result.allowed).toBe(true);
    });

    it("handles undefined calls in build_calls", () => {
      const guard = new PolicyGuard({});
      const result = guard.evaluate("starknet_build_calls", {});
      expect(result.allowed).toBe(true);
    });

    it("combined policy: amount + recipient + token checks all run", () => {
      const guard = new PolicyGuard({
        transfer: {
          maxAmountPerCall: "100",
          allowedRecipients: ["0xgood"],
          allowedTokens: ["ETH"],
        },
      });

      // Amount violation (checked first)
      const r1 = guard.evaluate("starknet_transfer", {
        recipient: "0xgood",
        token: "ETH",
        amount: "200",
      });
      expect(r1.allowed).toBe(false);
      expect(r1.reason).toContain("exceeds policy limit");

      // Recipient violation
      const r2 = guard.evaluate("starknet_transfer", {
        recipient: "0xbad",
        token: "ETH",
        amount: "50",
      });
      expect(r2.allowed).toBe(false);
      expect(r2.reason).toContain("not in the allowed recipients");

      // Token violation
      const r3 = guard.evaluate("starknet_transfer", {
        recipient: "0xgood",
        token: "USDC",
        amount: "50",
      });
      expect(r3.allowed).toBe(false);
      expect(r3.reason).toContain("not in the allowed tokens");

      // All pass
      const r4 = guard.evaluate("starknet_transfer", {
        recipient: "0xgood",
        token: "ETH",
        amount: "50",
      });
      expect(r4.allowed).toBe(true);
    });
  });
});

describe("compareDecimalStrings", () => {
  it("compares integer strings", () => {
    expect(compareDecimalStrings("10", "20")).toBe(-1);
    expect(compareDecimalStrings("20", "10")).toBe(1);
    expect(compareDecimalStrings("10", "10")).toBe(0);
  });

  it("compares decimal strings", () => {
    expect(compareDecimalStrings("1.5", "1.6")).toBe(-1);
    expect(compareDecimalStrings("1.6", "1.5")).toBe(1);
    expect(compareDecimalStrings("1.5", "1.5")).toBe(0);
  });

  it("returns 0 for NaN inputs", () => {
    expect(compareDecimalStrings("abc", "10")).toBe(0);
    expect(compareDecimalStrings("10", "abc")).toBe(0);
  });
});
