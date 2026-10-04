import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData } from "starknet";
import {
  parseFelt,
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_get_session_data",
  description:
    "Read session key data from a SessionAccount. Returns valid_until, max_calls, calls_used, and allowed_entrypoints_len.",
  inputSchema: {
    type: "object",
    properties: {
      accountAddress: {
        type: "string",
        description: "SessionAccount contract address (0x-prefixed)",
      },
      sessionPublicKey: {
        type: "string",
        description: "Public key of the session key to query (felt, 0x-prefixed)",
      },
    },
    required: ["accountAddress", "sessionPublicKey"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { provider } = ctx;

  const {
    accountAddress: rawAccountAddr,
    sessionPublicKey: rawSessionKey,
  } = args as {
    accountAddress: string;
    sessionPublicKey: string;
  };

  const sessionAccountAddr = parseAddress("accountAddress", rawAccountAddr);
  const sessionKey = parseFelt("sessionPublicKey", rawSessionKey);

  const sessionData = await provider.callContract({
    contractAddress: sessionAccountAddr,
    entrypoint: "get_session_data",
    calldata: CallData.compile({
      session_key: `0x${sessionKey.toString(16)}`,
    }),
  });

  // SessionData struct: valid_until (u64), max_calls (u32), calls_used (u32), allowed_entrypoints_len (u32)
  // SessionData struct: valid_until (u64), max_calls (u32), calls_used (u32), allowed_entrypoints_len (u32)
  const validUntil = Number(sessionData[0]);
  const maxCalls = Number(sessionData[1]);
  const callsUsed = Number(sessionData[2]);
  const allowedEntrypointsLen = Number(sessionData[3]);

  const isActive = validUntil > 0 && validUntil > Math.floor(Date.now() / 1000) && callsUsed < maxCalls;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            accountAddress: sessionAccountAddr,
            sessionPublicKey: `0x${sessionKey.toString(16)}`,
            validUntil,
            validUntilISO: validUntil > 0 ? new Date(validUntil * 1000).toISOString() : null,
            maxCalls,
            callsUsed,
            callsRemaining: Math.max(0, maxCalls - callsUsed),
            allowedEntrypointsLen,
            isActive,
          },
          null,
          2
        ),
      },
    ],
  };
}
