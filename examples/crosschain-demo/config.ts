import {
  MAINNET_TOKENS,
  SEPOLIA_DEPLOYMENTS,
  SEPOLIA_TOKENS,
} from "@starknetfoundation/starknet-agentic-shared/constants";

export interface StarknetNetworkConfig {
  factory: string;
  registry: string;
  rpc: string;
  explorer: string;
}

export const STARKNET_NETWORKS: Record<string, StarknetNetworkConfig> = {
  sepolia: {
    // Maintainer-reviewed deployed addresses; sync with docs/DEPLOYMENT_TRUTH_SHEET.md.
    factory: SEPOLIA_DEPLOYMENTS.agentAccountFactory,
    registry: SEPOLIA_DEPLOYMENTS.identityRegistry,
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
    ETH: SEPOLIA_TOKENS.ETH,
    STRK: SEPOLIA_TOKENS.STRK,
  },
  mainnet: {
    ETH: MAINNET_TOKENS.ETH,
    STRK: MAINNET_TOKENS.STRK,
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
