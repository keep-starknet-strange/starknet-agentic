/**
 * Credential setup module for create-starknet-agent
 *
 * Provides secure credential input and storage across different platforms.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import prompts from "prompts";
import pc from "picocolors";
import type { DetectedPlatform, Network, PlatformType } from "./types.js";
import { RPC_URLS } from "./types.js";
import { detectPlatforms, getPlatformByType, isValidPlatformType } from "./platform.js";
import { EXIT_CODES } from "./index.js";

/**
 * Credential storage format
 */
export interface StarknetCredentials {
  accountAddress: string;
  privateKey: string;
  rpcUrl: string;
  network?: Network;
  createdAt: string;
  updatedAt: string;
}

/**
 * Credential validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  accountExists?: boolean;
  balance?: string;
}

/**
 * JSON output for credentials command
 */
interface JsonCredentialsResult {
  success: boolean;
  platform: string;
  storagePath: string;
  storageType: "json" | "env";
  validation: ValidationResult;
  error?: string;
  exitCode: number;
}

/**
 * Parsed credentials command arguments
 */
export interface CredentialsArgs {
  platform?: PlatformType;
  fromEnv: boolean;
  fromReady: boolean;
  fromBraavos: boolean;
  network?: Network;
  jsonOutput: boolean;
  showHelp: boolean;
}

/**
 * Parse credentials subcommand arguments
 */
export function parseCredentialsArgs(args: string[]): CredentialsArgs {
  const result: CredentialsArgs = {
    platform: undefined,
    fromEnv: false,
    fromReady: false,
    fromBraavos: false,
    network: undefined,
    jsonOutput: false,
    showHelp: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
    } else if (arg === "--from-env") {
      result.fromEnv = true;
    } else if (arg === "--from-ready") {
      result.fromReady = true;
    } else if (arg === "--from-braavos") {
      result.fromBraavos = true;
    } else if (arg === "--json") {
      result.jsonOutput = true;
    } else if (arg === "--platform" && args[i + 1]) {
      const platform = args[++i];
      if (isValidPlatformType(platform)) {
        result.platform = platform;
      }
    } else if (arg === "--network" && args[i + 1]) {
      const network = args[++i];
      if (["mainnet", "sepolia"].includes(network)) {
        result.network = network as Network;
      }
    }
  }

  return result;
}

/**
 * Print help for credentials command
 */
export function printCredentialsHelp(): void {
  console.log(`
${pc.bold("Usage:")}
  npx create-starknet-agent credentials [options]

${pc.bold("Description:")}
  Securely configure Starknet credentials for your agent platform.
  Credentials are stored according to your platform's conventions.

${pc.bold("Options:")}
  --platform <name>    Target platform (openclaw, claude-code, cursor, generic-mcp)
  --network <name>     Network (mainnet, sepolia)
  --from-env           Import credentials from current environment variables
  --from-ready         Show guide for exporting from Ready wallet
  --from-braavos       Show guide for exporting from Braavos wallet
  --json               Output machine-readable JSON
  --help, -h           Show this help message

${pc.bold("Storage Locations by Platform:")}
  ${pc.cyan("openclaw")}       ~/.openclaw/secrets/starknet/<address>.json
  ${pc.cyan("claude-code")}    .env file (gitignored)
  ${pc.cyan("cursor")}         .env file (gitignored)
  ${pc.cyan("generic-mcp")}    .env file

${pc.bold("Examples:")}
  npx create-starknet-agent credentials
  npx create-starknet-agent credentials --platform claude-code
  npx create-starknet-agent credentials --from-env
  npx create-starknet-agent credentials --from-ready
`);
}

/**
 * Print wallet export guide
 */
