import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { randomBytes } from "node:crypto";
import { CallData, byteArray, hash, type Call } from "starknet";
import {
  parseFelt,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_deploy_agent_account",
  description:
    "Deploy a new agent account via AgentAccountFactory. Requires caller-supplied public_key (no server-side key generation).",
  inputSchema: {
    type: "object",
    properties: {
      public_key: {
        type: "string",
        description: "Stark public key (felt, 0x-prefixed recommended)",
      },
      token_uri: {
        type: "string",
        description: "Token URI to register identity metadata",
      },
      salt: {
        type: "string",
        description: "Optional deploy salt felt. Random if omitted.",
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
        default: false,
      },
    },
    required: ["public_key", "token_uri"],
  },
};

/** Listed only when AGENT_ACCOUNT_FACTORY_ADDRESS is configured. */
export const isListed = (ctx: ToolContext): boolean => Boolean(ctx.env.AGENT_ACCOUNT_FACTORY_ADDRESS);

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, executeTransaction, waitForTransactionSuccess } = ctx;

  if (!env.AGENT_ACCOUNT_FACTORY_ADDRESS) {
    throw new Error("AGENT_ACCOUNT_FACTORY_ADDRESS not configured");
  }

  const { public_key, token_uri, salt, gasfree = false } = args as {
    public_key: string;
    token_uri: string;
    salt?: string;
    gasfree?: boolean;
  };

  if (!public_key || typeof public_key !== "string") {
    throw new Error("public_key is required");
  }
  if (!token_uri || typeof token_uri !== "string") {
    throw new Error("token_uri is required");
  }

  const parsedPublicKey = parseFelt("public_key", public_key);
  if (parsedPublicKey === 0n) {
    throw new Error("public_key must be non-zero felt");
  }
  const parsedSalt = parseFelt("salt", salt || randomSaltFelt());

  const deployCall: Call = {
    contractAddress: env.AGENT_ACCOUNT_FACTORY_ADDRESS,
    entrypoint: "deploy_account",
    calldata: CallData.compile({
      public_key: `0x${parsedPublicKey.toString(16)}`,
      salt: `0x${parsedSalt.toString(16)}`,
      token_uri: byteArray.byteArrayFromString(token_uri),
    }),
  };

  const transactionHash = await executeTransaction(deployCall, gasfree);
  const receipt = await waitForTransactionSuccess(transactionHash, "starknet_deploy_agent_account");
  const { accountAddress, agentId } = parseDeployResultFromReceipt(
    receipt,
    env.AGENT_ACCOUNT_FACTORY_ADDRESS
  );

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          transactionHash,
          factoryAddress: env.AGENT_ACCOUNT_FACTORY_ADDRESS,
          publicKey: `0x${parsedPublicKey.toString(16)}`,
          salt: `0x${parsedSalt.toString(16)}`,
          accountAddress,
          agentId,
        }, null, 2),
      },
    ],
  };
}

function randomSaltFelt(): string {
  const random = BigInt(`0x${randomBytes(32).toString("hex")}`);
  // Starknet felts are field elements; keep value in 251-bit range.
  return `0x${BigInt.asUintN(251, random).toString(16)}`;
}

function parseDeployResultFromReceipt(
  receipt: unknown,
  factoryAddress: string
): { accountAddress: string | null; agentId: string | null } {
  const events =
    (receipt as { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> })
      ?.events;
  if (!events) {
    return { accountAddress: null, agentId: null };
  }

  const factory = factoryAddress.toLowerCase();
  const accountDeployedSelector = hash.getSelectorFromName("AccountDeployed").toLowerCase();
  for (const event of events) {
    const from = event.from_address?.toLowerCase();
    const keys = event.keys;
    const data = event.data;
    if (
      from !== factory ||
      !keys ||
      keys.length < 1 ||
      keys[0]?.toLowerCase() !== accountDeployedSelector ||
      !data ||
      data.length < 4
    ) {
      continue;
    }

    try {
      const accountAddress = data[0];
      const agentIdLow = BigInt(data[2]);
      const agentIdHigh = BigInt(data[3]);
      const agentId = (agentIdLow + (agentIdHigh << 128n)).toString();
      return { accountAddress, agentId };
    } catch {
      continue;
    }
  }

  return { accountAddress: null, agentId: null };
}
