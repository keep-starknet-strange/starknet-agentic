import type { Quote, Route } from "@avnu/avnu-sdk";

export function formatAmount(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals) || "0";
  const fraction = amountStr.slice(-decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

export function formatQuoteFields(
  quote: Quote,
  buyDecimals: number
): {
  buyAmount: string;
  priceImpact: string | undefined;
  gasFeesUsd: string | undefined;
  routes: Array<{ name: string; percent: string }> | undefined;
} {
  return {
    buyAmount: formatAmount(BigInt(quote.buyAmount), buyDecimals),
    priceImpact: quote.priceImpact
      ? `${(quote.priceImpact / 100).toFixed(2)}%`
      : undefined,
    gasFeesUsd: quote.gasFeesInUsd?.toFixed(4),
    routes: quote.routes?.map((r: Route) => ({
      name: r.name,
      percent: `${(r.percent * 100).toFixed(1)}%`,
    })),
  };
}

const ERROR_PATTERNS: Array<{ patterns: string[]; message: string }> = [
  {
    patterns: ["INSUFFICIENT_LIQUIDITY", "insufficient liquidity"],
    message: "Insufficient liquidity for this swap. Try a smaller amount or different token pair.",
  },
  {
    patterns: ["SLIPPAGE", "slippage", "Insufficient tokens received"],
    message: "Slippage exceeded. Try increasing slippage tolerance.",
  },
  {
    patterns: ["QUOTE_EXPIRED", "quote expired"],
    message: "Quote expired. Please retry the operation.",
  },
  {
    patterns: ["INSUFFICIENT_BALANCE", "insufficient balance"],
    message: "Insufficient token balance for this operation.",
  },
  {
    patterns: ["No quotes available"],
    message: "No swap routes available for this token pair. The pair may not have liquidity.",
  },
];

export function formatErrorMessage(errorMessage: string): string {
  for (const { patterns, message } of ERROR_PATTERNS) {
    if (patterns.some((p) => errorMessage.includes(p))) {
      return message;
    }
  }
  return errorMessage;
}