function printWalletExportGuide(wallet: "ready" | "braavos"): void {
  console.log();
  console.log(pc.bold(`Exporting credentials from ${wallet === "ready" ? "Ready" : "Braavos"}:`));
  console.log();

  if (wallet === "ready") {
    console.log(`  ${pc.cyan("1.")} Open the Ready wallet browser extension`);
    console.log(`  ${pc.cyan("2.")} Click on Settings (gear icon)`);
    console.log(`  ${pc.cyan("3.")} Select your account`);
    console.log(`  ${pc.cyan("4.")} Click "Export private key"`);
    console.log(`  ${pc.cyan("5.")} Enter your password to reveal the key`);
    console.log(`  ${pc.cyan("6.")} Copy the private key (starts with 0x)`);
    console.log();
    console.log(pc.dim("  Your account address is shown at the top of the extension."));
  } else {
    console.log(`  ${pc.cyan("1.")} Open the Braavos browser extension`);
    console.log(`  ${pc.cyan("2.")} Click on Settings (three dots menu)`);
    console.log(`  ${pc.cyan("3.")} Select "Privacy & Security"`);
    console.log(`  ${pc.cyan("4.")} Click "Export private key"`);
    console.log(`  ${pc.cyan("5.")} Enter your password to reveal the key`);
    console.log(`  ${pc.cyan("6.")} Copy the private key (starts with 0x)`);
    console.log();
    console.log(pc.dim("  Your account address is shown at the top of the wallet."));
  }

  console.log();
  console.log(pc.yellow("⚠️  Never share your private key with anyone!"));
  console.log(pc.yellow("⚠️  Store it securely and never commit it to git."));
  console.log();
}

/**
 * Validate Starknet address format
 * Accepts: 0x followed by 1-64 hex characters
 */
export function isValidAddress(address: string): boolean {
  // Starknet addresses are 0x + up to 64 hex chars (can be shorter if leading zeros omitted)
  return /^0x[a-fA-F0-9]{1,64}$/.test(address);
}

/**
 * Validate private key format
 * Accepts: 0x followed by 1-64 hex characters
 */
export function isValidPrivateKey(key: string): boolean {
  // Private keys are 0x + up to 64 hex chars
  return /^0x[a-fA-F0-9]{1,64}$/.test(key);
}

/**
 * Validate RPC URL format
 */
export function isValidRpcUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate credentials
 */
export function validateCredentials(
  address: string,
  privateKey: string,
  rpcUrl: string
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate address format
  if (!address) {
    errors.push("Account address is required");
  } else if (!isValidAddress(address)) {
    errors.push("Invalid address format (expected 0x + 1-64 hex characters)");
  }

  // Validate private key format
  if (!privateKey) {
    errors.push("Private key is required");
  } else if (!isValidPrivateKey(privateKey)) {
    errors.push("Invalid private key format (expected 0x + 1-64 hex characters)");
  }

  // Validate RPC URL
  if (!rpcUrl) {
    warnings.push("No RPC URL provided, will use default public RPC");
  } else if (!isValidRpcUrl(rpcUrl)) {
    errors.push("Invalid RPC URL format");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Expand home directory shorthand
 */
function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

/**
 * Get credential storage path for a platform
 */
function getCredentialStoragePath(platform: DetectedPlatform, address?: string): string {
  if (platform.type === "openclaw" && address) {
    // OpenClaw uses JSON files per address
    const secretsDir = platform.secretsPath || expandHome("~/.openclaw/secrets/starknet");
    return path.join(secretsDir, `${address}.json`);
  }
  // All other platforms use .env
  return platform.secretsPath || path.join(process.cwd(), ".env");
}

/**
 * Get storage type for a platform
 */
function getStorageType(platform: DetectedPlatform): "json" | "env" {
  return platform.type === "openclaw" ? "json" : "env";
}

/**
 * Ensure directory exists
 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Save credentials for OpenClaw (JSON format)
 */
function saveCredentialsJson(
  filePath: string,
  address: string,
  privateKey: string,
  rpcUrl: string,
  network?: Network
): void {
  ensureDir(path.dirname(filePath));

  const credentials: StarknetCredentials = {
    accountAddress: address,
    privateKey,
    rpcUrl,
    network,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Check if file exists to preserve createdAt
  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      credentials.createdAt = existing.createdAt || credentials.createdAt;
    } catch {
      // Ignore parse errors
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

/**
 * Save credentials as .env file
 */
function saveCredentialsEnv(
  filePath: string,
  address: string,
  privateKey: string,
  rpcUrl: string
): void {
  const envContent: string[] = [];

  // Read existing .env content if it exists
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf-8");
    const lines = existing.split("\n");

    // Filter out existing Starknet vars
    for (const line of lines) {
      if (
        !line.startsWith("STARKNET_PRIVATE_KEY=") &&
        !line.startsWith("STARKNET_ACCOUNT_ADDRESS=") &&
        !line.startsWith("STARKNET_RPC_URL=")
      ) {
        envContent.push(line);
      }
    }

    // Remove trailing empty lines
    while (envContent.length > 0 && envContent[envContent.length - 1].trim() === "") {
      envContent.pop();
    }

    // Add blank line separator if there's existing content
    if (envContent.length > 0 && envContent[envContent.length - 1] !== "") {
      envContent.push("");
    }
  }

  // Add Starknet credentials
  envContent.push("# Starknet credentials");
  envContent.push(`STARKNET_ACCOUNT_ADDRESS=${address}`);
  envContent.push(`STARKNET_PRIVATE_KEY=${privateKey}`);
  envContent.push(`STARKNET_RPC_URL=${rpcUrl}`);
  envContent.push("");

  fs.writeFileSync(filePath, envContent.join("\n"), { mode: 0o600 });

  // Ensure .env is gitignored
  ensureGitignore(path.dirname(filePath));
}

/**
 * Ensure .gitignore includes .env
 */
function ensureGitignore(dir: string): void {
  const gitignorePath = path.join(dir, ".gitignore");

  let content = "";
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, "utf-8");
  }

  // Check if .env is already ignored
  const lines = content.split("\n");
  const hasEnv = lines.some(
    (line) => line.trim() === ".env" || line.trim() === ".env*" || line.trim() === "*.env"
  );

  if (!hasEnv) {
    // Add .env to gitignore
    const newContent = content.trimEnd() + "\n\n# Environment variables (contains secrets)\n.env\n";
    fs.writeFileSync(gitignorePath, newContent);
  }
}

/**
 * Load credentials from environment variables
 */
function loadFromEnv(): { address?: string; privateKey?: string; rpcUrl?: string } {
  return {
    address: process.env.STARKNET_ACCOUNT_ADDRESS,
    privateKey: process.env.STARKNET_PRIVATE_KEY,
    rpcUrl: process.env.STARKNET_RPC_URL,
  };
}

/**
 * Output JSON result for credentials command
 */
function outputJsonResult(result: JsonCredentialsResult): never {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.exitCode);
}

