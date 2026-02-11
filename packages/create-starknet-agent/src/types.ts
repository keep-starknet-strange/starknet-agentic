/**
 * Types for create-starknet-agent CLI
 */

export type Network = "mainnet" | "sepolia" | "custom";

export type Template = "minimal" | "defi" | "full";

export type DeFiProtocol = "avnu" | "zklend" | "nostra" | "ekubo";

export type ExampleType = "none" | "hello-agent" | "defi-agent";

/**
 * Supported agent platforms for lightweight integration
 */
export type PlatformType =
  | "openclaw"
  | "claude-code"
  | "cursor"
  | "daydreams"
  | "generic-mcp"
  | "standalone";

/**
 * Detection confidence level for platforms
 */
export type DetectionConfidence = "high" | "medium" | "low";

/**
 * Detected platform information
 */
export interface DetectedPlatform {
  /** Platform type identifier */
  type: PlatformType;
  /** Human-readable platform name */
  name: string;
  /** Where to write MCP config */
  configPath: string;
  /** Where skills are installed (if applicable) */
  skillsPath?: string;
  /** Where credentials are stored */
  secretsPath?: string;
  /** True if CLI was invoked by an agent (non-TTY, env hints) */
  isAgentInitiated: boolean;
  /** How confident we are in this detection */
  confidence: DetectionConfidence;
  /** What triggered this detection */
  detectedBy: string;
}

export interface ProjectConfig {
  projectName: string;
  network: Network;
  customRpcUrl?: string;
  template: Template;
  defiProtocols: DeFiProtocol[];
  includeExample: ExampleType;
  installDeps: boolean;
  /** Selected platform (from detection or CLI flag) */
  platform?: DetectedPlatform;
}

export interface GeneratedFiles {
  [path: string]: string;
}

export const RPC_URLS: Record<Exclude<Network, "custom">, string> = {
  mainnet: "https://starknet-mainnet.public.blastapi.io",
  sepolia: "https://starknet-sepolia.public.blastapi.io",
};

export const TOKEN_ADDRESSES = {
  mainnet: {
    ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
  },
  sepolia: {
    ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  },
};

export const AVNU_URLS = {
  mainnet: {
    api: "https://starknet.api.avnu.fi",
    paymaster: "https://starknet.paymaster.avnu.fi",
  },
  sepolia: {
    api: "https://sepolia.api.avnu.fi",
    paymaster: "https://sepolia.paymaster.avnu.fi",
  },
};
