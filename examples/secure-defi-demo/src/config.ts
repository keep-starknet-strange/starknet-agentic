import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RunConfigSchema, type RunConfig } from "./types.js";

interface CliArgs {
  mode: "dry-run" | "execute";
  outputDir?: string;
  withWithdraw: boolean;
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith("--")) return undefined;
  return next;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

export function parseCliArgs(): CliArgs {
  const modeRaw = getArg("--mode") ?? "dry-run";
  if (modeRaw !== "dry-run" && modeRaw !== "execute") {
    throw new Error("--mode must be one of: dry-run, execute");
  }

  return {
    mode: modeRaw,
    outputDir: getArg("--output"),
    withWithdraw: hasFlag("--with-withdraw"),
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function optionalBoolEnv(name: string, fallback = false): boolean {
  const value = optionalEnv(name);
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function getDemoRootDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function resolveMcpEntry(): string {
  const explicit = optionalEnv("DEMO_MCP_ENTRY");
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      throw new Error(`DEMO_MCP_ENTRY does not exist: ${explicit}`);
    }
    return explicit;
  }

  const inferred = path.resolve(getDemoRootDir(), "../../packages/starknet-mcp-server/dist/index.js");
  if (!fs.existsSync(inferred)) {
    throw new Error(
      [
        `MCP entry not found at: ${inferred}`,
        "Build it first from repo root:",
        "pnpm --filter @starknet-agentic/mcp-server build",
      ].join("\n"),
    );
  }

  return inferred;
}

export function loadRunConfig(args: CliArgs): RunConfig {
  const signerModeRaw = (optionalEnv("STARKNET_SIGNER_MODE") ?? "direct").toLowerCase();
  const rpcUrl = requiredEnv("STARKNET_RPC_URL");
  const swapSlippageRaw = optionalEnv("DEMO_SWAP_SLIPPAGE");
  if (signerModeRaw !== "direct" && signerModeRaw !== "proxy") {
    throw new Error("STARKNET_SIGNER_MODE must be direct or proxy");
  }

  // Sidecar startup always needs signer credentials, even in dry-run mode.
  if (signerModeRaw === "direct") {
    requiredEnv("STARKNET_PRIVATE_KEY");
  }
  if (signerModeRaw === "proxy") {
    requiredEnv("KEYRING_PROXY_URL");
    requiredEnv("KEYRING_HMAC_SECRET");
  }

  const config = RunConfigSchema.parse({
    mode: args.mode,
    networkLabel: optionalEnv("DEMO_NETWORK_LABEL") ?? "starknet-sepolia",
    rpcUrl,
    mcpEntry: resolveMcpEntry(),
    accountAddress: requiredEnv("STARKNET_ACCOUNT_ADDRESS"),
    signerMode: signerModeRaw,
    transferToken: optionalEnv("DEMO_TRANSFER_TOKEN") ?? "STRK",
    transferAmount: optionalEnv("DEMO_TRANSFER_AMOUNT") ?? "0.001",
    rejectionProbeAmount: optionalEnv("DEMO_REJECTION_PROBE_AMOUNT") ?? "999999",
    swapSellToken: optionalEnv("DEMO_SWAP_SELL_TOKEN"),
    swapAmount: optionalEnv("DEMO_SWAP_AMOUNT"),
    swapSlippage: swapSlippageRaw ? Number(swapSlippageRaw) : undefined,
    vesuToken: optionalEnv("DEMO_VESU_TOKEN") ?? "STRK",
    vesuPool: optionalEnv("DEMO_VESU_POOL"),
    vesuDepositAmount: optionalEnv("DEMO_VESU_DEPOSIT_AMOUNT") ?? "0.01",
    vesuWithdrawAmount: args.withWithdraw
      ? optionalEnv("DEMO_VESU_WITHDRAW_AMOUNT") ?? optionalEnv("DEMO_VESU_DEPOSIT_AMOUNT") ?? "0.005"
      : undefined,
    identityRegistryAddress: optionalEnv("ERC8004_IDENTITY_REGISTRY_ADDRESS"),
    agentId: optionalEnv("DEMO_AGENT_ID"),
    autoRegisterAgent: optionalBoolEnv("DEMO_AUTO_REGISTER_AGENT", false),
    agentTokenUri: optionalEnv("DEMO_AGENT_TOKEN_URI"),
    anchorBaseToErc8004: optionalBoolEnv("DEMO_ANCHOR_BASE_TO_ERC8004", false),
    baseAnchorMetadataKey: optionalEnv("DEMO_BASE_ANCHOR_KEY") ?? "baseAttestationSha256",
    sessionAccountAddress: optionalEnv("DEMO_SESSION_ACCOUNT_ADDRESS"),
    sessionKeyPublicKey: optionalEnv("DEMO_SESSION_KEY_PUBLIC_KEY"),
    expiredSessionProbeAmount: optionalEnv("DEMO_EXPIRED_SESSION_PROBE_AMOUNT") ?? "0.000001",
    outputDir: args.outputDir ?? optionalEnv("DEMO_OUTPUT_DIR") ?? path.resolve(getDemoRootDir(), "artifacts"),
  });

  return config;
}

function resolvePolicyJson(): string {
  const rawPolicy = optionalEnv("STARKNET_MCP_POLICY");
  if (!rawPolicy) {
    return JSON.stringify({
      transfer: {
        maxAmountPerCall: optionalEnv("DEMO_POLICY_MAX_TRANSFER") ?? "0.01",
      },
    });
  }

  try {
    JSON.parse(rawPolicy);
  } catch (error) {
    throw new Error(
      `STARKNET_MCP_POLICY is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return rawPolicy;
}

export function buildSidecarEnv(config: RunConfig): Record<string, string> {
  const env: Record<string, string> = {
    STARKNET_RPC_URL: requiredEnv("STARKNET_RPC_URL"),
    STARKNET_ACCOUNT_ADDRESS: config.accountAddress,
    STARKNET_SIGNER_MODE: config.signerMode,
    AVNU_BASE_URL: optionalEnv("AVNU_BASE_URL") ?? "",
    AVNU_PAYMASTER_URL: optionalEnv("AVNU_PAYMASTER_URL") ?? "",
    AVNU_PAYMASTER_API_KEY: optionalEnv("AVNU_PAYMASTER_API_KEY") ?? "",
    AVNU_PAYMASTER_FEE_MODE: optionalEnv("AVNU_PAYMASTER_FEE_MODE") ?? "",
    STARKNET_VESU_POOL_FACTORY: optionalEnv("STARKNET_VESU_POOL_FACTORY") ?? "",
    AGENT_ACCOUNT_FACTORY_ADDRESS: optionalEnv("AGENT_ACCOUNT_FACTORY_ADDRESS") ?? "",
    ERC8004_IDENTITY_REGISTRY_ADDRESS: optionalEnv("ERC8004_IDENTITY_REGISTRY_ADDRESS") ?? "",
    STARKNET_MCP_POLICY: resolvePolicyJson(),
  };

  if (config.signerMode === "direct") {
    env.STARKNET_PRIVATE_KEY = requiredEnv("STARKNET_PRIVATE_KEY");
  } else {
    env.KEYRING_PROXY_URL = requiredEnv("KEYRING_PROXY_URL");
    env.KEYRING_HMAC_SECRET = requiredEnv("KEYRING_HMAC_SECRET");
    const keyringClientId = optionalEnv("KEYRING_CLIENT_ID");
    const keyringSigningKeyId = optionalEnv("KEYRING_SIGNING_KEY_ID");
    const keyringRequestTimeoutMs = optionalEnv("KEYRING_REQUEST_TIMEOUT_MS");
    if (keyringClientId) env.KEYRING_CLIENT_ID = keyringClientId;
    if (keyringSigningKeyId) env.KEYRING_SIGNING_KEY_ID = keyringSigningKeyId;
    if (keyringRequestTimeoutMs) env.KEYRING_REQUEST_TIMEOUT_MS = keyringRequestTimeoutMs;
  }

  // Keep only non-empty values to avoid overriding defaults in the MCP server.
  for (const key of Object.keys(env)) {
    if (env[key] === "") delete env[key];
  }

  return env;
}
