import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getQuotes, quoteToCalls, type QuoteRequest } from "@avnu/avnu-sdk";
import { resolveTokenAddressAsync } from "../utils.js";
import { getTokenService } from "../services/index.js";
import { parseDecimalToBigInt } from "../helpers/parseDecimal.js";
import {
  parseAddress,
  assertQuoteNotExpired,
  type ToolArgs,
  type ToolContext,
  type ToolResult,
} from "./_shared.js";

export const definition: Tool = {
  name: "starknet_build_swap_calls",
  description:
    "Build unsigned swap calls via AVNU. Returns approval + swap Call[] for external signing.",
  inputSchema: {
    type: "object",
    properties: {
      sellTokenAddress: {
        type: "string",
        description: "Token to sell (address or symbol like 'ETH', 'STRK')",
      },
      buyTokenAddress: {
        type: "string",
        description: "Token to buy (address or symbol)",
      },
      sellAmount: {
        type: "string",
        description: "Amount to sell in human-readable units (e.g. '0.1')",
      },
      signerAddress: {
        type: "string",
        description: "Address of the account that will sign and execute (0x-prefixed)",
      },
      slippageBps: {
        type: "number",
        description: "Slippage tolerance in basis points (default: 100 = 1%)",
        default: 100,
      },
    },
    required: ["sellTokenAddress", "buyTokenAddress", "sellAmount", "signerAddress"],
  },
};

export async function handler(args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const { env } = ctx;

  const {
    sellTokenAddress: rawSellToken,
    buyTokenAddress: rawBuyToken,
    sellAmount: rawSellAmount,
    signerAddress: rawSigner,
    slippageBps = 100,
  } = args as {
    sellTokenAddress: string;
    buyTokenAddress: string;
    sellAmount: string;
    signerAddress: string;
    slippageBps?: number;
  };

  // Validate slippage bounds (1500 bps = 15% max)
  if (slippageBps < 0 || slippageBps > 1500) {
    throw new Error("slippageBps must be between 0 and 1500 (15%). Recommended: 50-300.");
  }

  const sellTokenAddress = rawSellToken.startsWith("0x")
    ? parseAddress("sellTokenAddress", rawSellToken)
    : await resolveTokenAddressAsync(rawSellToken);

  const buyTokenAddress = rawBuyToken.startsWith("0x")
    ? parseAddress("buyTokenAddress", rawBuyToken)
    : await resolveTokenAddressAsync(rawBuyToken);

  const signerAddress = parseAddress("signerAddress", rawSigner);

  const swapTokenService = getTokenService();
  const sellDecimals = await swapTokenService.getDecimalsAsync(sellTokenAddress);
  const sellAmountBigInt = parseDecimalToBigInt(rawSellAmount, sellDecimals);

  // Get quote from AVNU
  const quoteRequest: QuoteRequest = {
    sellTokenAddress,
    buyTokenAddress,
    sellAmount: sellAmountBigInt,
    takerAddress: signerAddress,
  };

  const quotes = await getQuotes(quoteRequest, { baseUrl: env.AVNU_BASE_URL });
  if (!quotes || quotes.length === 0) {
    throw new Error("No swap quotes available for this pair/amount");
  }

  const bestQuote = quotes[0];
  assertQuoteNotExpired(bestQuote);
  const slippage = slippageBps / 10000;

  const { calls: swapCalls } = await quoteToCalls({
    quoteId: bestQuote.quoteId,
    takerAddress: signerAddress,
    slippage,
    executeApprove: true,
  }, { baseUrl: env.AVNU_BASE_URL });

  const sellSymbol = swapTokenService.getStaticSymbol(sellTokenAddress) ?? sellTokenAddress;
  const buySymbol = swapTokenService.getStaticSymbol(buyTokenAddress) ?? buyTokenAddress;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            calls: swapCalls,
            callCount: swapCalls.length,
            sellToken: sellSymbol,
            buyToken: buySymbol,
            sellAmount: rawSellAmount,
            buyAmount: bestQuote.buyAmount?.toString(),
            slippageBps,
            signerAddress,
            note: "Unsigned swap calls (approval + swap). Pass to account.execute(calls) with session key or owner signature.",
          },
          null,
          2
        ),
      },
    ],
  };
}
