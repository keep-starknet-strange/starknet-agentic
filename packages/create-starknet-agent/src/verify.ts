/**
 * Verification module for create-starknet-agent
 *
 * Provides comprehensive health checks for Starknet agent setup.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import pc from "picocolors";
import type { DetectedPlatform, Network } from "./types.js";
import { detectPlatforms, getPlatformByType, isValidPlatformType } from "./platform.js";
import { EXIT_CODES } from "./index.js";
import { AVAILABLE_SKILLS } from "./wizards.js";

/**
 * Verification check result
 */
interface CheckResult {
  passed: boolean;
  message: string;
  details?: string;
}

/**
 * MCP server check result
 */
interface McpCheckResult {
  configExists: boolean;
  configPath?: string;
  serverConfigured: boolean;
  serverCommand?: string;
  serverVersion?: string;
  serverResponds: boolean;
  responseTime?: number;
}

/**
 * Credentials check result
 */
interface CredentialsCheckResult {
  privateKeyPresent: boolean;
  accountAddressPresent: boolean;
  rpcUrlPresent: boolean;
  accountAddressValue?: string; // Truncated for display
  rpcUrlValue?: string;
  network?: Network;
}

/**
 * Skills check result
 */
interface SkillsCheckResult {
  skillsPath?: string;
  installed: Array<{ id: string; name: string; version?: string }>;
  missing: string[];
}

/**
 * End-to-end check result
 */
interface E2ECheckResult {
  attempted: boolean;
  success: boolean;
  balances?: Record<string, string>;
  error?: string;
  responseTime?: number;
}

/**
 * Complete verification result
 */
interface VerificationResult {
  success: boolean;
  platform: string;
  platformName: string;
  mcp: McpCheckResult;
  credentials: CredentialsCheckResult;
  skills: SkillsCheckResult;
  e2e: E2ECheckResult;
  errors: string[];
  warnings: string[];
  exitCode: number;
}

/**
 * Parsed verify command arguments
 */
export interface VerifyArgs {
  platform?: string;
  jsonOutput: boolean;
  skipE2E: boolean;
  verbose: boolean;
  showHelp: boolean;
}

/**
 * Parse verify subcommand arguments
 */
export function parseVerifyArgs(args: string[]): VerifyArgs {
  const result: VerifyArgs = {
    platform: undefined,
    jsonOutput: false,
    skipE2E: false,
    verbose: false,
    showHelp: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
    } else if (arg === "--json") {
      result.jsonOutput = true;
    } else if (arg === "--skip-e2e") {
      result.skipE2E = true;
    } else if (arg === "--verbose" || arg === "-v") {
      result.verbose = true;
    } else if (arg === "--platform" && args[i + 1]) {
      const platform = args[++i];
      if (isValidPlatformType(platform)) {
        result.platform = platform;
      }
    }
  }

  return result;
}

/**
 * Print help for verify command
 */
