import type { CarryDecisionAction, CarryRunMode } from "./types.js";

export type ExecutionSafetyInput = {
  runMode: CarryRunMode;
  decisionAction: CarryDecisionAction;
  notionalUsd: number;
  maxNotionalUsd: number;
  spotQuoteAgeMs: number;
  perpSnapshotAgeMs: number;
  feesAgeMs: number;
  maxDataAgeMs: number;
};

export type ExecutionSafetyResult = {
  allowed: boolean;
  reasonCode: string;
  message: string;
};

export function evaluateExecutionSafety(input: ExecutionSafetyInput): ExecutionSafetyResult {
  if (input.runMode !== "execute") {
    return {
      allowed: false,
      reasonCode: "BLOCK_DRY_RUN_MODE",
      message: "Execution is disabled in dry-run mode.",
    };
  }

  if (input.decisionAction !== "ENTER") {
    return {
      allowed: false,
      reasonCode: "BLOCK_NO_ENTER_SIGNAL",
      message: "Execution requires ENTER decision action.",
    };
  }

  if (input.notionalUsd > input.maxNotionalUsd) {
    return {
      allowed: false,
      reasonCode: "BLOCK_NOTIONAL_OVER_CAP",
      message: `Notional ${input.notionalUsd} exceeds max cap ${input.maxNotionalUsd}.`,
    };
  }

  const maxAgeSeen = Math.max(input.spotQuoteAgeMs, input.perpSnapshotAgeMs, input.feesAgeMs);
  if (maxAgeSeen > input.maxDataAgeMs) {
    return {
      allowed: false,
      reasonCode: "BLOCK_STALE_DATA",
      message: `Input data age ${maxAgeSeen}ms exceeds max allowed ${input.maxDataAgeMs}ms.`,
    };
  }

  return {
    allowed: true,
    reasonCode: "ALLOW_EXECUTION",
    message: "Execution preconditions satisfied.",
  };
}
