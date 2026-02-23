/**
 * Network configuration for the onboarding flow.
 *
 * Factory and registry addresses are filled in after deploying
 * contracts with contracts/agent-account/scripts/deploy.js
 */

export interface NetworkConfig {
  factory: string;
  registry: string;
  rpc: string;
  explorer: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  sepolia: {
    factory: "0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e",
    registry: "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631",
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
    ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
  mainnet: {
    ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
};
