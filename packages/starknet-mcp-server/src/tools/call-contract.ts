import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  parseAddress,
  parseCalldata,
  validateEntrypoint,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_call_contract",
  description: "Call a read-only contract function on Starknet",
  inputSchema: {
    type: "object",
    properties: {
      contractAddress: {
        type: "string",
        description: "Contract address",
      },
      entrypoint: {
        type: "string",
        description: "Function name to call",
      },
      calldata: {
        type: "array",
        items: { type: "string" },
        description: "Function arguments as array of strings",
        default: [],
      },
    },
    required: ["contractAddress", "entrypoint"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { provider } = ctx;

  const { contractAddress, entrypoint, calldata = [] } = args as {
    contractAddress: string;
    entrypoint: string;
    calldata?: string[];
  };

  const validatedContractAddress = parseAddress("contractAddress", contractAddress);
  const validatedEntrypoint = validateEntrypoint("entrypoint", entrypoint);
  const validatedCalldata = parseCalldata("calldata", calldata);
  const result = await provider.callContract({
    contractAddress: validatedContractAddress,
    entrypoint: validatedEntrypoint,
    calldata: validatedCalldata,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          result: Array.isArray(result) ? result : (result as Record<string, unknown>).result ?? result,
          contractAddress,
          entrypoint,
        }, null, 2),
      },
    ],
  };
}
