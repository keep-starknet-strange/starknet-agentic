import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolveTokenAddressAsync } from "../utils.js";
import { fetchTokenBalance } from "../helpers/balance.js";
import { formatAmount } from "../utils/formatter.js";
import type { ToolArgs, ToolContext, ToolResult } from "./_shared.js";

export const definition: Tool = {
  name: "starknet_get_balance",
  description:
    "Get token balance for an address on Starknet. Supports ETH, STRK, USDC (Circle native), USDC.e (legacy bridged USDC), USDT, or any token address. For multiple tokens, use starknet_get_balances instead.",
  inputSchema: {
    type: "object",
    properties: {
      address: {
        type: "string",
        description: "The address to check balance for (defaults to agent's address)",
      },
      token: {
        type: "string",
        description: "Token symbol (ETH, STRK, USDC, USDC.e, USDT) or contract address",
      },
    },
    required: ["token"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, provider } = ctx;

  const { address = env.STARKNET_ACCOUNT_ADDRESS, token } = args as {
    address?: string;
    token: string;
  };

  const tokenAddress = await resolveTokenAddressAsync(token);
  const { balance, decimals } = await fetchTokenBalance(address, tokenAddress, provider);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          address,
          token,
          tokenAddress,
          balance: formatAmount(balance, decimals),
          raw: balance.toString(),
          decimals,
        }, null, 2),
      },
    ],
  };
}
