import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateExecutionSafety } from "../src/safety.js";

describe("execution safety", () => {
  const base = {
    runMode: "execute" as const,
    decisionAction: "ENTER" as const,
    notionalUsd: 1000,
    maxNotionalUsd: 1200,
    spotQuoteAgeMs: 200,
    perpSnapshotAgeMs: 200,
    feesAgeMs: 200,
    maxDataAgeMs: 5000,
  };

  it("blocks in dry-run mode", () => {
    const result = evaluateExecutionSafety({ ...base, runMode: "dry-run" });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, "BLOCK_DRY_RUN_MODE");
  });

  it("blocks when decision action is not ENTER", () => {
    const result = evaluateExecutionSafety({ ...base, decisionAction: "HOLD" });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, "BLOCK_NO_ENTER_SIGNAL");
  });

  it("blocks when notional exceeds cap", () => {
    const result = evaluateExecutionSafety({ ...base, maxNotionalUsd: 500 });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, "BLOCK_NOTIONAL_OVER_CAP");
  });

  it("blocks stale data", () => {
    const result = evaluateExecutionSafety({ ...base, spotQuoteAgeMs: 9000 });
    assert.equal(result.allowed, false);
    assert.equal(result.reasonCode, "BLOCK_STALE_DATA");
  });

  it("allows execution when all conditions are satisfied", () => {
    const result = evaluateExecutionSafety(base);
    assert.equal(result.allowed, true);
    assert.equal(result.reasonCode, "ALLOW_EXECUTION");
  });
});
