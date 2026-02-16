import { describe, expect, it } from "vitest";
import { Interface, ZeroAddress } from "ethers";
import {
  createSharedUri,
  parseNonNegativeWei,
  parseFundingProvider,
  parseMinStarknetDeployerBalanceWei,
  parsePositiveIntEnv,
  resolveEvmAgentId,
} from "./run.js";

describe("crosschain-demo helpers", () => {
  it("builds a shared URI with both CAIP registrations", () => {
    const uri = createSharedUri({
      name: "Agent",
      description: "demo",
      evmAgentId: "22",
      evmRegistry: "0xabc",
      evmChainId: 84532,
      starknetAgentId: "5",
      starknetRegistry: "0xdef",
      starknetNetwork: "sepolia",
    });

    expect(uri.startsWith("data:application/json;utf8,")).toBe(true);

    const encoded = uri.replace("data:application/json;utf8,", "");
    const parsed = JSON.parse(decodeURIComponent(encoded));

    expect(parsed.registrations).toEqual([
      { agentId: "22", agentRegistry: "eip155:84532:0xabc" },
      { agentId: "5", agentRegistry: "starknet:SN_SEPOLIA:0xdef" },
    ]);
  });

  it("falls back to predicted agent id when mint event is missing", () => {
    const iface = new Interface([
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]);

    const result = resolveEvmAgentId({
      predictedAgentId: 99n,
      receipt: { logs: [] },
      iface,
    });

    expect(result).toBe(99n);
  });

  it("prefers minted token id when Transfer(from=0x0) exists", () => {
    const iface = new Interface([
      "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    ]);
    const transferEvent = iface.getEvent("Transfer");
    if (!transferEvent) {
      throw new Error("Transfer event not found in ABI");
    }
    const event = iface.encodeEventLog(transferEvent, [ZeroAddress, "0x000000000000000000000000000000000000dEaD", 42n]);

    const result = resolveEvmAgentId({
      predictedAgentId: 99n,
      receipt: {
        logs: [{ topics: event.topics, data: event.data }],
      },
      iface,
    });

    expect(result).toBe(42n);
  });

  it("parses funding provider with safe defaults", () => {
    expect(parseFundingProvider(undefined)).toBe("auto");
    expect(parseFundingProvider("mock")).toBe("mock");
    expect(parseFundingProvider("skipped")).toBe("skipped");
    expect(parseFundingProvider("starkgate-l1")).toBe("starkgate-l1");
    expect(() => parseFundingProvider("starkgate")).toThrow("Invalid FUNDING_PROVIDER");
  });

  it("parses deployer min balance and rejects invalid values", () => {
    expect(parseMinStarknetDeployerBalanceWei(undefined)).toBe(5000000000000000n);
    expect(parseMinStarknetDeployerBalanceWei("0")).toBe(0n);
    expect(parseMinStarknetDeployerBalanceWei("42")).toBe(42n);
    expect(() => parseMinStarknetDeployerBalanceWei("-1")).toThrow("must be non-negative");
    expect(() => parseMinStarknetDeployerBalanceWei("not-a-number")).toThrow(
      "Invalid MIN_STARKNET_DEPLOYER_BALANCE_WEI",
    );
  });

  it("parses positive integer env values", () => {
    expect(parsePositiveIntEnv(undefined, "X_TIMEOUT", 10)).toBe(10);
    expect(parsePositiveIntEnv("5000", "X_TIMEOUT", 10)).toBe(5000);
    expect(() => parsePositiveIntEnv("0", "X_TIMEOUT", 10)).toThrow("Invalid X_TIMEOUT");
    expect(() => parsePositiveIntEnv("-1", "X_TIMEOUT", 10)).toThrow("Invalid X_TIMEOUT");
    expect(() => parsePositiveIntEnv("abc", "X_TIMEOUT", 10)).toThrow("Invalid X_TIMEOUT");
  });

  it("parses generic non-negative wei env values", () => {
    expect(parseNonNegativeWei("0", "L1_GAS_BUFFER_WEI")).toBe(0n);
    expect(parseNonNegativeWei("123", "L1_GAS_BUFFER_WEI")).toBe(123n);
    expect(() => parseNonNegativeWei("-1", "L1_GAS_BUFFER_WEI")).toThrow("must be non-negative");
    expect(() => parseNonNegativeWei("abc", "L1_GAS_BUFFER_WEI")).toThrow("Invalid L1_GAS_BUFFER_WEI");
  });
});
