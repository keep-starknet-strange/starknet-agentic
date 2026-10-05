import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { CallData, cairo, type Call } from "starknet";
import { resolveTokenAddressAsync } from "../utils.js";
import { getTokenService } from "../services/index.js";
import { parseDecimalToBigInt } from "../helpers/parseDecimal.js";
import {
  parseAddress,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_build_transfer_calls",
  description:
    "Build unsigned ERC-20 transfer calls. Returns Call[] for external signing (session key, owner, hardware wallet).",
  inputSchema: {
    type: "object",
    properties: {
      tokenAddress: {
        type: "string",
        description: "ERC-20 token contract address (0x-prefixed), or token symbol like 'ETH', 'STRK', 'USDC'",
      },
      recipientAddress: {
        type: "string",
        description: "Recipient address (0x-prefixed)",
      },
      amount: {
        type: "string",
        description: "Amount to transfer in human-readable units (e.g. '1.5' for 1.5 tokens)",
      },
    },
    required: ["tokenAddress", "recipientAddress", "amount"],
  },
};

export async function handler(args: ToolArgs, _ctx: ToolContext): Promise<ToolResult> {
  const {
    tokenAddress: rawToken,
    recipientAddress: rawRecipient,
    amount: rawAmount,
  } = args as {
    tokenAddress: string;
    recipientAddress: string;
    amount: string;
  };

  // Resolve token symbol to address if needed
  const tokenAddress = rawToken.startsWith("0x")
    ? parseAddress("tokenAddress", rawToken)
    : await resolveTokenAddressAsync(rawToken);

  const recipientAddress = parseAddress("recipientAddress", rawRecipient);

  // Look up token decimals for human-readable amount conversion
  const tokenService = getTokenService();
  const decimals = await tokenService.getDecimalsAsync(tokenAddress);
  const tokenSymbol = tokenService.getStaticSymbol(tokenAddress) ?? tokenAddress;

  const amountBigInt = parseDecimalToBigInt(rawAmount, decimals);

  // ERC-20 transfer: transfer(recipient, amount_u256_low, amount_u256_high)
  const calls: Call[] = [
    {
      contractAddress: tokenAddress,
      entrypoint: "transfer",
      calldata: CallData.compile({
        recipient: recipientAddress,
        amount: cairo.uint256(amountBigInt),
      }),
    },
  ];

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            calls,
            callCount: calls.length,
            token: tokenSymbol,
            amount: rawAmount,
            recipient: recipientAddress,
            note: "Unsigned transfer call. Pass to account.execute(calls) with session key or owner signature.",
          },
          null,
          2
        ),
      },
    ],
  };
}
