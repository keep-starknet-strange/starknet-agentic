import { describe, expect, it } from "vitest";
import { RpcError, hash, shortString } from "starknet";
import {
  CALL_FAILED_EVENT_KEY,
  errorDetail,
  failedCallIndexes,
  hasRevertReason,
  isValidationFailure,
} from "../src/outcome.ts";

const ACCOUNT = "0x0123456789abcdef";

function rpcError(code: number, message: string, data: unknown, params: unknown = {}): RpcError {
  return new RpcError({ code, message, data } as never, "starknet_estimateFee", params);
}

describe("hasRevertReason", () => {
  const perCall = "Spending: exceeds per-call";

  it("matches the decoded panic string", () => {
    const error = rpcError(41, "Transaction execution error", {
      transaction_index: 0,
      execution_error: `Execution failed. Failure reason: 0x... ('${perCall}').`,
    });
    expect(hasRevertReason(error, perCall)).toBe(true);
    expect(hasRevertReason(error, "Spending: exceeds window limit")).toBe(false);
  });

  it("matches the hex short-string felt when the node does not decode it", () => {
    const felt = shortString.encodeShortString(perCall).toUpperCase().replace("0X", "0x");
    const error = rpcError(41, "Transaction execution error", {
      transaction_index: 0,
      execution_error: { error: `Execution failed. Failure reason: ${felt}.` },
    });
    expect(hasRevertReason(error, perCall)).toBe(true);
  });

  it("ignores request params, which carry our own calldata and signature", () => {
    const felt = shortString.encodeShortString(perCall);
    const error = rpcError(41, "Transaction execution error", { execution_error: "Out of gas" }, {
      invoke_transaction: { calldata: [felt] },
    });
    expect(error.message).toContain(felt);
    expect(hasRevertReason(error, perCall)).toBe(false);
  });
});

describe("isValidationFailure", () => {
  it("accepts the RPC VALIDATION_FAILURE code", () => {
    expect(isValidationFailure(rpcError(55, "Account validation failed", "invalid signature"))).toBe(true);
  });

  it("accepts execution errors raised while running __validate__", () => {
    // Verbatim from starknet-devnet 0.8.1 (blockifier) for a session call rejected by the blocklist.
    expect(
      isValidationFailure(
        rpcError(41, "Transaction execution error", {
          transaction_index: 0,
          execution_error: "The `validate` entry point should return `VALID`. Got Retdata([0x0]).",
        }),
      ),
    ).toBe(true);
    expect(
      isValidationFailure(
        rpcError(41, "Transaction execution error", {
          execution_error: { selector: hash.getSelectorFromName("__validate__"), error: "0x0" },
        }),
      ),
    ).toBe(true);
  });

  it("does not treat an __execute__ revert or a transport error as a validation failure", () => {
    expect(isValidationFailure(new Error("fetch failed"))).toBe(false);
    expect(
      isValidationFailure(
        rpcError(41, "Transaction execution error", {
          execution_error: "Execution failed. Failure reason: 'ERC20: invalid input validation'.",
        }),
      ),
    ).toBe(false);
    expect(
      isValidationFailure(
        rpcError(41, "Transaction execution error", {
          execution_error: {
            selector: hash.getSelectorFromName("__execute__"),
            error: "Execution failed. Failure reason: 'Spending: exceeds per-call'.",
          },
        }),
      ),
    ).toBe(false);
  });
});

describe("errorDetail", () => {
  it("keeps the node payload and drops the request", () => {
    const error = rpcError(41, "Transaction execution error", { execution_error: "boom" }, { secret: "params" });
    expect(errorDetail(error)).toBe('41: Transaction execution error: {"execution_error":"boom"}');
  });

  it("falls back to plain errors and values", () => {
    expect(errorDetail(new Error("network down"))).toBe("network down");
    expect(errorDetail("oops")).toBe("oops");
  });
});

describe("failedCallIndexes", () => {
  it("returns the call_index key of CallFailed events emitted by the account", () => {
    const events = [
      { from_address: ACCOUNT, keys: [CALL_FAILED_EVENT_KEY, "0x2"], data: ["0x1", "0x2"] },
      // Same event shape from another contract is ignored.
      { from_address: "0x999", keys: [CALL_FAILED_EVENT_KEY, "0x0"], data: [] },
      // Other account events are ignored.
      { from_address: ACCOUNT, keys: [hash.getSelectorFromName("SessionKeyAdded"), "0x5"], data: [] },
      { from_address: "0x00000000000000000000000000000000000000000000000000123456789abcdef", keys: [CALL_FAILED_EVENT_KEY, "0x0"], data: [] },
    ];
    expect(failedCallIndexes(events, ACCOUNT)).toEqual([2, 0]);
  });

  it("returns nothing for a clean receipt", () => {
    expect(failedCallIndexes([], ACCOUNT)).toEqual([]);
  });
});
