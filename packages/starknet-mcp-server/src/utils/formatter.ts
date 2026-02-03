import type { Quote, Route } from "@avnu/avnu-sdk";

/**
 * Format a raw token amount (in wei/smallest unit) to human-readable decimal string.
 * Removes trailing zeros and handles edge cases.
 *
 * @param amount - Raw amount as bigint (e.g., 1500000000000000000n for 1.5 ETH)
 * @param decimals - Number of decimal places for the token (e.g., 18 for ETH, 6 for USDC)
 * @returns Formatted amount as string (e.g., "1.5" for 1.5 ETH, "100" for 100 USDC)
 *
 * @example
 * ```typescript
 * formatAmount(1500000000000000000n, 18) // → "1.5"
 * formatAmount(1000000n, 6)              // → "1"
 * formatAmount(123456789n, 6)            // → "123.456789"
 * formatAmount(0n, 18)                   // → "0"
 * ```
 */
export function formatAmount(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals) || "0";
  const fraction = amountStr.slice(-decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

/**
 * Format AVNU quote fields for human-readable display.
 * Converts raw quote data to formatted strings with percentages and amounts.
 *
 * @param quote - Raw quote from AVNU API
 * @param buyDecimals - Decimals of the output token
 * @returns Formatted quote fields with human-readable amounts and percentages
 *
 * @example
 * ```typescript
 * const formatted = formatQuoteFields(quote, 6);
 * // {
 * //   buyAmount: "100.5",
 * //   priceImpact: "0.15%",
 * //   gasFeesUsd: "2.3456",
 * //   routes: [{ name: "Ekubo", percent: "60.0%" }]
 * // }
 * ```
 */
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

/**
 * Common error patterns and their user-friendly messages.
 * Used to translate technical errors into actionable feedback.
 */
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

/**
 * Convert technical error messages to user-friendly actionable messages.
 * Matches error strings against known patterns and returns helpful guidance.
 *
 * @param errorMessage - Raw error message from contract or API
 * @returns User-friendly error message with recovery suggestions
 *
 * @example
 * ```typescript
 * formatErrorMessage("INSUFFICIENT_LIQUIDITY in pool")
 * // → "Insufficient liquidity for this swap. Try a smaller amount or different token pair."
 *
 * formatErrorMessage("Unknown error occurred")
 * // → "Unknown error occurred" (passthrough if no pattern matches)
 * ```
 */
export function formatErrorMessage(errorMessage: string): string {
  for (const { patterns, message } of ERROR_PATTERNS) {
    if (patterns.some((p) => errorMessage.includes(p))) {
      return message;
    }
  }
  return errorMessage;
}
