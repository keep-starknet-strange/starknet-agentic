import { describe, expect, it } from "vitest";
import { Interface, ZeroAddress } from "ethers";
import { createSharedUri, resolveEvmAgentId } from "./run.js";

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
});
