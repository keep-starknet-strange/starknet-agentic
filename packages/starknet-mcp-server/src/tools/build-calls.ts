import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  parseAddress,
  parseCalldata,
  validateEntrypoint,
  MAX_CALLDATA_LEN,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_build_calls",
  description:
    "Build unsigned Starknet calls without executing. Returns a JSON array of Call objects compatible with starknet.js account.execute() and Cartridge Controller. Use this when you need to compose calls for external signing (e.g., session keys, hardware wallets, multisig).",
  inputSchema: {
    type: "object",
    properties: {
      calls: {
        type: "array",
        description: "Array of call objects to build",
        items: {
          type: "object",
          properties: {
            contractAddress: {
              type: "string",
              description: "Target contract address (0x-prefixed)",
            },
            entrypoint: {
              type: "string",
              description: "Function name to call",
            },
            calldata: {
              type: "array",
              items: { type: "string" },
              description: "Function arguments as array of felt strings",
              default: [],
            },
          },
          required: ["contractAddress", "entrypoint"],
        },
      },
    },
    required: ["calls"],
  },
};

export async function handler(args: ToolArgs, _ctx: ToolContext): Promise<ToolResult> {
  const { calls: rawCalls } = args as {
    calls: Array<{
      contractAddress: string;
      entrypoint: string;
      calldata?: string[];
    }>;
  };

  if (!rawCalls || rawCalls.length === 0) {
    throw new Error("calls array is required and must not be empty");
  }

  if (rawCalls.length > MAX_CALLDATA_LEN) {
    throw new Error(`Too many calls (${rawCalls.length}). Maximum: ${MAX_CALLDATA_LEN}`);
  }

  const validatedCalls = rawCalls.map((call, i) => {
    if (!call.contractAddress) {
      throw new Error(`calls[${i}].contractAddress is required`);
    }
    if (!call.entrypoint) {
      throw new Error(`calls[${i}].entrypoint is required`);
    }
    if (call.calldata && call.calldata.length > MAX_CALLDATA_LEN) {
      throw new Error(`calls[${i}].calldata too large (${call.calldata.length} items, max ${MAX_CALLDATA_LEN})`);
    }
    const validatedAddress = parseAddress(`calls[${i}].contractAddress`, call.contractAddress);
    const validatedEntrypoint = validateEntrypoint(`calls[${i}].entrypoint`, call.entrypoint);
    const validatedCalldata = call.calldata && call.calldata.length > 0
      ? parseCalldata(`calls[${i}].calldata`, call.calldata)
      : [];

    return {
      contractAddress: validatedAddress,
      entrypoint: validatedEntrypoint,
      calldata: validatedCalldata,
    };
  });

  // Detect exact-duplicate calls — likely an LLM hallucination or copy-paste error.
  const callKeys = validatedCalls.map(
    (c) => `${c.contractAddress}:${c.entrypoint}:${c.calldata.join(",")}`
  );
  const seen = new Set<string>();
  const duplicateIndices: number[] = [];
  for (let idx = 0; idx < callKeys.length; idx++) {
    if (seen.has(callKeys[idx])) duplicateIndices.push(idx);
    seen.add(callKeys[idx]);
  }

  const warning =
    duplicateIndices.length > 0
      ? `WARNING: Identical calls detected at indices [${duplicateIndices.join(", ")}]. ` +
        "This may indicate a duplicate request. Review carefully before signing."
      : undefined;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            calls: validatedCalls,
            callCount: validatedCalls.length,
            ...(warning ? { warning } : {}),
            note: "Unsigned calls. Pass to account.execute(calls) or write to calls.json for external signing.",
          },
          null,
          2
        ),
      },
    ],
  };
}
