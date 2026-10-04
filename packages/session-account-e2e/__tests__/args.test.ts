import { describe, expect, it } from "vitest";
import { UsageError, parseArgs, parseCallSpec } from "../src/args.ts";

const TOKEN = "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8";
const BASE = ["--account", "0x123", "--session-key", "0x456"];

describe("parseCallSpec", () => {
  it("parses target, entrypoint name and felts", () => {
    expect(parseCallSpec(`${TOKEN}:transfer:0xDEADBEEF,500000000,0`)).toEqual({
      contractAddress: "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
      entrypoint: "transfer",
      calldata: ["0xdeadbeef", "0x1dcd6500", "0x0"],
    });
  });

  it("allows empty calldata", () => {
    expect(parseCallSpec("0x1:get_agent_id")).toEqual({ contractAddress: "0x1", entrypoint: "get_agent_id", calldata: [] });
  });

  it("rejects selectors, typed prefixes such as u256: and malformed felts", () => {
    expect(() => parseCallSpec("0x1:0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e:0x1")).toThrow(
      /function name/,
    );
    expect(() => parseCallSpec("0x1:transfer:u256:5")).toThrow(UsageError);
    expect(() => parseCallSpec("0x1:transfer:0xZZ")).toThrow(/not a felt/);
    expect(() => parseCallSpec("transfer")).toThrow(/Invalid --call/);
  });
});

describe("parseArgs", () => {
  it("defaults to --expect success and supports multicalls", () => {
    const options = parseArgs([...BASE, "--call", "0x1:transfer:1,0,0", "--call", "0x1:transfer:2,0,0"]);
    expect(options.expect).toBe("success");
    expect(options.calls).toHaveLength(2);
  });

  it("requires a reason for reverts and a control call for rejections", () => {
    expect(() => parseArgs([...BASE, "--call", "0x1:transfer", "--expect", "revert"])).toThrow(/--reason/);
    expect(() => parseArgs([...BASE, "--call", "0x1:transfer", "--expect", "reject"])).toThrow(/--control-call/);
    expect(
      parseArgs([...BASE, "--call", "0x1:transfer", "--expect", "revert", "--reason", "Spending: exceeds per-call"])
        .reason,
    ).toBe("Spending: exceeds per-call");
    expect(
      parseArgs([...BASE, "--call", "0x2:set_spending_policy", "--expect", "reject", "--control-call", "0x1:transfer:0,0,0"])
        .controlCalls,
    ).toHaveLength(1);
  });

  it("rejects options that would be silently ignored", () => {
    expect(() => parseArgs([...BASE, "--call", "0x1:transfer", "--reason", "x"])).toThrow(/only applies/);
    expect(() => parseArgs([...BASE, "--call", "0x1:transfer", "--control-call", "0x1:transfer"])).toThrow(
      /only applies/,
    );
    expect(() => parseArgs([...BASE, "--call", "0x1:transfer", "--expect", "maybe"])).toThrow(/--expect/);
    expect(() => parseArgs([...BASE, "--call", "0x1:transfer", "--private-key", "0x1"])).toThrow(/Unknown option/);
  });

  it("requires account, session key and at least one call", () => {
    expect(() => parseArgs(["--session-key", "0x1", "--call", "0x1:transfer"])).toThrow(/--account/);
    expect(() => parseArgs(["--account", "0x1", "--call", "0x1:transfer"])).toThrow(/--session-key/);
    expect(() => parseArgs(BASE)).toThrow(/--call/);
    expect(() => parseArgs([...BASE, "--call"])).toThrow(/Missing value/);
  });
});
