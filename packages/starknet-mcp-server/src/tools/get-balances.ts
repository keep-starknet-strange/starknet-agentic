import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateTokensInputAsync } from "../utils.js";
import { fetchTokenBalances } from "../helpers/balance.js";
import { formatAmount } from "../utils/formatter.js";
import type { ToolArgs, ToolContext, ToolResult } from "./_shared.js";

export const definition: Tool = {
  name: "starknet_get_balances",
  description:
    "Get multiple token balances for an address in a single RPC call. More efficient than calling starknet_get_balance multiple times. Supports ETH, STRK, USDC, USDT, or any token addresses.",
  inputSchema: {
    type: "object",
    properties: {
      address: {
        type: "string",
        description: "The address to check balances for (defaults to agent's address)",
      },
      tokens: {
        type: "array",
        items: { type: "string" },
        description: "Array of token symbols (ETH, STRK, USDC, USDT) or contract addresses",
      },
    },
    required: ["tokens"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, provider } = ctx;

  const { address = env.STARKNET_ACCOUNT_ADDRESS, tokens } = args as {
    address?: string;
    tokens: string[];
  };

  const tokenAddresses = await validateTokensInputAsync(tokens);
  const { balances, method } = await fetchTokenBalances(address, tokens, tokenAddresses, provider);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          address,
          balances: balances.map((b) => ({
            token: b.token,
            tokenAddress: b.tokenAddress,
            balance: formatAmount(b.balance, b.decimals),
            raw: b.balance.toString(),
            decimals: b.decimals,
          })),
          tokensQueried: tokens.length,
          method,
        }, null, 2),
      },
    ],
  };
}