export function printVerifyHelp(): void {
  console.log(`
${pc.bold("Usage:")}
  npx create-starknet-agent verify [options]

${pc.bold("Description:")}
  Verify that your Starknet agent setup is working correctly.
  Checks MCP server configuration, credentials, installed skills,
  and optionally performs an end-to-end balance query.

${pc.bold("Options:")}
  --platform <name>    Target platform (openclaw, claude-code, cursor, etc.)
  --skip-e2e           Skip end-to-end balance test (faster, doesn't need RPC)
  --verbose, -v        Show detailed output including config contents
  --json               Output machine-readable JSON
  --help, -h           Show this help message

${pc.bold("Exit Codes:")}
  0  All checks passed - setup is fully operational
  1  Configuration error - MCP not configured correctly
  2  Missing credentials - setup incomplete

${pc.bold("Examples:")}
  npx create-starknet-agent verify
  npx create-starknet-agent verify --verbose
  npx create-starknet-agent verify --skip-e2e
  npx create-starknet-agent verify --platform claude-code
  npx create-starknet-agent verify --json
`);
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
 * Check MCP server configuration
 */
async function checkMcpServer(
  platform: DetectedPlatform,
  verbose: boolean
): Promise<McpCheckResult> {
  const result: McpCheckResult = {
    configExists: false,
    serverConfigured: false,
    serverResponds: false,
  };

  // Check if config file exists
  const configPath = expandHome(platform.configPath);
  if (fs.existsSync(configPath)) {
    result.configExists = true;
    result.configPath = configPath;

    // Read and parse config
    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = JSON.parse(content);

      // Check for starknet MCP server configuration
      if (config.mcpServers?.starknet) {
        result.serverConfigured = true;
        const serverConfig = config.mcpServers.starknet;

        // Extract command info
        if (serverConfig.command) {
          result.serverCommand = `${serverConfig.command} ${(serverConfig.args || []).join(" ")}`;
        }

        // Try to extract version from args
        const args = serverConfig.args || [];
        const versionArg = args.find((a: string) => a.includes("@starknet-agentic/mcp-server"));
        if (versionArg) {
          const versionMatch = versionArg.match(/@([\d.]+|latest)$/);
          if (versionMatch) {
            result.serverVersion = versionMatch[1];
          }
        }
      }
    } catch {
      // Config exists but couldn't be parsed
    }
  }

  // Try to ping MCP server if configured
  if (result.serverConfigured) {
    try {
      const pingResult = await pingMcpServer(verbose);
      result.serverResponds = pingResult.success;
      result.responseTime = pingResult.responseTime;
    } catch {
      result.serverResponds = false;
    }
  }

  return result;
}

/**
 * Attempt to ping the MCP server
 * Uses a lightweight initialization check
 */
async function pingMcpServer(
  verbose: boolean
): Promise<{ success: boolean; responseTime?: number }> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = 10000; // 10 second timeout

    // Try to spawn the MCP server with a simple ping
    const child = spawn("npx", ["-y", "@starknet-agentic/mcp-server@latest", "--help"], {
      stdio: verbose ? "inherit" : "pipe",
      env: {
        ...process.env,
        // Minimal env for ping
        STARKNET_RPC_URL: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
      },
    });

    const timeoutId = setTimeout(() => {
      child.kill();
      resolve({ success: false });
    }, timeout);

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      // npx --help typically exits with 0
      // The server existing and responding to --help is a good sign
      resolve({
        success: code === 0 || code === null,
        responseTime,
      });
    });

    child.on("error", () => {
      clearTimeout(timeoutId);
      resolve({ success: false });
    });
  });
}

/**
 * Check credentials configuration
 */
