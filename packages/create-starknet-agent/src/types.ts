/**
 * Types for create-starknet-agent CLI
 */

import {
  AVNU_API_URLS,
  AVNU_PAYMASTER_URLS,
  MAINNET_TOKENS,
  PUBLIC_RPC_URLS,
  SEPOLIA_TOKENS,
} from "@starknetfoundation/starknet-agentic-shared/constants";

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

// Default RPC written into generated projects and MCP configs: keyless public
// endpoints (RPC spec v0_10), so a new project works without signing up for a
// provider. They are shared and may be rate-limited; users can point
// STARKNET_RPC_URL at their own provider for production.
export const RPC_URLS: Record<Exclude<Network, "custom">, string> = {
  mainnet: PUBLIC_RPC_URLS.mainnet,
  sepolia: PUBLIC_RPC_URLS.sepolia,
};

// Interpolated into generated projects at generation time, so generated code
// keeps literal addresses and never imports the (private) shared package.
export const TOKEN_ADDRESSES = {
  mainnet: {
    ETH: MAINNET_TOKENS.ETH,
    STRK: MAINNET_TOKENS.STRK,
    USDC: MAINNET_TOKENS.USDC,
    USDT: MAINNET_TOKENS.USDT,
  },
  sepolia: {
    ETH: SEPOLIA_TOKENS.ETH,
    STRK: SEPOLIA_TOKENS.STRK,
  },
};

export const AVNU_URLS = {
  mainnet: {
    api: AVNU_API_URLS.mainnet,
    paymaster: AVNU_PAYMASTER_URLS.mainnet,
  },
  sepolia: {
    api: AVNU_API_URLS.sepolia,
    paymaster: AVNU_PAYMASTER_URLS.sepolia,
  },
};
