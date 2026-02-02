/**
 * Utility functions for Starknet MCP Server
 */

import { validateAndParseAddress } from "starknet";

// Token addresses (Mainnet)
export const TOKENS: Record<string, string> = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// Token decimals (common tokens - others fetched on-demand)
export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.ETH]: 18,
  [TOKENS.STRK]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.USDT]: 6,
};

// Maximum number of tokens for batch balance queries
export const MAX_BATCH_TOKENS = 200;

/**
 * Resolve token symbol to contract address.
 * Accepts ETH, STRK, USDC, USDT (case-insensitive) or hex addresses.
 */
export function resolveTokenAddress(token: string): string {
  const upperToken = token.toUpperCase();
  if (upperToken in TOKENS) {
    return TOKENS[upperToken];
  }
  if (token.startsWith("0x")) {
    return token;
  }
  throw new Error(`Unknown token: ${token}`);
}

/**
 * Format raw token amount with decimals to human-readable string.
 * Trims trailing zeros.
 */
export function formatAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) {
    return amount.toString();
  }
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals) || "0";
  const fraction = amountStr.slice(-decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

/**
 * Normalize a Starknet address to 0x prefix and 64 hex chars.
 * Uses starknet.js validateAndParseAddress which also validates the address.
 */
export function normalizeAddress(address: string): string {
  return validateAndParseAddress(address).toLowerCase();
}

/**
 * Get decimals for a token address, using cache for known tokens.
 * Returns undefined if not in cache (caller should fetch from contract).
 */
export function getCachedDecimals(tokenAddress: string): number | undefined {
  const normalized = normalizeAddress(tokenAddress);
  // Check both normalized and original address
  return TOKEN_DECIMALS[tokenAddress] ?? TOKEN_DECIMALS[normalized];
}
