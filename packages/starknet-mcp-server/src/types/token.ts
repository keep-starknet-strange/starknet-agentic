/**
 * Token types for the Starknet MCP Server.
 * Extends avnu SDK Token type with cache metadata.
 */

import type { Token, TokenTag } from "@avnu/avnu-sdk";

/**
 * Extended Token type with cache metadata.
 * Used internally by TokenService for caching.
 */
export interface CachedToken extends Token {
  /** True for the built-in tokens of the configured network - never expires */
  isStatic: boolean;
  /** Timestamp when token was cached - used for TTL */
  lastUpdated: number;
}

/** Cache TTL: 24 hours in milliseconds */
export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Re-export types from avnu SDK for convenience
export type { Token, TokenTag };