function checkCredentials(
  platform: DetectedPlatform
): CredentialsCheckResult {
  const result: CredentialsCheckResult = {
    privateKeyPresent: false,
    accountAddressPresent: false,
    rpcUrlPresent: false,
  };

  // Check environment variables first
  if (process.env.STARKNET_PRIVATE_KEY) {
    result.privateKeyPresent = true;
  }

  if (process.env.STARKNET_ACCOUNT_ADDRESS) {
    result.accountAddressPresent = true;
    result.accountAddressValue = truncateAddress(process.env.STARKNET_ACCOUNT_ADDRESS);
  }

  if (process.env.STARKNET_RPC_URL) {
    result.rpcUrlPresent = true;
    result.rpcUrlValue = process.env.STARKNET_RPC_URL;
    result.network = detectNetworkFromRpcUrl(process.env.STARKNET_RPC_URL);
  }

  // If not found in env, check .env file
  if (!result.privateKeyPresent || !result.accountAddressPresent) {
    const envPath = platform.secretsPath || path.join(process.cwd(), ".env");
    const expandedEnvPath = expandHome(envPath);

    if (fs.existsSync(expandedEnvPath)) {
      try {
        const envContent = fs.readFileSync(expandedEnvPath, "utf-8");

        // Check for private key (with actual value, not placeholder)
        if (
          !result.privateKeyPresent &&
          envContent.includes("STARKNET_PRIVATE_KEY=") &&
          !envContent.includes("STARKNET_PRIVATE_KEY=\n") &&
          !envContent.includes("STARKNET_PRIVATE_KEY=0x...")
        ) {
          const match = envContent.match(/STARKNET_PRIVATE_KEY=(0x[a-fA-F0-9]+)/);
          if (match) {
            result.privateKeyPresent = true;
          }
        }

        // Check for account address
        if (
          !result.accountAddressPresent &&
          envContent.includes("STARKNET_ACCOUNT_ADDRESS=")
        ) {
          const match = envContent.match(/STARKNET_ACCOUNT_ADDRESS=(0x[a-fA-F0-9]+)/);
          if (match) {
            result.accountAddressPresent = true;
            result.accountAddressValue = truncateAddress(match[1]);
          }
        }

        // Check for RPC URL
        if (!result.rpcUrlPresent && envContent.includes("STARKNET_RPC_URL=")) {
          const match = envContent.match(/STARKNET_RPC_URL=(https?:\/\/[^\s\n]+)/);
          if (match) {
            result.rpcUrlPresent = true;
            result.rpcUrlValue = match[1];
            result.network = detectNetworkFromRpcUrl(match[1]);
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    // Also check OpenClaw-specific secrets directory
    if (platform.type === "openclaw" && platform.secretsPath) {
      const secretsDir = expandHome(platform.secretsPath);
      if (fs.existsSync(secretsDir)) {
        try {
          const files = fs.readdirSync(secretsDir);
          const jsonFiles = files.filter((f) => f.endsWith(".json"));

          for (const file of jsonFiles) {
            const filePath = path.join(secretsDir, file);
            try {
              const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
              if (content.privateKey && !result.privateKeyPresent) {
                result.privateKeyPresent = true;
              }
              if (content.accountAddress && !result.accountAddressPresent) {
                result.accountAddressPresent = true;
                result.accountAddressValue = truncateAddress(content.accountAddress);
              }
              if (content.rpcUrl && !result.rpcUrlPresent) {
                result.rpcUrlPresent = true;
                result.rpcUrlValue = content.rpcUrl;
                result.network = detectNetworkFromRpcUrl(content.rpcUrl);
              }
            } catch {
              // Skip files that can't be parsed
            }
          }
        } catch {
          // Ignore directory read errors
        }
      }
    }
  }

  return result;
}

/**
 * Truncate address for display
 */
function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

/**
 * Detect network from RPC URL
 */
function detectNetworkFromRpcUrl(url: string): Network | undefined {
  if (url.includes("sepolia")) return "sepolia";
  if (url.includes("mainnet")) return "mainnet";
  return undefined;
}

/**
 * Check installed skills
 */
function checkSkills(platform: DetectedPlatform): SkillsCheckResult {
  const result: SkillsCheckResult = {
    installed: [],
    missing: [],
  };

  // Get skills path
  const skillsPath = platform.skillsPath ? expandHome(platform.skillsPath) : undefined;

  if (!skillsPath) {
    // Platform doesn't have a skills path
    return result;
  }

  result.skillsPath = skillsPath;

  if (!fs.existsSync(skillsPath)) {
    // Skills directory doesn't exist - all skills are missing
    result.missing = AVAILABLE_SKILLS.filter((s) => s.recommended).map((s) => s.id);
    return result;
  }

  // Check each available skill
  for (const skill of AVAILABLE_SKILLS) {
    const skillDir = path.join(skillsPath, skill.id);
    const skillMdPath = path.join(skillDir, "SKILL.md");

    if (fs.existsSync(skillDir) && fs.existsSync(skillMdPath)) {
      // Skill is installed - try to read version from SKILL.md
      let version: string | undefined;
      try {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        const versionMatch = content.match(/version:\s*["']?([^"'\n]+)["']?/i);
        if (versionMatch) {
          version = versionMatch[1].trim();
        }
      } catch {
        // Ignore read errors
      }

      result.installed.push({
        id: skill.id,
        name: skill.name,
        version,
      });
    } else if (skill.recommended) {
      // Recommended skill is missing
      result.missing.push(skill.id);
    }
  }

  return result;
}

/**
 * Perform end-to-end balance check
 */
async function checkE2E(
  credentials: CredentialsCheckResult,
  verbose: boolean
): Promise<E2ECheckResult> {
  const result: E2ECheckResult = {
    attempted: false,
    success: false,
  };

  // Can't do E2E check without credentials
  if (!credentials.accountAddressPresent || !credentials.privateKeyPresent) {
    result.error = "Missing credentials for E2E test";
    return result;
  }

  result.attempted = true;
  const startTime = Date.now();

  try {
    // Get full address from env
    const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS;
    const rpcUrl = process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7";

    if (!accountAddress) {
      result.error = "Account address not available in environment";
      return result;
    }

    // Make a direct RPC call to get balance
    const balanceResult = await fetchBalance(accountAddress, rpcUrl, verbose);

    if (balanceResult.success) {
      result.success = true;
      result.balances = balanceResult.balances;
      result.responseTime = Date.now() - startTime;
    } else {
      result.error = balanceResult.error;
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Unknown error";
  }

  return result;
}

/**
 * Fetch balance via direct RPC call
 */
async function fetchBalance(
  accountAddress: string,
  rpcUrl: string,
  verbose: boolean
): Promise<{ success: boolean; balances?: Record<string, string>; error?: string }> {
  // Token addresses (same on all networks)
  const ETH_ADDRESS = "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";
  const STRK_ADDRESS = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

  // Normalize address (ensure it's properly padded)
  const normalizedAddress = normalizeAddress(accountAddress);

  try {
    // Fetch ETH balance
    const ethBalance = await callBalanceOf(rpcUrl, ETH_ADDRESS, normalizedAddress, verbose);
    const strkBalance = await callBalanceOf(rpcUrl, STRK_ADDRESS, normalizedAddress, verbose);

    return {
      success: true,
      balances: {
        ETH: formatBalance(ethBalance, 18),
        STRK: formatBalance(strkBalance, 18),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "RPC call failed",
    };
  }
}

/**
 * Call balanceOf via RPC
 */
async function callBalanceOf(
  rpcUrl: string,
  tokenAddress: string,
  accountAddress: string,
  verbose: boolean
): Promise<string> {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "starknet_call",
    params: {
      request: {
        contract_address: tokenAddress,
        entry_point_selector: "0x2e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e", // balanceOf selector
        calldata: [accountAddress],
      },
      block_id: "latest",
    },
  };

  if (verbose) {
    console.log(pc.dim(`  RPC call to ${rpcUrl}`));
  }

  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = await response.json() as { result?: string[]; error?: { message: string } };

  if (data.error) {
    throw new Error(data.error.message);
  }

  // balanceOf returns [low, high] for uint256
  if (data.result && data.result.length >= 1) {
    return data.result[0];
  }

  return "0x0";
}

/**
 * Normalize Starknet address to proper format
 */
function normalizeAddress(address: string): string {
  // Remove 0x prefix and pad to 64 characters
  const hex = address.toLowerCase().replace(/^0x/, "");
  return "0x" + hex.padStart(64, "0");
}

/**
 * Format balance from hex to human readable
 */
function formatBalance(hexValue: string, decimals: number): string {
  try {
    const value = BigInt(hexValue);
    const divisor = BigInt(10 ** decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;

    // Format fractional part with proper padding
    const fractionalStr = fractionalPart.toString().padStart(decimals, "0").slice(0, 4);

    return `${integerPart}.${fractionalStr}`;
  } catch {
    return "0.0000";
  }
}

/**
 * Main verification function
 */
export async function runVerification(args: VerifyArgs): Promise<void> {
  // Show help if requested
  if (args.showHelp) {
    printVerifyHelp();
    process.exit(EXIT_CODES.SUCCESS);
  }

  // Detect platform
  const platforms = detectPlatforms();
  const platform = args.platform
    ? getPlatformByType(args.platform as Parameters<typeof getPlatformByType>[0]) || platforms[0]
    : platforms.find((p) => p.type !== "standalone") || platforms[0];

  const errors: string[] = [];
  const warnings: string[] = [];

  if (!args.jsonOutput) {
    console.log();
    console.log(pc.bold("Starknet Agent Setup Verification"));
    console.log(pc.dim("══════════════════════════════════"));
    console.log();
    console.log(`${pc.cyan("Platform:")} ${platform.name}${platform.type !== "standalone" ? ` (${platform.type})` : ""}`);
    console.log();
  }

  // Check MCP server
  if (!args.jsonOutput) {
    console.log(pc.bold("MCP Server"));
  }

  const mcpResult = await checkMcpServer(platform, args.verbose);

  // Collect errors and warnings for MCP (regardless of output mode)
  if (!mcpResult.configExists) {
    errors.push(`MCP config not found at ${platform.configPath}`);
  } else if (!mcpResult.serverConfigured) {
    errors.push("Starknet MCP server not configured");
  } else if (!mcpResult.serverResponds) {
    warnings.push("Could not verify MCP server is responding");
  }

  if (!args.jsonOutput) {
    if (mcpResult.configExists) {
      console.log(`  ${pc.green("✓")} Config exists: ${mcpResult.configPath}`);
    } else {
      console.log(`  ${pc.red("✗")} Config not found: ${expandHome(platform.configPath)}`);
    }

    if (mcpResult.serverConfigured) {
      console.log(`  ${pc.green("✓")} Server binary: @starknet-agentic/mcp-server${mcpResult.serverVersion ? `@${mcpResult.serverVersion}` : ""}`);
    } else if (mcpResult.configExists) {
      console.log(`  ${pc.red("✗")} Starknet server not configured in MCP config`);
    }

    if (mcpResult.serverConfigured) {
      if (mcpResult.serverResponds) {
        console.log(`  ${pc.green("✓")} Server responds to ping${mcpResult.responseTime ? ` (${mcpResult.responseTime}ms)` : ""}`);
      } else {
        console.log(`  ${pc.yellow("○")} Server ping skipped or timed out`);
      }
    }
    console.log();
  }

  // Check credentials
  if (!args.jsonOutput) {
    console.log(pc.bold("Credentials"));
  }

  const credentialsResult = checkCredentials(platform);

  // Collect errors and warnings for credentials (regardless of output mode)
  if (!credentialsResult.accountAddressPresent) {
    errors.push("STARKNET_ACCOUNT_ADDRESS not set");
  }
  if (!credentialsResult.privateKeyPresent) {
    errors.push("STARKNET_PRIVATE_KEY not set");
  }
  if (!credentialsResult.rpcUrlPresent) {
    warnings.push("STARKNET_RPC_URL not set, using default public RPC");
  }

  if (!args.jsonOutput) {
    if (credentialsResult.accountAddressPresent) {
      console.log(`  ${pc.green("✓")} Account address configured: ${credentialsResult.accountAddressValue}`);
    } else {
      console.log(`  ${pc.red("✗")} Account address not configured`);
    }

    if (credentialsResult.privateKeyPresent) {
      console.log(`  ${pc.green("✓")} Private key present ${pc.dim("(not validated)")}`);
    } else {
      console.log(`  ${pc.red("✗")} Private key not configured`);
    }

    if (credentialsResult.rpcUrlPresent) {
      console.log(`  ${pc.green("✓")} RPC URL: ${credentialsResult.rpcUrlValue}`);
    } else {
      console.log(`  ${pc.yellow("○")} RPC URL not set ${pc.dim("(will use default public RPC)")}`);
    }

    if (credentialsResult.network) {
      console.log(`  ${pc.dim(`  Network: ${credentialsResult.network}`)}`);
    }
    console.log();
  }

  // Check skills
  if (!args.jsonOutput) {
    console.log(pc.bold("Skills"));
  }

  const skillsResult = checkSkills(platform);

  // Collect warnings for skills (regardless of output mode)
  if (skillsResult.skillsPath && skillsResult.installed.length === 0) {
    warnings.push("No skills installed");
  }

  if (!args.jsonOutput) {
    if (skillsResult.skillsPath) {
      if (skillsResult.installed.length > 0) {
        for (const skill of skillsResult.installed) {
          console.log(`  ${pc.green("✓")} ${skill.name}${skill.version ? ` (v${skill.version})` : ""}`);
        }
      } else {
        console.log(`  ${pc.yellow("○")} No skills installed at ${skillsResult.skillsPath}`);
      }

      if (skillsResult.missing.length > 0) {
        for (const missing of skillsResult.missing) {
          console.log(`  ${pc.yellow("○")} ${missing} ${pc.dim("(recommended, not installed)")}`);
        }
      }
    } else {
      console.log(`  ${pc.dim("-")} Skills not applicable for this platform`);
    }
    console.log();
  }

  // End-to-end test
  let e2eResult: E2ECheckResult = { attempted: false, success: false };

  if (!args.skipE2E) {
    if (!args.jsonOutput) {
      console.log(pc.bold("End-to-End Test"));
    }

    e2eResult = await checkE2E(credentialsResult, args.verbose);

    // Collect errors for E2E (regardless of output mode)
    if (e2eResult.attempted && !e2eResult.success) {
      errors.push(`E2E test failed: ${e2eResult.error}`);
    }

    if (!args.jsonOutput) {
      if (e2eResult.attempted) {
        if (e2eResult.success) {
          console.log(`  ${pc.green("✓")} Balance query successful${e2eResult.responseTime ? ` (${e2eResult.responseTime}ms)` : ""}`);
          if (e2eResult.balances) {
            for (const [token, balance] of Object.entries(e2eResult.balances)) {
              console.log(`    ${pc.dim(`${token}:`)} ${balance}`);
            }
          }
        } else {
          console.log(`  ${pc.red("✗")} Balance query failed: ${e2eResult.error}`);
        }
      } else {
        console.log(`  ${pc.yellow("○")} Skipped: ${e2eResult.error || "Missing credentials"}`);
      }
      console.log();
    }
  }

  // Determine overall success
  const success = errors.length === 0;
  const exitCode = !mcpResult.configExists
    ? EXIT_CODES.CONFIG_ERROR
    : !credentialsResult.privateKeyPresent || !credentialsResult.accountAddressPresent
      ? EXIT_CODES.MISSING_CREDENTIALS
      : EXIT_CODES.SUCCESS;

  // Build verification result
  const verificationResult: VerificationResult = {
    success,
    platform: platform.type,
    platformName: platform.name,
    mcp: mcpResult,
    credentials: credentialsResult,
    skills: skillsResult,
    e2e: e2eResult,
    errors,
    warnings,
    exitCode,
  };

  // Output JSON if requested
  if (args.jsonOutput) {
    console.log(JSON.stringify(verificationResult, null, 2));
    process.exit(exitCode);
  }

  // Print final status
  if (success) {
    console.log(pc.green(pc.bold("Status: READY ✓")));
    console.log();
    console.log(pc.dim("Your agent can now use Starknet. Try asking:"));
    console.log(pc.cyan('  "What\'s my ETH balance on Starknet?"'));
    console.log(pc.cyan('  "Swap 0.01 ETH for STRK"'));
  } else {
    console.log(pc.red(pc.bold("Status: INCOMPLETE ✗")));
    console.log();

    if (errors.length > 0) {
      console.log(pc.red("Errors:"));
      for (const error of errors) {
        console.log(`  ${pc.red("•")} ${error}`);
      }
      console.log();
    }

    if (warnings.length > 0) {
      console.log(pc.yellow("Warnings:"));
      for (const warning of warnings) {
        console.log(`  ${pc.yellow("•")} ${warning}`);
      }
      console.log();
    }

    // Suggest fixes
    if (!mcpResult.configExists || !mcpResult.serverConfigured) {
      console.log(pc.bold("To configure MCP server:"));
      console.log(pc.cyan("  npx create-starknet-agent"));
      console.log();
    }

    if (!credentialsResult.privateKeyPresent || !credentialsResult.accountAddressPresent) {
      console.log(pc.bold("To add credentials:"));
      console.log(pc.cyan("  npx create-starknet-agent credentials"));
      console.log();
    }
  }

  process.exit(exitCode);
}
