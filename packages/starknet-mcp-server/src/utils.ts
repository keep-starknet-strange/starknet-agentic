/**
 * Utility functions for Starknet MCP Server
 */

import { validateAndParseAddress } from "starknet";
import { getTokenService } from "./services/index.js";

/**
 * Maximum number of tokens that can be queried in a single batch balance request.
 * Limited by BalanceChecker contract capacity.
 */
export const MAX_BATCH_TOKENS = 200;

/**
 * Resolve token symbol to contract address asynchronously.
 * For unknown symbols, fetches from avnu SDK.
 *
 * @param token - Token symbol (case-insensitive) or contract address (0x...)
 * @returns Normalized contract address
 * @throws Error if token cannot be resolved
 *
 * @example
 * ```typescript
 * await resolveTokenAddressAsync("ETH")    // → "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 * await resolveTokenAddressAsync("eth")    // → "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7"
 * await resolveTokenAddressAsync("0x123")  // → "0x0...0123" (normalized)
 * await resolveTokenAddressAsync("WETH")   // → fetches from avnu SDK
 * ```
 */
export async function resolveTokenAddressAsync(token: string): Promise<string> {
  return getTokenService().resolveSymbolAsync(token);
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
 * Validate and resolve tokens input asynchronously.
 * For unknown symbols, fetches from avnu SDK.
 *
 * @param tokens - Array of token symbols or addresses
 * @returns Array of resolved token addresses
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * await validateTokensInputAsync(["ETH", "USDC"])  // → ["0x049d...", "0x053c..."]
 * await validateTokensInputAsync([])               // → throws "At least one token is required"
 * await validateTokensInputAsync(["ETH", "ETH"])   // → throws "Duplicate tokens in request"
 * ```
 */
export async function validateTokensInputAsync(tokens: string[] | undefined): Promise<string[]> {
  if (!tokens || tokens.length === 0) {
    throw new Error("At least one token is required");
  }
  if (tokens.length > MAX_BATCH_TOKENS) {
    throw new Error(`Maximum ${MAX_BATCH_TOKENS} tokens per request`);
  }
  const tokenAddresses = await Promise.all(tokens.map(resolveTokenAddressAsync));
  if (new Set(tokenAddresses).size !== tokens.length) {
    throw new Error("Duplicate tokens in request");
  }
  return tokenAddresses;
}
