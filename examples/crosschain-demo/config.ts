export interface StarknetNetworkConfig {
  factory: string;
  registry: string;
  rpc: string;
  explorer: string;
}

export const STARKNET_NETWORKS: Record<string, StarknetNetworkConfig> = {
  sepolia: {
    // Maintainer-reviewed deployed addresses; sync with docs/DEPLOYMENT_TRUTH_SHEET.md.
    factory: "0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e",
    registry: "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631",
    rpc: "https://starknet-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.voyager.online",
  },
  mainnet: {
    factory: "",
    registry: "",
    rpc: "https://starknet-rpc.publicnode.com",
    explorer: "https://voyager.online",
  },
};

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

export interface EvmNetworkConfig {
  name: string;
  chainId: number;
  rpc: string;
  explorer: string;
  identityRegistry: string;
  reputationRegistry: string;
}

export const EVM_NETWORKS: Record<string, EvmNetworkConfig> = {
  "base-sepolia": {
    name: "Base Sepolia",
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  },
};

export const STARKNET_NAMESPACE: Record<string, string> = {
  sepolia: "SN_SEPOLIA",
  mainnet: "SN_MAIN",
};

export const PLACEHOLDER_URI = "https://example.com/erc8004/pending-crosschain-link";
