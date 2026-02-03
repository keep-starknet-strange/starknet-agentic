/**
 * Utility functions for Starknet MCP Server
 */

import { validateAndParseAddress } from "starknet";

/**
 * Well-known token addresses on Starknet Mainnet.
 * Used for symbol-to-address resolution in MCP tools.
 */
export const TOKENS: Record<string, string> = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

/**
 * Cached decimal values for common tokens.
 * Avoids on-chain queries for frequently used tokens.
 * Unknown tokens should fetch decimals from contract.
 */
export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.ETH]: 18,
  [TOKENS.STRK]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.USDT]: 6,
};

/**
 * Maximum number of tokens that can be queried in a single batch balance request.
 * Limited by BalanceChecker contract capacity.
 */
export const MAX_BATCH_TOKENS = 200;

/**
 * Resolve token symbol to contract address.
 * Accepts well-known symbols (ETH, STRK, USDC, USDT) case-insensitively,
 * or any hex address string.
 *
 * @param token - Token symbol (case-insensitive) or contract address (0x...)
 * @returns Normalized contract address
 * @throws Error if token symbol is unknown and not a valid hex address
 *
 * @example
 * ```typescript
 * resolveTokenAddress("ETH")    // → "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 * resolveTokenAddress("eth")    // → "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 * resolveTokenAddress("0x123")  // → "0x123" (passthrough)
 * resolveTokenAddress("UNKNOWN") // → throws Error
 * ```
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
 * Normalize a Starknet address to lowercase with 0x prefix and 64 hex characters.
 * Uses starknet.js validateAndParseAddress which validates and pads the address.
 *
 * @param address - Raw Starknet address (may be short or uppercase)
 * @returns Normalized address (0x + 64 lowercase hex chars)
 * @throws Error if address is invalid
 *
 * @example
 * ```typescript
 * normalizeAddress("0x123")     // → "0x0000...0123" (64 chars)
 * normalizeAddress("0x49D3...")  // → "0x049d..." (lowercase)
 * ```
 */
export function normalizeAddress(address: string): string {
  return validateAndParseAddress(address).toLowerCase();
}

/**
 * Get cached decimal value for a known token address.
 * Returns undefined for unknown tokens - caller should fetch from contract.
 * Checks both the original and normalized address for maximum compatibility.
 *
 * @param tokenAddress - Token contract address
 * @returns Token decimals (e.g., 18 for ETH) or undefined if not cached
 *
 * @example
 * ```typescript
 * getCachedDecimals(TOKENS.ETH)     // → 18
 * getCachedDecimals(TOKENS.USDC)    // → 6
 * getCachedDecimals("0xunknown")    // → undefined
 * ```
 */
export function getCachedDecimals(tokenAddress: string): number | undefined {
  const normalized = normalizeAddress(tokenAddress);
  // Check both normalized and original address
  return TOKEN_DECIMALS[tokenAddress] ?? TOKEN_DECIMALS[normalized];
}

/**
 * Validate and resolve tokens input for batch balance queries.
 * Checks for empty array, max tokens limit, and duplicates.
 *
 * @param tokens - Array of token symbols or addresses
 * @returns Array of resolved token addresses
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * validateTokensInput(["ETH", "USDC"])  // → ["0x049d...", "0x053c..."]
 * validateTokensInput([])               // → throws "At least one token is required"
 * validateTokensInput(["ETH", "ETH"])   // → throws "Duplicate tokens in request"
 * ```
 */
export function validateTokensInput(tokens: string[] | undefined): string[] {
  if (!tokens || tokens.length === 0) {
    throw new Error("At least one token is required");
  }
  if (tokens.length > MAX_BATCH_TOKENS) {
    throw new Error(`Maximum ${MAX_BATCH_TOKENS} tokens per request`);
  }
  const tokenAddresses = tokens.map(resolveTokenAddress);
  const normalizedSet = new Set(tokenAddresses.map(normalizeAddress));
  if (normalizedSet.size !== tokens.length) {
    throw new Error("Duplicate tokens in request");
  }
  return tokenAddresses;
}
