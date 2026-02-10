import { describe, it, expect } from "vitest";
import { hash } from "starknet";
import { parseU256FromFelts, parseValidationRequestHashFromReceipt } from "../lib.js";

describe("erc8004-validation-demo lib", () => {
  it("parseU256FromFelts composes low/high", () => {
    expect(parseU256FromFelts("1", "0")).toBe(1n);
    expect(parseU256FromFelts("0", "1")).toBe(1n << 128n);
  });

  it("parseValidationRequestHashFromReceipt finds matching event", () => {
    const selector = hash.getSelectorFromName("ValidationRequest");

    const receipt = {
      events: [
        {
          keys: [
            "selector:Other",
          ],
          data: [],
        },
        {
          keys: [
            selector,
            "0xabc", // validator
            "0x09", "0x0", // agent_id
            "0x2a", "0x0", // request_hash
          ],
          data: [],
        },
      ],
    };

    const requestHash = parseValidationRequestHashFromReceipt({
      receipt: receipt as any,
      expectedValidator: "0xabc",
      expectedAgentId: 9n,
    });

    expect(requestHash).toBe(42n);
  });
});
