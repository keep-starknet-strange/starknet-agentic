import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, cairo, byteArray, type Call } from "starknet";
import {
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_set_agent_metadata",
  description:
    "Set on-chain metadata for an ERC-8004 agent. Caller must be owner or approved for the agent_id. Standard keys: agentName, agentType, version, model, status, framework, capabilities, a2aEndpoint, moltbookId.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Agent ID (u256 decimal or hex string)",
      },
      key: {
        type: "string",
        description:
          "Metadata key (e.g. 'agentName', 'capabilities'). 'agentWallet' is reserved and cannot be set here.",
      },
      value: {
        type: "string",
        description: "Metadata value to store on-chain",
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
        default: false,
      },
    },
    required: ["agent_id", "key", "value"],
  },
};

/** Listed only when ERC8004_IDENTITY_REGISTRY_ADDRESS is configured. */
export const isListed = (ctx: ToolContext): boolean => Boolean(ctx.env.ERC8004_IDENTITY_REGISTRY_ADDRESS);

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, executeTransaction, waitForTransactionSuccess } = ctx;

  if (!env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
    throw new Error("ERC8004_IDENTITY_REGISTRY_ADDRESS not configured");
  }

  const { agent_id, key, value, gasfree = false } = args as {
    agent_id: string;
    key: string;
    value: string;
    gasfree?: boolean;
  };

  if (!agent_id) throw new Error("agent_id is required");
  if (!key || key.length === 0) throw new Error("key is required and must be non-empty");
  if (key === "agentWallet") throw new Error("'agentWallet' is a reserved key and cannot be set via set_metadata");
  if (value === undefined || value === null) throw new Error("value is required");

  const identity = parseAddress(
    "ERC8004_IDENTITY_REGISTRY_ADDRESS",
    env.ERC8004_IDENTITY_REGISTRY_ADDRESS
  );

  // agent_id is u256: compile as cairo.uint256
  const agentIdBigInt = BigInt(agent_id);
  const calldata = CallData.compile({
    agent_id: cairo.uint256(agentIdBigInt),
    key: byteArray.byteArrayFromString(key),
    value: byteArray.byteArrayFromString(value),
  });

  const call: Call = {
    contractAddress: identity,
    entrypoint: "set_metadata",
    calldata,
  };

  const transactionHash = await executeTransaction(call, gasfree);
  await waitForTransactionSuccess(transactionHash, "starknet_set_agent_metadata");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            transactionHash,
            identityRegistry: identity,
            agentId: agent_id,
            key,
            value,
          },
          null,
          2
        ),
      },
    ],
  };
}
