import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, cairo, byteArray } from "starknet";
import {
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_get_agent_metadata",
  description:
    "Read on-chain metadata for an ERC-8004 agent. Returns the value stored for the given key, or empty string if not set.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Agent ID (u256 decimal or hex string)",
      },
      key: {
        type: "string",
        description: "Metadata key to read (e.g. 'agentName', 'capabilities')",
      },
    },
    required: ["agent_id", "key"],
  },
};

/** Listed only when ERC8004_IDENTITY_REGISTRY_ADDRESS is configured. */
export const isListed = (ctx: ToolContext): boolean => Boolean(ctx.env.ERC8004_IDENTITY_REGISTRY_ADDRESS);

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, provider } = ctx;

  if (!env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
    throw new Error("ERC8004_IDENTITY_REGISTRY_ADDRESS not configured");
  }

  const { agent_id, key } = args as {
    agent_id: string;
    key: string;
  };

  if (!agent_id) throw new Error("agent_id is required");
  if (!key || key.length === 0) throw new Error("key is required and must be non-empty");

  const identity = parseAddress(
    "ERC8004_IDENTITY_REGISTRY_ADDRESS",
    env.ERC8004_IDENTITY_REGISTRY_ADDRESS
  );

  const agentIdBigInt = BigInt(agent_id);
  const calldata = CallData.compile({
    agent_id: cairo.uint256(agentIdBigInt),
    key: byteArray.byteArrayFromString(key),
  });

  const result = await provider.callContract({
    contractAddress: identity,
    entrypoint: "get_metadata",
    calldata,
  });

  // The result is a serialized ByteArray. Parse it back to a string.
  const resultArray = Array.isArray(result)
    ? result
    : (result as Record<string, unknown>).result
      ? ((result as Record<string, unknown>).result as string[])
      : [];
  const value = byteArray.stringFromByteArray({
    data: resultArray.slice(1, 1 + Number(resultArray[0])).map((v) => BigInt(v)),
    pending_word: BigInt(resultArray[1 + Number(resultArray[0])] ?? "0"),
    pending_word_len: Number(resultArray[2 + Number(resultArray[0])] ?? "0"),
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            agentId: agent_id,
            key,
            value,
            identityRegistry: identity,
          },
          null,
          2
        ),
      },
    ],
  };
}