/**
 * Main credentials setup flow
 */
export async function runCredentialsSetup(args: CredentialsArgs): Promise<void> {
  // Show help if requested
  if (args.showHelp) {
    printCredentialsHelp();
    process.exit(EXIT_CODES.SUCCESS);
  }

  // Show wallet export guide if requested
  if (args.fromReady) {
    printWalletExportGuide("ready");
    process.exit(EXIT_CODES.SUCCESS);
  }

  if (args.fromBraavos) {
    printWalletExportGuide("braavos");
    process.exit(EXIT_CODES.SUCCESS);
  }

  // Detect or get specified platform
  const platforms = detectPlatforms();
  const platform = args.platform
    ? getPlatformByType(args.platform) || platforms[0]
    : platforms.find((p) => p.type !== "standalone") || platforms[0];

  if (!args.jsonOutput) {
    console.log();
    console.log(pc.bold(pc.cyan("  Starknet Credential Setup")));
    console.log(pc.dim(`  Platform: ${platform.name}`));
    console.log();
  }

  // Initialize credentials from environment if --from-env
  let initialAddress: string | undefined;
  let initialPrivateKey: string | undefined;
  let initialRpcUrl: string | undefined;

  if (args.fromEnv) {
    const envCreds = loadFromEnv();
    initialAddress = envCreds.address;
    initialPrivateKey = envCreds.privateKey;
    initialRpcUrl = envCreds.rpcUrl;

    if (!args.jsonOutput) {
      if (envCreds.address || envCreds.privateKey || envCreds.rpcUrl) {
        console.log(pc.green("✓ Loaded credentials from environment"));
        if (envCreds.address) console.log(pc.dim(`  Address: ${envCreds.address.slice(0, 10)}...`));
        if (envCreds.privateKey) console.log(pc.dim("  Private key: ****"));
        if (envCreds.rpcUrl) console.log(pc.dim(`  RPC URL: ${envCreds.rpcUrl}`));
        console.log();
      } else {
        console.log(pc.yellow("No credentials found in environment variables."));
        console.log();
      }
    }
  }

  // Cancel handler
  const onCancel = () => {
    console.log(pc.red("\nOperation cancelled."));
    process.exit(0);
  };

  // Show link to docs for setting up an account
  if (!args.jsonOutput) {
    console.log(pc.dim("  Don't have a Starknet account? Follow the guide:"));
    console.log(pc.cyan("  https://www.starknet-agentic.com/docs/getting-started/quick-start#getting-your-credentials"));
    console.log();
  }

  // Prompt for RPC URL first
  const rpcResponse = await prompts(
    {
      type: "text",
      name: "rpcUrl",
      message: "Starknet RPC URL:",
      initial: initialRpcUrl || RPC_URLS.sepolia,
      validate: (value: string) =>
        isValidRpcUrl(value) || "Invalid URL format (must be http:// or https://)",
    },
    { onCancel }
  );

  // Prompt for account address
  const addressResponse = await prompts(
    {
      type: "text",
      name: "address",
      message: "Starknet account address:",
      initial: initialAddress,
      validate: (value: string) =>
        isValidAddress(value) || "Invalid address format (expected 0x + 1-64 hex characters)",
    },
    { onCancel }
  );

  // Prompt for private key (password type - hidden input)
  const keyResponse = await prompts(
    {
      type: "password",
      name: "privateKey",
      message: "Private key:",
      validate: (value: string) =>
        isValidPrivateKey(value) || "Invalid key format (expected 0x + 1-64 hex characters)",
    },
    { onCancel }
  );

  const address = addressResponse.address;
  const privateKey = keyResponse.privateKey;
  const rpcUrl = rpcResponse.rpcUrl;

  // Validate credentials
  if (!args.jsonOutput) {
    console.log();
    console.log(pc.cyan("Validating credentials..."));
  }

  const validation = validateCredentials(address, privateKey, rpcUrl);

  if (!args.jsonOutput) {
    if (validation.valid) {
      console.log(pc.green("✓ Address format valid"));
      console.log(pc.green("✓ Private key format valid"));
      if (rpcUrl) {
        console.log(pc.green("✓ RPC URL format valid"));
      }
    } else {
      for (const error of validation.errors) {
        console.log(pc.red(`✗ ${error}`));
      }
    }

    for (const warning of validation.warnings) {
      console.log(pc.yellow(`○ ${warning}`));
    }
  }

  if (!validation.valid) {
    if (args.jsonOutput) {
      outputJsonResult({
        success: false,
        platform: platform.type,
        storagePath: getCredentialStoragePath(platform, address),
        storageType: getStorageType(platform),
        validation,
        error: validation.errors.join("; "),
        exitCode: EXIT_CODES.CONFIG_ERROR,
      });
    }
    console.log();
    console.log(pc.red("Credential validation failed. Please check the errors above."));
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }

  // Detect network from RPC URL
  let detectedNetwork: Network | undefined = args.network;
  if (!detectedNetwork && rpcUrl) {
    if (rpcUrl.includes("sepolia")) {
      detectedNetwork = "sepolia";
    } else if (rpcUrl.includes("mainnet") || rpcUrl.includes("blast") && !rpcUrl.includes("sepolia")) {
      detectedNetwork = "mainnet";
    }
  }

  // Save credentials
  const storagePath = getCredentialStoragePath(platform, address);
  const storageType = getStorageType(platform);

  if (!args.jsonOutput) {
    console.log();
    console.log(pc.cyan("Saving credentials..."));
  }

  try {
    if (storageType === "json") {
      saveCredentialsJson(storagePath, address, privateKey, rpcUrl, detectedNetwork);
    } else {
      saveCredentialsEnv(storagePath, address, privateKey, rpcUrl);
    }

    if (!args.jsonOutput) {
      console.log(pc.green(`✓ Credentials saved to ${storagePath}`));
      console.log();
      console.log(pc.green(pc.bold("Your agent can now execute Starknet transactions.")));
      console.log();

      if (detectedNetwork) {
        console.log(pc.dim(`Network: ${detectedNetwork}`));
      }

      // Platform-specific next steps
      if (platform.type === "openclaw") {
        console.log();
        console.log(pc.dim("Credentials stored securely in OpenClaw secrets directory."));
        console.log(pc.dim("The MCP server will automatically load them."));
      } else {
        console.log();
        console.log(pc.dim("Credentials stored in .env file (gitignored)."));
        console.log(pc.dim("Restart your agent to load the new credentials."));
      }
      console.log();
    }

    if (args.jsonOutput) {
      outputJsonResult({
        success: true,
        platform: platform.type,
        storagePath,
        storageType,
        validation,
        exitCode: EXIT_CODES.SUCCESS,
      });
    }

    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (args.jsonOutput) {
      outputJsonResult({
        success: false,
        platform: platform.type,
        storagePath,
        storageType,
        validation,
        error: errorMessage,
        exitCode: EXIT_CODES.CONFIG_ERROR,
      });
    }

    console.log(pc.red(`\nFailed to save credentials: ${errorMessage}`));
    process.exit(EXIT_CODES.CONFIG_ERROR);
  }
}
