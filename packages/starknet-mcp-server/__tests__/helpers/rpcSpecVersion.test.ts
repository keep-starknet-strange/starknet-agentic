import { describe, expect, it } from "vitest";
import { resolveRpcSpecVersion } from "../../../../scripts/rpc-spec-version.mjs";

describe("resolveRpcSpecVersion", () => {
  it("defaults to 0.9.0 for undefined/blank values", () => {
    expect(resolveRpcSpecVersion(undefined)).toBe("0.9.0");
    expect(resolveRpcSpecVersion("")).toBe("0.9.0");
    expect(resolveRpcSpecVersion("   ")).toBe("0.9.0");
  });

  it("normalizes supported 0.9.x and 0.10.x ranges", () => {
    expect(resolveRpcSpecVersion("0.9")).toBe("0.9.0");
    expect(resolveRpcSpecVersion("0.9.8")).toBe("0.9.0");
    expect(resolveRpcSpecVersion("0.10")).toBe("0.10.0");
    expect(resolveRpcSpecVersion("0.10.3")).toBe("0.10.0");
  });

  it("rejects malformed or unsupported versions", () => {
    expect(() => resolveRpcSpecVersion("0.10foo")).toThrow(
      /Unsupported STARKNET_RPC_SPEC_VERSION/
    );
    expect(() => resolveRpcSpecVersion("0.9beta")).toThrow(
      /Unsupported STARKNET_RPC_SPEC_VERSION/
    );
    expect(() => resolveRpcSpecVersion("1.0.0")).toThrow(
      /Unsupported STARKNET_RPC_SPEC_VERSION/
    );
  });
});
