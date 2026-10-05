/**
 * Services index - exports singleton instances.
 */

import type { RpcProvider } from "starknet";
import {
  STARKNET_CHAIN_IDS,
  type StarknetNetwork,
} from "@starknetfoundation/starknet-agentic-shared/constants";
import { TokenService } from "./TokenService.js";
import { log } from "../logger.js";

let tokenServiceInstance: TokenService | null = null;
let initializedBaseUrl: string | undefined;

/**
 * Get the singleton TokenService instance.
 * @param baseUrl - Optional avnu API base URL (only used on first call)
 * @param network - Network whose static tokens to load (only used on first call; default mainnet)
 */
export function getTokenService(baseUrl?: string, network?: StarknetNetwork): TokenService {
  if (!tokenServiceInstance) {
    tokenServiceInstance = new TokenService(baseUrl, network);
    initializedBaseUrl = baseUrl;
  } else {
    if (baseUrl !== undefined && baseUrl !== initializedBaseUrl) {
      log({
        level: "warn",
        event: "token_service.duplicate_init",
        details: { existingBaseUrl: initializedBaseUrl, ignoredBaseUrl: baseUrl },
      });
    }
    if (network !== undefined && network !== tokenServiceInstance.getNetwork()) {
      log({
        level: "warn",
        event: "token_service.duplicate_init",
        details: { existingNetwork: tokenServiceInstance.getNetwork(), ignoredNetwork: network },
      });
    }
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
 * Switch the TokenService static token set to `network` (e.g. once the RPC
 * chain id is known), and its avnu base URL to `baseUrl` if given. Clears
 * cached tokens if either changes.
 */
export function configureTokenServiceNetwork(network: StarknetNetwork, baseUrl?: string): void {
  getTokenService().setNetwork(network, baseUrl);
}

/**
 * Network for a Starknet chain id (hex short string, e.g. "0x534e5f5345504f4c4941"
 * for SN_SEPOLIA), or undefined for any other chain.
 */
export function networkForStarknetChainId(chainId: string): StarknetNetwork | undefined {
  let id: bigint;
  try {
    id = BigInt(chainId);
  } catch {
    return undefined;
  }
  return (Object.keys(STARKNET_CHAIN_IDS) as StarknetNetwork[]).find(
    (network) => BigInt(STARKNET_CHAIN_IDS[network]) === id
  );
}

/**
 * Reset the TokenService singleton (useful for testing).
 */
export function resetTokenService(): void {
  tokenServiceInstance = null;
  initializedBaseUrl = undefined;
}

export {
  TokenService,
  STATIC_TOKENS,
  STATIC_TOKENS_BY_NETWORK,
  TOKENS,
  findStaticToken,
} from "./TokenService.js";
export type { CachedToken, Token, TokenTag } from "../types/token.js";
