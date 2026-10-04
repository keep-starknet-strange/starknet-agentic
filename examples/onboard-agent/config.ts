/**
 * Network configuration for the onboarding flow.
 *
 * Factory and registry addresses are filled in after deploying
 * contracts with contracts/agent-account/scripts/deploy.js
 */

import {
  MAINNET_TOKENS,
  SEPOLIA_DEPLOYMENTS,
  SEPOLIA_TOKENS,
} from "@starknetfoundation/starknet-agentic-shared/constants";

export interface NetworkConfig {
  factory: string;
  registry: string;
  rpc: string;
  explorer: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  sepolia: {
    // Maintainer-reviewed deployed addresses; sync with docs/DEPLOYMENT_TRUTH_SHEET.md.
    factory: SEPOLIA_DEPLOYMENTS.agentAccountFactory,
    registry: SEPOLIA_DEPLOYMENTS.identityRegistry,
    rpc: "https://starknet-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.voyager.online",
  },
  mainnet: {
    factory: "", // v2: fill after Sepolia validation
    registry: "", // v2: fill after Sepolia validation
    rpc: "https://starknet-rpc.publicnode.com",
    explorer: "https://voyager.online",
  },
};

/** ERC-20 token addresses per network */
export const TOKENS: Record<string, Record<string, string>> = {
  sepolia: {
    ETH: SEPOLIA_TOKENS.ETH,
    STRK: SEPOLIA_TOKENS.STRK,
  },
  mainnet: {
    ETH: MAINNET_TOKENS.ETH,
    STRK: MAINNET_TOKENS.STRK,
  },
};
