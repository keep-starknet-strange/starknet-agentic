import fs from "node:fs";
import path from "node:path";
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

function getDemoRootDir(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
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
    mcpEntry: resolveMcpEntry(),
    accountAddress: requiredEnv("STARKNET_ACCOUNT_ADDRESS"),
    signerMode: signerModeRaw,
    transferToken: optionalEnv("DEMO_TRANSFER_TOKEN") ?? "STRK",
    transferAmount: optionalEnv("DEMO_TRANSFER_AMOUNT") ?? "0.001",
    rejectionProbeAmount: optionalEnv("DEMO_REJECTION_PROBE_AMOUNT") ?? "999999",
    swapSellToken: optionalEnv("DEMO_SWAP_SELL_TOKEN"),
    swapAmount: optionalEnv("DEMO_SWAP_AMOUNT"),
    swapSlippage: optionalEnv("DEMO_SWAP_SLIPPAGE") ? Number(optionalEnv("DEMO_SWAP_SLIPPAGE")) : undefined,
    vesuToken: optionalEnv("DEMO_VESU_TOKEN") ?? "STRK",
    vesuPool: optionalEnv("DEMO_VESU_POOL"),
    vesuDepositAmount: optionalEnv("DEMO_VESU_DEPOSIT_AMOUNT") ?? "0.01",
    vesuWithdrawAmount: args.withWithdraw
      ? optionalEnv("DEMO_VESU_WITHDRAW_AMOUNT") ?? optionalEnv("DEMO_VESU_DEPOSIT_AMOUNT") ?? "0.005"
      : undefined,
    agentId: optionalEnv("DEMO_AGENT_ID"),
    sessionAccountAddress: optionalEnv("DEMO_SESSION_ACCOUNT_ADDRESS"),
    sessionKeyPublicKey: optionalEnv("DEMO_SESSION_KEY_PUBLIC_KEY"),
    expiredSessionProbeAmount: optionalEnv("DEMO_EXPIRED_SESSION_PROBE_AMOUNT") ?? "0.000001",
    outputDir: args.outputDir ?? optionalEnv("DEMO_OUTPUT_DIR") ?? path.resolve(getDemoRootDir(), "artifacts"),
  });

  return config;
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
    STARKNET_MCP_POLICY:
      optionalEnv("STARKNET_MCP_POLICY") ??
      JSON.stringify({
        transfer: {
          maxAmountPerCall: optionalEnv("DEMO_POLICY_MAX_TRANSFER") ?? "0.01",
        },
      }),
  };

  if (config.signerMode === "direct") {
    env.STARKNET_PRIVATE_KEY = requiredEnv("STARKNET_PRIVATE_KEY");
  } else {
    env.KEYRING_PROXY_URL = requiredEnv("KEYRING_PROXY_URL");
    env.KEYRING_HMAC_SECRET = requiredEnv("KEYRING_HMAC_SECRET");
    if (optionalEnv("KEYRING_CLIENT_ID")) env.KEYRING_CLIENT_ID = optionalEnv("KEYRING_CLIENT_ID")!;
    if (optionalEnv("KEYRING_SIGNING_KEY_ID")) env.KEYRING_SIGNING_KEY_ID = optionalEnv("KEYRING_SIGNING_KEY_ID")!;
    if (optionalEnv("KEYRING_REQUEST_TIMEOUT_MS")) {
      env.KEYRING_REQUEST_TIMEOUT_MS = optionalEnv("KEYRING_REQUEST_TIMEOUT_MS")!;
    }
  }

  // Keep only non-empty values to avoid overriding defaults in the MCP server.
  for (const key of Object.keys(env)) {
    if (env[key] === "") delete env[key];
  }

  return env;
}
