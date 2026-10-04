import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Call } from "starknet";
import { resolveTokenAddressAsync } from "../utils.js";
import { TOKENS } from "../services/index.js";
import {
  parseAddress,
  parseCalldata,
  validateEntrypoint,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_invoke_contract",
  description: "Invoke a state-changing contract function on Starknet. Supports gasfree mode where gas is paid in an ERC-20 token instead of ETH/STRK.",
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
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
        default: false,
      },
      gasToken: {
        type: "string",
        description: "Token to pay gas fees in (symbol or address). Only used when gasfree=true and no API key is set.",
      },
    },
    required: ["contractAddress", "entrypoint"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { executeTransaction, waitForTransactionSuccess } = ctx;

  const { contractAddress, entrypoint, calldata = [], gasfree = false, gasToken } = args as {
    contractAddress: string;
    entrypoint: string;
    calldata?: string[];
    gasfree?: boolean;
    gasToken?: string;
  };

  const validatedContractAddress = parseAddress("contractAddress", contractAddress);
  const validatedEntrypoint = validateEntrypoint("entrypoint", entrypoint);
  const validatedCalldata = parseCalldata("calldata", calldata);
  const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
  const invokeCall: Call = {
    contractAddress: validatedContractAddress,
    entrypoint: validatedEntrypoint,
    calldata: validatedCalldata,
  };

  const transactionHash = await executeTransaction(invokeCall, gasfree, gasTokenAddress);
  await waitForTransactionSuccess(transactionHash, "starknet_invoke_contract");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          transactionHash,
          contractAddress,
          entrypoint,
          gasfree,
        }, null, 2),
      },
    ],
  };
}
