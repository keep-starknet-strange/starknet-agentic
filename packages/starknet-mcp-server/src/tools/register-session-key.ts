import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, ETransactionVersion, hash, type Call } from "starknet";
import {
  parseFelt,
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_register_session_key",
  description:
    "Register a session key on a SessionAccount (chipi-pay fork). Owner-only operation. The session key gets time-limited, call-count-limited access with optional selector whitelist.",
  inputSchema: {
    type: "object",
    properties: {
      accountAddress: {
        type: "string",
        description: "SessionAccount contract address (0x-prefixed)",
      },
      sessionPublicKey: {
        type: "string",
        description: "Public key of the session key to register (felt, 0x-prefixed)",
      },
      validUntil: {
        type: "number",
        description: "Unix timestamp (seconds) when session expires",
      },
      maxCalls: {
        type: "number",
        description: "Maximum number of transactions allowed for this session",
      },
      allowedEntrypoints: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional array of allowed function selectors (felt strings). Empty = any non-admin selector on external contracts.",
        default: [],
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas)",
        default: false,
      },
    },
    required: ["accountAddress", "sessionPublicKey", "validUntil", "maxCalls"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, account, isSponsored, waitForTransactionSuccess } = ctx;

  const {
    accountAddress: rawAccountAddr,
    sessionPublicKey: rawSessionKey,
    validUntil,
    maxCalls,
    allowedEntrypoints: rawEntrypoints = [],
    gasfree = false,
  } = args as {
    accountAddress: string;
    sessionPublicKey: string;
    validUntil: number;
    maxCalls: number;
    allowedEntrypoints?: string[];
    gasfree?: boolean;
  };

  const sessionAccountAddr = parseAddress("accountAddress", rawAccountAddr);
  const sessionKey = parseFelt("sessionPublicKey", rawSessionKey);

  const configuredAccount = parseAddress("STARKNET_ACCOUNT_ADDRESS", env.STARKNET_ACCOUNT_ADDRESS);
  if (sessionAccountAddr.toLowerCase() !== configuredAccount.toLowerCase()) {
    throw new Error(
      `accountAddress (${sessionAccountAddr}) does not match the configured MCP server account (${configuredAccount}). ` +
      `Session key operations can only target the server's own account.`
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (validUntil <= nowSec) {
    throw new Error("validUntil must be in the future");
  }
  const MAX_SESSION_DURATION_SECS = 30 * 24 * 60 * 60; // 30 days
  if (validUntil > nowSec + MAX_SESSION_DURATION_SECS) {
    throw new Error(
      `validUntil is too far in the future (max 30 days from now). ` +
      `Max allowed: ${nowSec + MAX_SESSION_DURATION_SECS}, got: ${validUntil}`
    );
  }
  if (maxCalls <= 0 || maxCalls > 1_000_000) {
    throw new Error("maxCalls must be between 1 and 1,000,000");
  }

  // Validate session public key is non-zero and in valid range
  if (sessionKey === 0n) {
    throw new Error(
      "sessionPublicKey must be non-zero. A zero key creates an unusable session."
    );
  }
  // Stark curve order: keys must be < CURVE_ORDER
  const STARK_CURVE_ORDER = BigInt("0x800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f");
  if (sessionKey >= STARK_CURVE_ORDER) {
    throw new Error(
      "sessionPublicKey exceeds Stark curve order. This is not a valid public key."
    );
  }

  // Validate entrypoints (optional: function selectors as felt strings)
  const entrypoints = rawEntrypoints.map((ep, i) => {
    // Allow selector names like "transfer" or hex felts
    if (ep.startsWith("0x")) {
      return parseFelt(`allowedEntrypoints[${i}]`, ep).toString();
    }
    // Convert function name to selector
    return hash.getSelectorFromName(ep);
  });

  const registerCall: Call = {
    contractAddress: sessionAccountAddr,
    entrypoint: "add_or_update_session_key",
    calldata: CallData.compile({
      session_key: `0x${sessionKey.toString(16)}`,
      valid_until: validUntil,
      max_calls: maxCalls,
      allowed_entrypoints: entrypoints,
    }),
  };

  const executeFn = gasfree && isSponsored
    ? () => account.execute([registerCall], { version: ETransactionVersion.V3 })
    : () => account.execute([registerCall]);

  const result = await executeFn();
  await waitForTransactionSuccess(result.transaction_hash, "starknet_register_session_key");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            transactionHash: result.transaction_hash,
            accountAddress: sessionAccountAddr,
            sessionPublicKey: `0x${sessionKey.toString(16)}`,
            validUntil,
            maxCalls,
            allowedEntrypoints: entrypoints,
            note: "Session key registered. The session key holder can now sign transactions within these constraints.",
          },
          null,
          2
        ),
      },
    ],
  };
}
