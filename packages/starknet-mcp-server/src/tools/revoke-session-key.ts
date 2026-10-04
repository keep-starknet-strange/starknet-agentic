import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, ETransactionVersion, type Call } from "starknet";
import {
  parseFelt,
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_revoke_session_key",
  description:
    "Revoke a session key from a SessionAccount. Owner-only. Zeroes the session data and clears allowed entrypoints.",
  inputSchema: {
    type: "object",
    properties: {
      accountAddress: {
        type: "string",
        description: "SessionAccount contract address (0x-prefixed)",
      },
      sessionPublicKey: {
        type: "string",
        description: "Public key of the session key to revoke (felt, 0x-prefixed)",
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas)",
        default: false,
      },
    },
    required: ["accountAddress", "sessionPublicKey"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, account, isSponsored, waitForTransactionSuccess } = ctx;

  const {
    accountAddress: rawAccountAddr,
    sessionPublicKey: rawSessionKey,
    gasfree = false,
  } = args as {
    accountAddress: string;
    sessionPublicKey: string;
    gasfree?: boolean;
  };

  const sessionAccountAddr = parseAddress("accountAddress", rawAccountAddr);
  const sessionKey = parseFelt("sessionPublicKey", rawSessionKey);

  const configuredAccountRevoke = parseAddress("STARKNET_ACCOUNT_ADDRESS", env.STARKNET_ACCOUNT_ADDRESS);
  if (sessionAccountAddr.toLowerCase() !== configuredAccountRevoke.toLowerCase()) {
    throw new Error(
      `accountAddress (${sessionAccountAddr}) does not match the configured MCP server account (${configuredAccountRevoke}). ` +
      `Session key operations can only target the server's own account.`
    );
  }

  const revokeCall: Call = {
    contractAddress: sessionAccountAddr,
    entrypoint: "revoke_session_key",
    calldata: CallData.compile({
      session_key: `0x${sessionKey.toString(16)}`,
    }),
  };

  const executeFn = gasfree && isSponsored
    ? () => account.execute([revokeCall], { version: ETransactionVersion.V3 })
    : () => account.execute([revokeCall]);

  const result = await executeFn();
  await waitForTransactionSuccess(result.transaction_hash, "starknet_revoke_session_key");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            transactionHash: result.transaction_hash,
            accountAddress: sessionAccountAddr,
            sessionPublicKey: `0x${sessionKey.toString(16)}`,
            note: "Session key revoked. It can no longer sign transactions.",
          },
          null,
          2
        ),
      },
    ],
  };
}
