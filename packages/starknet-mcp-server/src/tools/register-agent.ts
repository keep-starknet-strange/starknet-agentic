import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, byteArray, hash, type Call } from "starknet";
import {
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_register_agent",
  description:
    "Register a new ERC-8004 agent identity in IdentityRegistry. Optionally provide token_uri. Returns tx hash and parsed agent_id (best-effort).",
  inputSchema: {
    type: "object",
    properties: {
      token_uri: {
        type: "string",
        description: "Optional token URI (e.g., ipfs://... or data:application/json;utf8,...)",
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
        default: false,
      },
    },
    required: [],
  },
};

/** Listed only when ERC8004_IDENTITY_REGISTRY_ADDRESS is configured. */
export const isListed = (ctx: ToolContext): boolean => Boolean(ctx.env.ERC8004_IDENTITY_REGISTRY_ADDRESS);

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, executeTransaction, waitForTransactionSuccess } = ctx;

  if (!env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
    throw new Error("ERC8004_IDENTITY_REGISTRY_ADDRESS not configured");
  }

  const { token_uri, gasfree = false } = args as {
    token_uri?: string;
    gasfree?: boolean;
  };

  const identity = parseAddress(
    "ERC8004_IDENTITY_REGISTRY_ADDRESS",
    env.ERC8004_IDENTITY_REGISTRY_ADDRESS
  );

  const entrypoint =
    token_uri && token_uri.length > 0 ? "register_with_token_uri" : "register";
  const calldata =
    token_uri && token_uri.length > 0
      ? CallData.compile({ token_uri: byteArray.byteArrayFromString(token_uri) })
      : [];

  const call: Call = {
    contractAddress: identity,
    entrypoint,
    calldata,
  };

  const transactionHash = await executeTransaction(call, gasfree);
  const receipt = await waitForTransactionSuccess(transactionHash, "starknet_register_agent");
  const { agentId } = parseIdentityRegisteredFromReceipt(receipt, identity);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            transactionHash,
            identityRegistry: identity,
            agentId,
          },
          null,
          2
        ),
      },
    ],
  };
}

function parseIdentityRegisteredFromReceipt(
  receipt: unknown,
  identityRegistryAddress: string
): { agentId: string | null } {
  const events =
    (receipt as { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> })
      ?.events;
  if (!events) {
    return { agentId: null };
  }

  const identity = identityRegistryAddress.toLowerCase();
  const registeredSelector = hash.getSelectorFromName("Registered").toLowerCase();
  for (const event of events) {
    const from = event.from_address?.toLowerCase();
    const keys = event.keys;
    if (
      from !== identity ||
      !keys ||
      keys.length < 3 ||
      keys[0]?.toLowerCase() !== registeredSelector
    ) {
      continue;
    }

    try {
      // `Registered` has `agent_id` as a #[key] u256 -> two felts in keys[1..2]
      const agentIdLow = BigInt(keys[1]);
      const agentIdHigh = BigInt(keys[2]);
      const agentId = (agentIdLow + (agentIdHigh << 128n)).toString();
      return { agentId };
    } catch {
      continue;
    }
  }

  return { agentId: null };
}
