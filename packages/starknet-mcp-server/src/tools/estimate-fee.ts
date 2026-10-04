import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { formatAmount } from "../utils/formatter.js";
import {
  parseAddress,
  parseCalldata,
  validateEntrypoint,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_estimate_fee",
  description: "Estimate transaction fee for a contract call",
  inputSchema: {
    type: "object",
    properties: {
      contractAddress: {
        type: "string",
        description: "Contract address",
      },
      entrypoint: {
        type: "string",
        description: "Function name",
      },
      calldata: {
        type: "array",
        items: { type: "string" },
        description: "Function arguments",
        default: [],
      },
    },
    required: ["contractAddress", "entrypoint"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { account } = ctx;

  const { contractAddress, entrypoint, calldata = [] } = args as {
    contractAddress: string;
    entrypoint: string;
    calldata?: string[];
  };

  const validatedContractAddress = parseAddress("contractAddress", contractAddress);
  const validatedEntrypoint = validateEntrypoint("entrypoint", entrypoint);
  const validatedCalldata = parseCalldata("calldata", calldata);
  const fee = await account.estimateInvokeFee({
    contractAddress: validatedContractAddress,
    entrypoint: validatedEntrypoint,
    calldata: validatedCalldata,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          overallFee: formatAmount(BigInt(fee.overall_fee.toString()), 18),
          resourceBounds: fee.resourceBounds,
          unit: fee.unit || "STRK",
        }, null, 2),
      },
    ],
  };
}
