import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getQuotes, type QuoteRequest } from "@avnu/avnu-sdk";
import { resolveTokenAddressAsync } from "../utils.js";
import { getTokenService } from "../services/index.js";
import { formatQuoteFields } from "../utils/formatter.js";
import {
  parseAmount,
  priceImpactWarning,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_get_quote",
  description: "Get swap quote without executing the trade",
  inputSchema: {
    type: "object",
    properties: {
      sellToken: {
        type: "string",
        description: "Token to sell (symbol or address)",
      },
      buyToken: {
        type: "string",
        description: "Token to buy (symbol or address)",
      },
      amount: {
        type: "string",
        description: "Amount to sell in human-readable format",
      },
    },
    required: ["sellToken", "buyToken", "amount"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, account } = ctx;

  const { sellToken, buyToken, amount } = args as {
    sellToken: string;
    buyToken: string;
    amount: string;
  };

  const [sellTokenAddress, buyTokenAddress] = await Promise.all([
    resolveTokenAddressAsync(sellToken),
    resolveTokenAddressAsync(buyToken),
  ]);
  const sellAmount = await parseAmount(amount, sellTokenAddress);

  const quoteParams: QuoteRequest = {
    sellTokenAddress,
    buyTokenAddress,
    sellAmount,
    takerAddress: account.address,
  };

  const quotes = await getQuotes(quoteParams, { baseUrl: env.AVNU_BASE_URL });
  if (!quotes || quotes.length === 0) {
    throw new Error("No quotes available");
  }

  const bestQuote = quotes[0];

  const tokenService = getTokenService();
  const buyDecimals = await tokenService.getDecimalsAsync(buyTokenAddress);
  const quoteFields = formatQuoteFields(bestQuote, buyDecimals);
  const quotePriceWarning = priceImpactWarning(bestQuote.priceImpact);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sellToken,
          buyToken,
          sellAmount: amount,
          ...quoteFields,
          sellAmountInUsd: bestQuote.sellAmountInUsd?.toFixed(2),
          buyAmountInUsd: bestQuote.buyAmountInUsd?.toFixed(2),
          quoteId: bestQuote.quoteId,
          ...(quotePriceWarning ? { warning: quotePriceWarning } : {}),
        }, null, 2),
      },
    ],
  };
}
