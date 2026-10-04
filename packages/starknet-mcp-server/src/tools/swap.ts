import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getQuotes, quoteToCalls, type QuoteRequest } from "@avnu/avnu-sdk";
import { resolveTokenAddressAsync } from "../utils.js";
import { getTokenService } from "../services/index.js";
import { formatQuoteFields } from "../utils/formatter.js";
import {
  parseAmount,
  assertQuoteNotExpired,
  priceImpactWarning,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_swap",
  description:
    "Execute a token swap on Starknet using avnu aggregator for best prices. Supports gasfree mode where gas is paid via paymaster.",
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
      slippage: {
        type: "number",
        description: "Maximum slippage tolerance (0.01 = 1%)",
        default: 0.01,
      },
      gasfree: {
        type: "boolean",
        description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
        default: false,
      },
      gasToken: {
        type: "string",
        description: "Token to pay gas fees in (symbol or address). Defaults to sellToken. Only used when gasfree=true and no API key is set.",
      },
    },
    required: ["sellToken", "buyToken", "amount"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env, account, executeTransaction, waitForTransactionSuccess } = ctx;

  const { sellToken, buyToken, amount, slippage = 0.01, gasfree = false, gasToken } = args as {
    sellToken: string;
    buyToken: string;
    amount: string;
    slippage?: number;
    gasfree?: boolean;
    gasToken?: string;
  };

  // Validate slippage is within reasonable bounds
  if (slippage < 0 || slippage > 0.15) {
    throw new Error("Slippage must be between 0 and 0.15 (15%). Recommended: 0.005-0.03.");
  }

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
    throw new Error("No quotes available for this swap");
  }

  const bestQuote = quotes[0];
  assertQuoteNotExpired(bestQuote);

  const { calls } = await quoteToCalls({
    quoteId: bestQuote.quoteId,
    takerAddress: account.address,
    slippage,
    executeApprove: true,
  }, { baseUrl: env.AVNU_BASE_URL });

  const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : sellTokenAddress;
  const transactionHash = await executeTransaction(calls, gasfree, gasTokenAddress);
  await waitForTransactionSuccess(transactionHash, "starknet_swap");

  const tokenService = getTokenService();
  const buyDecimals = await tokenService.getDecimalsAsync(buyTokenAddress);
  const quoteFields = formatQuoteFields(bestQuote, buyDecimals);

  const swapPriceWarning = priceImpactWarning(bestQuote.priceImpact);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          transactionHash,
          sellToken,
          buyToken,
          sellAmount: amount,
          ...quoteFields,
          buyAmountInUsd: bestQuote.buyAmountInUsd?.toFixed(2),
          slippage,
          gasfree,
          ...(swapPriceWarning ? { warning: swapPriceWarning } : {}),
        }, null, 2),
      },
    ],
  };
}
