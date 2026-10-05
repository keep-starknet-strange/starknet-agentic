/**
 * Canonical Starknet constants shared by workspace packages and examples.
 *
 * Values are byte-identical to the literals they replaced (lowercase hex,
 * spelled exactly as before), because some consumers compare addresses as
 * strings. Treat any change here as a behaviour change and get maintainer
 * review; deployed contract addresses must stay in sync with
 * docs/DEPLOYMENT_TRUTH_SHEET.md.
 *
 * This package is private and never published to npm. Published packages must
 * bundle it (keep it in devDependencies and list it in tsup `noExternal`)
 * instead of depending on it at runtime.
 */

export type StarknetNetwork = "mainnet" | "sepolia";

/** ETH token address. Identical on mainnet and Sepolia. */
export const ETH_TOKEN_ADDRESS =
  "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

/** STRK token address. Identical on mainnet and Sepolia. */
export const STRK_TOKEN_ADDRESS =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

/**
 * ERC-20 token addresses on Starknet mainnet.
 *
 * USDC is Circle's native USDC (https://developers.circle.com/stablecoins/usdc-contract-addresses).
 * USDC_E is the legacy StarkGate-bridged USDC that native USDC replaced; avnu
 * and explorers list it as "USDC.e", although its on-chain symbol() is still
 * "USDC". Both use 6 decimals.
 */
export const MAINNET_TOKENS = {
  ETH: ETH_TOKEN_ADDRESS,
  STRK: STRK_TOKEN_ADDRESS,
  USDC: "0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb",
  USDC_E: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
} as const;

/**
 * ERC-20 token addresses on Starknet Sepolia. USDC and USDT are intentionally
 * absent: no Sepolia address for them is used anywhere in this repo yet.
 */
export const SEPOLIA_TOKENS = {
  ETH: ETH_TOKEN_ADDRESS,
  STRK: STRK_TOKEN_ADDRESS,
} as const;

/** Token addresses keyed by network. */
export const TOKEN_ADDRESSES = {
  mainnet: MAINNET_TOKENS,
  sepolia: SEPOLIA_TOKENS,
} as const;

/** avnu swap API base URLs. */
export const AVNU_API_URLS = {
  mainnet: "https://starknet.api.avnu.fi",
  sepolia: "https://sepolia.api.avnu.fi",
} as const satisfies Record<StarknetNetwork, string>;

/** avnu paymaster RPC URLs. */
export const AVNU_PAYMASTER_URLS = {
  mainnet: "https://starknet.paymaster.avnu.fi",
  sepolia: "https://sepolia.paymaster.avnu.fi",
} as const satisfies Record<StarknetNetwork, string>;

/**
 * Keyless public Starknet JSON-RPC endpoints (Cartridge), pinned to RPC spec
 * 0.10, the version starknet.js 10 speaks. For read-only fallbacks when no
 * STARKNET_RPC_URL is configured; they are rate limited, so production setups
 * should use their own provider. Checked live: starknet_specVersion returns
 * 0.10.x and starknet_chainId matches STARKNET_CHAIN_IDS.
 */
export const PUBLIC_RPC_URLS = {
  mainnet: "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10",
  sepolia: "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10",
} as const satisfies Record<StarknetNetwork, string>;

/** Starknet chain IDs as hex-encoded short strings ("SN_MAIN", "SN_SEPOLIA"). */
export const STARKNET_CHAIN_IDS = {
  mainnet: "0x534e5f4d41494e",
  sepolia: "0x534e5f5345504f4c4941",
} as const satisfies Record<StarknetNetwork, string>;

/**
 * Maintainer-reviewed ERC-8004 and AgentAccountFactory deployments on Sepolia
 * (see docs/DEPLOYMENT_TRUTH_SHEET.md, including its note on which
 * IdentityRegistry the factory is bound to).
 */
export const SEPOLIA_DEPLOYMENTS = {
  identityRegistry: "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631",
  validationRegistry: "0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f",
  agentAccountFactory: "0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e",
} as const;
