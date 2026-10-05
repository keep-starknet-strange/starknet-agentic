import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, cairo, type Call } from "starknet";
import { resolveTokenAddressAsync } from "../utils.js";
import { TOKENS } from "../services/index.js";
import {
  parseAddress,
  parseAmount,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_transfer",
  description: "Transfer tokens to another address on Starknet. Supports gasfree mode where gas is paid in an ERC-20 token instead of ETH/STRK.",
  inputSchema: {
    type: "object",
    properties: {
      recipient: {
        type: "string",
        description: "Recipient address (must start with 0x)",
      },
      token: {
        type: "string",
        description: "Token symbol (ETH, STRK, USDC, USDC.e, USDT) or contract address",
      },
      amount: {
        type: "string",
        description: "Amount to transfer in human-readable format (e.g., '1.5' for 1.5 tokens)",
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
      dryRun: {
        type: "boolean",
        description: "Validate and simulate transfer without submitting a transaction.",
        default: false,
      },
    },
    required: ["recipient", "token", "amount"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { executeTransaction, waitForTransactionSuccess } = ctx;

  const { recipient, token, amount, gasfree = false, gasToken, dryRun = false } = args as {
    recipient: string;
    token: string;
    amount: string;
    gasfree?: boolean;
    gasToken?: string;
    dryRun?: boolean;
  };

  const validatedRecipient = parseAddress("recipient", recipient);
  const tokenAddress = await resolveTokenAddressAsync(token);
  const amountWei = await parseAmount(amount, tokenAddress);
  const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;

  const transferCall: Call = {
    contractAddress: tokenAddress,
    entrypoint: "transfer",
    calldata: CallData.compile({
      recipient: validatedRecipient,
      amount: cairo.uint256(amountWei),
    }),
  };

  const transactionHash = await executeTransaction(transferCall, gasfree, gasTokenAddress, dryRun);
  if (!dryRun) {
    await waitForTransactionSuccess(transactionHash, "starknet_transfer");
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          transactionHash: dryRun ? null : transactionHash,
          recipient,
          token,
          amount,
          gasfree,
          dryRun,
          simulated: dryRun,
        }, null, 2),
      },
    ],
  };
}
