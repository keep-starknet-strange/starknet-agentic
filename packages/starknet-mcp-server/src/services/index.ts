/**
 * Services index - exports singleton instances.
 */

import type { RpcProvider } from "starknet";
import { TokenService } from "./TokenService.js";

let tokenServiceInstance: TokenService | null = null;
let initializedBaseUrl: string | undefined;

/**
 * Get the singleton TokenService instance.
 * @param baseUrl - Optional avnu API base URL (only used on first call)
 */
export function getTokenService(baseUrl?: string): TokenService {
  if (!tokenServiceInstance) {
    tokenServiceInstance = new TokenService(baseUrl);
    initializedBaseUrl = baseUrl;
  } else if (baseUrl !== undefined && baseUrl !== initializedBaseUrl) {
    console.warn(
      `TokenService already initialized with baseUrl "${initializedBaseUrl}". Ignoring: "${baseUrl}"`
    );
  }
  return tokenServiceInstance;
}

/**
 * Configure the RPC provider for TokenService on-chain fallback.
 * Call this at startup after creating the RpcProvider.
 */
export function configureTokenServiceProvider(provider: RpcProvider): void {
  getTokenService().setProvider(provider);
}

/**
 * Reset the TokenService singleton (useful for testing).
 */
export function resetTokenService(): void {
  tokenServiceInstance = null;
  initializedBaseUrl = undefined;
}

export { TokenService, STATIC_TOKENS, TOKENS } from "./TokenService.js";
export type { CachedToken, Token, TokenTag } from "../types/token.js";
