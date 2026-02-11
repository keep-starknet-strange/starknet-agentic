/**
 * Platform-specific wizards for create-starknet-agent
 *
 * Each wizard provides a tailored setup flow for its platform,
 * generating appropriate configuration files and installation commands.
 */

import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import pc from "picocolors";
import type {
  DetectedPlatform,
  Network,
  GeneratedFiles,
} from "./types.js";
import { RPC_URLS } from "./types.js";

/**
 * Config scope - where to write MCP config
 */
export type ConfigScope = "local" | "global";

/**
 * Available skills that can be installed
 */
export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
  rawUrl: string;
}

const GITHUB_API_BASE = "https://api.github.com/repos/keep-starknet-strange/starknet-agentic/contents/skills";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills";

export const AVAILABLE_SKILLS: SkillInfo[] = [
  {
    id: "starknet-wallet",
    name: "starknet-wallet",
    description: "transfers, balances, account management",
    recommended: true,
    rawUrl: `${GITHUB_RAW_BASE}/starknet-wallet/SKILL.md`,
  },
  {
    id: "starknet-defi",
    name: "starknet-defi",
    description: "swaps, quotes via AVNU",
    recommended: true,
    rawUrl: `${GITHUB_RAW_BASE}/starknet-defi/SKILL.md`,
  },
  {
    id: "starknet-identity",
    name: "starknet-identity",
    description: "ERC-8004 reputation",
    recommended: false,
    rawUrl: `${GITHUB_RAW_BASE}/starknet-identity/SKILL.md`,
  },
  {
    id: "starknet-anonymous-wallet",
    name: "starknet-anonymous-wallet",
    description: "privacy features",
    recommended: false,
    rawUrl: `${GITHUB_RAW_BASE}/starknet-anonymous-wallet/SKILL.md`,
  },
];

/**
 * Setup modes for non-standalone platforms
 */
export type SetupMode = "full" | "mcp-only" | "skills-only";

/**
 * Wizard configuration result
 */
export interface WizardResult {
  success: boolean;
  platform: DetectedPlatform;
  network: Network;
  setupMode: SetupMode;
  selectedSkills: string[];
  files: GeneratedFiles;
  nextSteps: string[];
  verificationCommand?: string;
}

/**
 * Cancel handler for prompts
 */
function createCancelHandler(): () => void {
  return () => {
    console.log(pc.red("\nOperation cancelled."));
    process.exit(0);
  };
}

/**
 * Prompt for setup mode
 */
async function promptSetupMode(platform: DetectedPlatform): Promise<SetupMode> {
  const response = await prompts(
    {
      type: "select",
      name: "mode",
      message: "What would you like to set up?",
      choices: [
        {
          title: pc.green("Full Starknet integration") + pc.dim(" (MCP + skills) [recommended]"),
          value: "full",
        },
        {
          title: "MCP server only" + pc.dim(" (I'll manage skills manually)"),
          value: "mcp-only",
        },
        {
          title: "Just install skills" + pc.dim(" (MCP already configured)"),
          value: "skills-only",
        },
      ],
      initial: 0,
    },
    { onCancel: createCancelHandler() }
  );
  return response.mode as SetupMode;
}

/**
 * Prompt for skills selection
 */
async function promptSkills(preselect: boolean = true): Promise<string[]> {
  const response = await prompts(
    {
      type: "multiselect",
      name: "skills",
      message: "Select skills to install:",
      choices: AVAILABLE_SKILLS.map((skill) => ({
        title: pc.cyan(skill.name) + pc.dim(` (${skill.description})`),
        value: skill.id,
        selected: preselect && skill.recommended,
      })),
      hint: "- Space to select, Enter to confirm",
    },
    { onCancel: createCancelHandler() }
  );
  return response.skills as string[];
}

/**
 * Prompt for network selection
 */
async function promptNetwork(): Promise<Network> {
  const response = await prompts(
    {
      type: "select",
      name: "network",
      message: "Select network:",
      choices: [
        {
          title: pc.cyan("sepolia") + pc.dim(" (testnet) [recommended for testing]"),
          value: "sepolia",
        },
        {
          title: pc.green("mainnet") + pc.dim(" (production network)"),
          value: "mainnet",
        },
      ],
      initial: 0,
    },
    { onCancel: createCancelHandler() }
  );
  return response.network as Network;
}

/**
 * Prompt for config scope (local vs global)
 */
async function promptConfigScope(platformName: string): Promise<ConfigScope> {
  const response = await prompts(
    {
      type: "select",
      name: "scope",
      message: "Where should the MCP config be saved?",
      choices: [
        {
          title: pc.green("Project local") + pc.dim(` (.claude/settings.local.json) [recommended]`),
          value: "local",
        },
        {
          title: "User global" + pc.dim(` (~/.claude/settings.json - shared across projects)`),
          value: "global",
        },
      ],
      initial: 0,
    },
    { onCancel: createCancelHandler() }
  );
  return response.scope as ConfigScope;
}

/**
 * Generate MCP server configuration JSON
 */
function generateMcpConfig(network: Network, secretsEnvPath?: string): string {
  const rpcUrl = RPC_URLS[network as "mainnet" | "sepolia"];

  const config = {
    mcpServers: {
      starknet: {
        command: "npx",
        args: ["-y", "@starknet-agentic/mcp-server@latest"],
        env: {
          STARKNET_RPC_URL: rpcUrl,
          STARKNET_PRIVATE_KEY: "${STARKNET_PRIVATE_KEY}",
          STARKNET_ACCOUNT_ADDRESS: "${STARKNET_ACCOUNT_ADDRESS}",
          ...(secretsEnvPath ? { DOTENV_CONFIG_PATH: secretsEnvPath } : {}),
        },
      },
    },
  };

  return JSON.stringify(config, null, 2);
}

/**
 * Generate environment template file
 */
function generateEnvTemplate(network: Network): string {
  const rpcUrl = RPC_URLS[network as "mainnet" | "sepolia"];

  return `# Starknet Agent Configuration
# Generated by create-starknet-agent

# Your Starknet account private key (REQUIRED)
# Export from Ready or Braavos wallet
STARKNET_PRIVATE_KEY=

# Your Starknet account address (REQUIRED)
# Format: 0x followed by 1-64 hex characters
STARKNET_ACCOUNT_ADDRESS=

# Starknet RPC URL (optional, defaults to public RPC)
STARKNET_RPC_URL=${rpcUrl}

# Network: ${network}
# Change RPC_URL if switching networks
`;
}

/**
 * Generate CLAUDE.md file for Claude Code integration
 */
function generateClaudeMd(selectedSkills: string[], network: Network): string {
  const skillList = selectedSkills.map((s) => `- ${s}`).join("\n");

  return `# Starknet Agent Configuration

This project is configured with Starknet capabilities via the starknet-agentic MCP server.

## Available Skills

${skillList}

## Network

Currently configured for **${network}**.

## Usage

Ask me to:
- "What's my ETH balance on Starknet?"
- "Transfer 0.1 ETH to 0x..."
- "Swap 10 USDC for STRK"

## MCP Server

The Starknet MCP server provides these tools:
- \`get_balance\` - Check token balances
- \`transfer\` - Send tokens
- \`get_transaction\` - Get transaction details
- \`swap_tokens\` - Swap via AVNU aggregator
- \`get_swap_quote\` - Get swap quotes

## Credentials

Set these environment variables in \`.env\`:
- \`STARKNET_PRIVATE_KEY\` - Your wallet private key
- \`STARKNET_ACCOUNT_ADDRESS\` - Your wallet address
- \`STARKNET_RPC_URL\` - (optional) Custom RPC URL

## Documentation

- [Starknet Agentic Docs](https://starknet-agentic.vercel.app)
- [Skills Reference](https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills)
`;
}

/**
 * Generate skills installation commands
 */
function generateSkillsCommands(selectedSkills: string[]): string[] {
  return selectedSkills.map(
    (skill) => `npx skills add keep-starknet-strange/starknet-agentic/skills/${skill}`
  );
}

/**
 * GitHub API response type for directory contents
 */
interface GitHubContentItem {
  name: string;
  path: string;
  type: "file" | "dir";
  download_url: string | null;
}

/**
 * Fetch directory contents from GitHub API
 */
async function fetchGitHubDirectory(skillId: string): Promise<GitHubContentItem[] | null> {
  const apiUrl = `${GITHUB_API_BASE}/${skillId}`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "create-starknet-agent",
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        console.log(pc.yellow(`  Warning: GitHub API rate limit. Falling back to SKILL.md only.`));
      } else {
        console.log(pc.yellow(`  Warning: Could not fetch ${skillId} directory (${response.status})`));
      }
      return null;
    }

    return await response.json() as GitHubContentItem[];
  } catch (error) {
    console.log(pc.yellow(`  Warning: Failed to fetch ${skillId}: ${(error as Error).message}`));
    return null;
  }
}

/**
 * Download a single file from GitHub
 */
async function downloadFile(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Recursively download a directory from GitHub
 */
async function downloadSkillDirectory(
  skillId: string,
  targetDir: string,
  subPath: string = ""
): Promise<number> {
  const apiPath = subPath ? `${skillId}/${subPath}` : skillId;
  const items = await fetchGitHubDirectory(apiPath);

  if (!items) {
    return 0;
  }

  let fileCount = 0;

  for (const item of items) {
    const localPath = path.join(targetDir, item.name);

    if (item.type === "dir") {
      // Recursively download subdirectory
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(localPath, { recursive: true });
      }
      const subPathNew = subPath ? `${subPath}/${item.name}` : item.name;
      fileCount += await downloadSkillDirectory(skillId, localPath, subPathNew);
    } else if (item.type === "file" && item.download_url) {
      // Download file
      const content = await downloadFile(item.download_url);
      if (content !== null) {
        fs.writeFileSync(localPath, content, "utf-8");
        fileCount++;
      }
    }
  }

  return fileCount;
}

/**
 * Fallback: fetch just the SKILL.md file
 */
async function fetchSkillMdOnly(skillId: string): Promise<string | null> {
  const skill = AVAILABLE_SKILLS.find((s) => s.id === skillId);
  if (!skill) {
    return null;
  }

  try {
    const response = await fetch(skill.rawUrl);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Install skills to the specified skills directory
 * Downloads entire skill directories from GitHub (SKILL.md, scripts/, references/, etc.)
 */
async function installSkills(
  selectedSkills: string[],
  skillsPath: string,
  silent = false
): Promise<{ installed: string[]; failed: string[] }> {
  const installed: string[] = [];
  const failed: string[] = [];

  if (!silent) {
    console.log(pc.cyan("\nInstalling skills..."));
  }

  for (const skillId of selectedSkills) {
    const skillDir = path.join(skillsPath, skillId);

    // Create skill directory
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }

    // Try to download entire skill directory
    const fileCount = await downloadSkillDirectory(skillId, skillDir);

    if (fileCount > 0) {
      if (!silent) {
        console.log(pc.dim(`  ✓ Installed ${skillId} (${fileCount} files)`));
      }
      installed.push(skillId);
    } else {
      // Fallback to just SKILL.md if API fails (rate limiting, etc.)
      const content = await fetchSkillMdOnly(skillId);
      if (content) {
        fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");
        if (!silent) {
          console.log(pc.dim(`  ✓ Installed ${skillId} (SKILL.md only)`));
        }
        installed.push(skillId);
      } else {
        if (!silent) {
          console.log(pc.yellow(`  ✗ Failed to install ${skillId}`));
        }
        failed.push(skillId);
      }
    }
  }

  return { installed, failed };
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
 * Write files to disk
 */
function writeFiles(files: GeneratedFiles, silent = false): void {
  for (const [filePath, content] of Object.entries(files)) {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.writeFileSync(filePath, content, "utf-8");
    if (!silent) {
      console.log(pc.dim(`  Created ${filePath}`));
    }
  }
}

// ============================================================================
// Platform-Specific Wizards
// ============================================================================

/**
 * OpenClaw/MoltBook wizard
 */
export async function openclawWizard(
  platform: DetectedPlatform,
  skipPrompts = false,
  defaultNetwork: Network = "sepolia",
  jsonOutput = false,
  customSkills?: string[],
  _configScope: ConfigScope = "local" // OpenClaw uses its own config structure
): Promise<WizardResult> {
  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan(`Setting up Starknet for ${platform.name}...`));
    console.log();
  }

  // Get configuration
  const setupMode = skipPrompts ? "full" : await promptSetupMode(platform);
  const selectedSkills =
    setupMode === "mcp-only"
      ? []
      : customSkills && customSkills.length > 0
        ? customSkills
        : skipPrompts
          ? ["starknet-wallet", "starknet-defi"]
          : await promptSkills();
  const network = skipPrompts ? defaultNetwork : await promptNetwork();

  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan("Configuring Starknet..."));
  }

  const files: GeneratedFiles = {};
  const nextSteps: string[] = [];

  // Generate MCP config
  if (setupMode !== "skills-only") {
    const secretsEnvPath = platform.secretsPath
      ? path.join(platform.secretsPath, ".env")
      : undefined;
    const mcpConfig = generateMcpConfig(network, secretsEnvPath);
    files[platform.configPath] = mcpConfig;
  }

  // Generate environment template
  if (platform.secretsPath) {
    const envPath = path.join(platform.secretsPath, ".env.example");
    files[envPath] = generateEnvTemplate(network);
  }

  // Write files
  writeFiles(files, jsonOutput);

  // Print skill installation commands (OpenClaw uses its own skill system)
  if (!jsonOutput && setupMode !== "mcp-only" && selectedSkills.length > 0) {
    console.log();
    console.log(pc.cyan("Installing skills..."));
    const skillCommands = generateSkillsCommands(selectedSkills);
    for (const cmd of skillCommands) {
      console.log(pc.dim(`  ${cmd}`));
    }
    console.log(pc.yellow("\n  Note: Run these commands to install skills into OpenClaw."));
  }

  // Build next steps
  if (platform.secretsPath) {
    nextSteps.push(`Add your credentials to ${platform.secretsPath}/`);
    nextSteps.push("  - STARKNET_PRIVATE_KEY");
    nextSteps.push("  - STARKNET_ACCOUNT_ADDRESS");
    nextSteps.push("  - STARKNET_RPC_URL (optional, defaults to public RPC)");
  }
  nextSteps.push("");
  nextSteps.push("Restart your OpenClaw agent");
  nextSteps.push("");
  nextSteps.push('Try: "What\'s my ETH balance on Starknet?"');

  // Success message (skip in JSON mode)
  if (!jsonOutput) {
    console.log();
    console.log(pc.green(pc.bold("Success!")) + ` Starknet configured for ${platform.name}`);
    console.log();
    if (setupMode !== "skills-only") {
      console.log(pc.dim(`✓ MCP server configured at ${platform.configPath}`));
    }
    if (selectedSkills.length > 0) {
      console.log(pc.dim(`✓ Skills to install: ${selectedSkills.join(", ")}`));
    }
    if (platform.secretsPath) {
      console.log(pc.dim(`✓ Environment template at ${platform.secretsPath}/.env.example`));
    }

    console.log();
    console.log(pc.bold("Next steps:"));
    nextSteps.forEach((step, i) => {
      if (step.startsWith("  ")) {
        console.log(pc.dim(step));
      } else if (step === "") {
        console.log();
      } else {
        console.log(`  ${pc.cyan((i + 1).toString() + ".")} ${step}`);
      }
    });
    console.log();
  }

  return {
    success: true,
    platform,
    network,
    setupMode,
    selectedSkills,
    files,
    nextSteps,
    verificationCommand: 'Ask your agent: "What\'s my ETH balance on Starknet?"',
  };
}

/**
 * Claude Code wizard
 */
export async function claudeCodeWizard(
  platform: DetectedPlatform,
  skipPrompts = false,
  defaultNetwork: Network = "sepolia",
  jsonOutput = false,
  customSkills?: string[],
  defaultConfigScope: ConfigScope = "local"
): Promise<WizardResult> {
  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan(`Setting up Starknet for ${platform.name}...`));
    console.log();
  }

  // Get configuration
  const setupMode = skipPrompts ? "full" : await promptSetupMode(platform);
  const selectedSkills =
    setupMode === "mcp-only"
      ? []
      : customSkills && customSkills.length > 0
        ? customSkills
        : skipPrompts
          ? ["starknet-wallet", "starknet-defi"]
          : await promptSkills();
  const network = skipPrompts ? defaultNetwork : await promptNetwork();

  // Prompt for config scope (local vs global)
  const configScope = skipPrompts ? defaultConfigScope : await promptConfigScope(platform.name);

  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan("Configuring Starknet..."));
  }

  const files: GeneratedFiles = {};
  const nextSteps: string[] = [];
  const cwd = process.cwd();

  // Generate MCP config for Claude Code settings
  if (setupMode !== "skills-only") {
    const mcpConfig = generateMcpConfig(network);

    // Determine config path based on scope
    // Local: .claude/settings.local.json (project-level)
    // Global: ~/.claude/settings.json (user-level)
    const settingsPath = configScope === "local"
      ? path.join(cwd, ".claude", "settings.local.json")
      : platform.configPath; // Use detected global path
    const settingsDir = path.dirname(settingsPath);

    // Create .claude directory if local scope
    if (configScope === "local" && !fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    // Read existing settings if present
    let existingSettings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      try {
        existingSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      } catch {
        // Ignore parse errors, start fresh
      }
    }

    // Merge MCP server config
    const mcpParsed = JSON.parse(mcpConfig);
    existingSettings.mcpServers = {
      ...(existingSettings.mcpServers as Record<string, unknown> || {}),
      ...mcpParsed.mcpServers,
    };

    files[settingsPath] = JSON.stringify(existingSettings, null, 2);
  }

  // Generate CLAUDE.md with skill references
  if (selectedSkills.length > 0) {
    const claudeMdPath = path.join(cwd, "CLAUDE.md");

    // Check if CLAUDE.md exists and append/merge
    let existingContent = "";
    if (fs.existsSync(claudeMdPath)) {
      existingContent = fs.readFileSync(claudeMdPath, "utf-8");
      // Only add if not already configured
      if (!existingContent.includes("Starknet Agent Configuration")) {
        files[claudeMdPath] = existingContent + "\n\n" + generateClaudeMd(selectedSkills, network);
      } else {
        console.log(pc.yellow("  CLAUDE.md already contains Starknet config, skipping..."));
      }
    } else {
      files[claudeMdPath] = generateClaudeMd(selectedSkills, network);
    }
  }

  // Generate .env.example
  const envExamplePath = path.join(cwd, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    files[envExamplePath] = generateEnvTemplate(network);
  }

  // Write files
  writeFiles(files, jsonOutput);

  // Determine skills path based on config scope
  const skillsPath = configScope === "local"
    ? path.join(cwd, ".claude", "skills")
    : platform.skillsPath;

  // Install skills
  let installedSkills: string[] = [];
  if (setupMode !== "mcp-only" && selectedSkills.length > 0 && skillsPath) {
    const result = await installSkills(selectedSkills, skillsPath, jsonOutput);
    installedSkills = result.installed;
  }

  // Determine actual settings path for display
  const actualSettingsPath = configScope === "local"
    ? path.join(cwd, ".claude", "settings.local.json")
    : platform.configPath;

  // Build next steps
  nextSteps.push("Copy .env.example to .env and add your credentials:");
  nextSteps.push("  cp .env.example .env");
  nextSteps.push("");
  nextSteps.push("Add your wallet credentials to .env:");
  nextSteps.push("  - STARKNET_PRIVATE_KEY");
  nextSteps.push("  - STARKNET_ACCOUNT_ADDRESS");
  nextSteps.push("");
  nextSteps.push("Restart Claude Code to load the MCP server");
  nextSteps.push("");
  nextSteps.push('Try: "What\'s my ETH balance on Starknet?"');

  // Success message (skip in JSON mode)
  if (!jsonOutput) {
    console.log();
    console.log(pc.green(pc.bold("Success!")) + ` Starknet configured for ${platform.name}`);
    console.log();
    if (setupMode !== "skills-only") {
      console.log(pc.dim(`✓ MCP server configured at ${actualSettingsPath}`));
    }
    if (installedSkills.length > 0) {
      console.log(pc.dim(`✓ Skills installed to ${skillsPath}/`));
    }
    if (selectedSkills.length > 0) {
      console.log(pc.dim(`✓ CLAUDE.md updated with skill references`));
    }
    console.log(pc.dim(`✓ Environment template at .env.example`));

    console.log();
    console.log(pc.bold("Next steps:"));
    let stepNum = 1;
    for (const step of nextSteps) {
      if (step.startsWith("  ")) {
        console.log(pc.dim(step));
      } else if (step === "") {
        console.log();
      } else {
        console.log(`  ${pc.cyan(stepNum.toString() + ".")} ${step}`);
        stepNum++;
      }
    }
    console.log();
  }

  return {
    success: true,
    platform,
    network,
    setupMode,
    selectedSkills,
    files,
    nextSteps,
    verificationCommand: 'Ask: "What\'s my ETH balance on Starknet?"',
  };
}

/**
 * Cursor wizard
 */
export async function cursorWizard(
  platform: DetectedPlatform,
  skipPrompts = false,
  defaultNetwork: Network = "sepolia",
  jsonOutput = false,
  customSkills?: string[],
  defaultConfigScope: ConfigScope = "local"
): Promise<WizardResult> {
  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan(`Setting up Starknet for ${platform.name}...`));
    console.log();
  }

  // Get configuration
  const setupMode = skipPrompts ? "full" : await promptSetupMode(platform);
  const selectedSkills =
    setupMode === "mcp-only"
      ? []
      : customSkills && customSkills.length > 0
        ? customSkills
        : skipPrompts
          ? ["starknet-wallet", "starknet-defi"]
          : await promptSkills();
  const network = skipPrompts ? defaultNetwork : await promptNetwork();

  // For Cursor, config scope doesn't change much (always project-local .cursor/)
  // but we accept the parameter for API consistency
  const configScope = defaultConfigScope;

  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan("Configuring Starknet..."));
  }

  const files: GeneratedFiles = {};
  const nextSteps: string[] = [];
  const cwd = process.cwd();

  // Generate MCP config for Cursor
  if (setupMode !== "skills-only") {
    const mcpConfig = generateMcpConfig(network);

    // Cursor stores MCP config in .cursor/mcp.json
    const mcpPath = platform.configPath;

    // Read existing config if present
    let existingConfig: Record<string, unknown> = {};
    if (fs.existsSync(mcpPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
      } catch {
        // Ignore parse errors, start fresh
      }
    }

    // Merge MCP server config
    const mcpParsed = JSON.parse(mcpConfig);
    existingConfig.mcpServers = {
      ...(existingConfig.mcpServers as Record<string, unknown> || {}),
      ...mcpParsed.mcpServers,
    };

    files[mcpPath] = JSON.stringify(existingConfig, null, 2);
  }

  // Generate CLAUDE.md for in-editor guidance
  if (selectedSkills.length > 0) {
    const claudeMdPath = path.join(cwd, "CLAUDE.md");

    if (fs.existsSync(claudeMdPath)) {
      const existingContent = fs.readFileSync(claudeMdPath, "utf-8");
      if (!existingContent.includes("Starknet Agent Configuration")) {
        files[claudeMdPath] = existingContent + "\n\n" + generateClaudeMd(selectedSkills, network);
      } else {
        console.log(pc.yellow("  CLAUDE.md already contains Starknet config, skipping..."));
      }
    } else {
      files[claudeMdPath] = generateClaudeMd(selectedSkills, network);
    }
  }

  // Generate .env.example
  const envExamplePath = path.join(cwd, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    files[envExamplePath] = generateEnvTemplate(network);
  }

  // Write files
  writeFiles(files, jsonOutput);

  // Install skills to .cursor/skills/
  let installedSkills: string[] = [];
  if (setupMode !== "mcp-only" && selectedSkills.length > 0 && platform.skillsPath) {
    const result = await installSkills(selectedSkills, platform.skillsPath, jsonOutput);
    installedSkills = result.installed;
  }

  // Build next steps
  nextSteps.push("Copy .env.example to .env and add your credentials:");
  nextSteps.push("  cp .env.example .env");
  nextSteps.push("");
  nextSteps.push("Add your wallet credentials to .env:");
  nextSteps.push("  - STARKNET_PRIVATE_KEY");
  nextSteps.push("  - STARKNET_ACCOUNT_ADDRESS");
  nextSteps.push("");
  nextSteps.push("Restart Cursor to load the MCP server");
  nextSteps.push("");
  nextSteps.push('Try: "What\'s my ETH balance on Starknet?"');

  // Success message (skip in JSON mode)
  if (!jsonOutput) {
    console.log();
    console.log(pc.green(pc.bold("Success!")) + ` Starknet configured for ${platform.name}`);
    console.log();
    if (setupMode !== "skills-only") {
      console.log(pc.dim(`✓ MCP server configured at ${platform.configPath}`));
    }
    if (installedSkills.length > 0) {
      console.log(pc.dim(`✓ Skills installed to ${platform.skillsPath}/`));
    }
    if (selectedSkills.length > 0) {
      console.log(pc.dim(`✓ CLAUDE.md created for in-editor guidance`));
    }
    console.log(pc.dim(`✓ Environment template at .env.example`));

    console.log();
    console.log(pc.bold("Next steps:"));
    let stepNum = 1;
    for (const step of nextSteps) {
      if (step.startsWith("  ")) {
        console.log(pc.dim(step));
      } else if (step === "") {
        console.log();
      } else {
        console.log(`  ${pc.cyan(stepNum.toString() + ".")} ${step}`);
        stepNum++;
      }
    }
    console.log();
  }

  return {
    success: true,
    platform,
    network,
    setupMode,
    selectedSkills,
    files,
    nextSteps,
    verificationCommand: 'Ask: "What\'s my ETH balance on Starknet?"',
  };
}

/**
 * Daydreams wizard
 */
export async function daydreamsWizard(
  platform: DetectedPlatform,
  skipPrompts = false,
  defaultNetwork: Network = "sepolia",
  jsonOutput = false,
  customSkills?: string[],
  _configScope: ConfigScope = "local" // Daydreams uses its own config structure
): Promise<WizardResult> {
  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan(`Setting up Starknet for ${platform.name}...`));
    console.log();
  }

  // Get configuration
  const setupMode = skipPrompts ? "full" : await promptSetupMode(platform);
  const selectedSkills =
    setupMode === "mcp-only"
      ? []
      : customSkills && customSkills.length > 0
        ? customSkills
        : skipPrompts
          ? ["starknet-wallet", "starknet-defi"]
          : await promptSkills();
  const network = skipPrompts ? defaultNetwork : await promptNetwork();

  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan("Configuring Starknet..."));
  }

  const files: GeneratedFiles = {};
  const nextSteps: string[] = [];
  const cwd = process.cwd();

  // Generate MCP config for Daydreams
  if (setupMode !== "skills-only") {
    const mcpConfig = generateMcpConfig(network);

    // Daydreams uses daydreams.config.json
    const configPath = platform.configPath;

    // Read existing config if present
    let existingConfig: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {
        // Ignore parse errors, start fresh
      }
    }

    // Merge MCP server config
    const mcpParsed = JSON.parse(mcpConfig);
    existingConfig.mcpServers = {
      ...(existingConfig.mcpServers as Record<string, unknown> || {}),
      ...mcpParsed.mcpServers,
    };

    files[configPath] = JSON.stringify(existingConfig, null, 2);
  }

  // Generate .env.example
  const envExamplePath = path.join(cwd, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    files[envExamplePath] = generateEnvTemplate(network);
  }

  // Write files
  writeFiles(files, jsonOutput);

  // Build next steps
  nextSteps.push("Copy .env.example to .env and add your credentials:");
  nextSteps.push("  cp .env.example .env");
  nextSteps.push("");
  nextSteps.push("Add your wallet credentials to .env:");
  nextSteps.push("  - STARKNET_PRIVATE_KEY");
  nextSteps.push("  - STARKNET_ACCOUNT_ADDRESS");
  nextSteps.push("");
  nextSteps.push("Restart your Daydreams agent to load the MCP server");
  nextSteps.push("");
  nextSteps.push('Try: "What\'s my ETH balance on Starknet?"');

  // Success message (skip in JSON mode)
  if (!jsonOutput) {
    console.log();
    console.log(pc.green(pc.bold("Success!")) + ` Starknet configured for ${platform.name}`);
    console.log();
    if (setupMode !== "skills-only") {
      console.log(pc.dim(`✓ MCP server configured at ${platform.configPath}`));
    }
    console.log(pc.dim(`✓ Environment template at .env.example`));

    console.log();
    console.log(pc.bold("Next steps:"));
    let stepNum = 1;
    for (const step of nextSteps) {
      if (step.startsWith("  ")) {
        console.log(pc.dim(step));
      } else if (step === "") {
        console.log();
      } else {
        console.log(`  ${pc.cyan(stepNum.toString() + ".")} ${step}`);
        stepNum++;
      }
    }
    console.log();
  }

  return {
    success: true,
    platform,
    network,
    setupMode,
    selectedSkills,
    files,
    nextSteps,
    verificationCommand: 'Ask: "What\'s my ETH balance on Starknet?"',
  };
}

/**
 * Generic MCP wizard
 */
export async function genericMcpWizard(
  platform: DetectedPlatform,
  skipPrompts = false,
  defaultNetwork: Network = "sepolia",
  jsonOutput = false,
  customSkills?: string[],
  _configScope: ConfigScope = "local" // Generic MCP uses project-local mcp.json
): Promise<WizardResult> {
  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan(`Setting up Starknet MCP server...`));
    console.log();
  }

  // Get configuration
  const setupMode = skipPrompts ? "full" : await promptSetupMode(platform);
  const selectedSkills =
    setupMode === "mcp-only"
      ? []
      : customSkills && customSkills.length > 0
        ? customSkills
        : skipPrompts
          ? ["starknet-wallet", "starknet-defi"]
          : await promptSkills();
  const network = skipPrompts ? defaultNetwork : await promptNetwork();

  if (!jsonOutput) {
    console.log();
    console.log(pc.cyan("Configuring Starknet..."));
  }

  const files: GeneratedFiles = {};
  const nextSteps: string[] = [];
  const cwd = process.cwd();

  // Generate MCP config
  if (setupMode !== "skills-only") {
    const mcpConfig = generateMcpConfig(network);

    // Use the detected config path (mcp.json or claude_desktop_config.json)
    const configPath = platform.configPath;

    // Read existing config if present
    let existingConfig: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch {
        // Ignore parse errors, start fresh
      }
    }

    // Merge MCP server config
    const mcpParsed = JSON.parse(mcpConfig);
    existingConfig.mcpServers = {
      ...(existingConfig.mcpServers as Record<string, unknown> || {}),
      ...mcpParsed.mcpServers,
    };

    files[configPath] = JSON.stringify(existingConfig, null, 2);
  }

  // Install skills to local directory if requested
  if (!jsonOutput && setupMode !== "mcp-only" && selectedSkills.length > 0 && platform.skillsPath) {
    console.log();
    console.log(pc.cyan("Skill installation commands:"));
    const skillCommands = generateSkillsCommands(selectedSkills);
    for (const cmd of skillCommands) {
      console.log(pc.dim(`  ${cmd}`));
    }
  }

  // Generate .env.example
  const envExamplePath = path.join(cwd, ".env.example");
  if (!fs.existsSync(envExamplePath)) {
    files[envExamplePath] = generateEnvTemplate(network);
  }

  // Write files
  writeFiles(files, jsonOutput);

  // Build next steps
  nextSteps.push("Copy .env.example to .env and add your credentials:");
  nextSteps.push("  cp .env.example .env");
  nextSteps.push("");
  nextSteps.push("Add your wallet credentials to .env:");
  nextSteps.push("  - STARKNET_PRIVATE_KEY");
  nextSteps.push("  - STARKNET_ACCOUNT_ADDRESS");
  nextSteps.push("");
  nextSteps.push("Restart your MCP client to load the new server");
  nextSteps.push("");
  nextSteps.push('Try: "What\'s my ETH balance on Starknet?"');

  // Success message (skip in JSON mode)
  if (!jsonOutput) {
    console.log();
    console.log(pc.green(pc.bold("Success!")) + ` Starknet MCP server configured`);
    console.log();
    if (setupMode !== "skills-only") {
      console.log(pc.dim(`✓ MCP server configured at ${platform.configPath}`));
    }
    console.log(pc.dim(`✓ Environment template at .env.example`));

    console.log();
    console.log(pc.bold("Next steps:"));
    let stepNum = 1;
    for (const step of nextSteps) {
      if (step.startsWith("  ")) {
        console.log(pc.dim(step));
      } else if (step === "") {
        console.log();
      } else {
        console.log(`  ${pc.cyan(stepNum.toString() + ".")} ${step}`);
        stepNum++;
      }
    }
    console.log();
  }

  return {
    success: true,
    platform,
    network,
    setupMode,
    selectedSkills,
    files,
    nextSteps,
    verificationCommand: 'Try: "What\'s my ETH balance on Starknet?"',
  };
}

/**
 * Wizard router - routes to the appropriate wizard based on platform type
 */
export async function runWizard(
  platform: DetectedPlatform,
  skipPrompts = false,
  defaultNetwork: Network = "sepolia",
  jsonOutput = false,
  customSkills?: string[],
  configScope: ConfigScope = "local"
): Promise<WizardResult> {
  switch (platform.type) {
    case "openclaw":
      return openclawWizard(platform, skipPrompts, defaultNetwork, jsonOutput, customSkills, configScope);
    case "claude-code":
      return claudeCodeWizard(platform, skipPrompts, defaultNetwork, jsonOutput, customSkills, configScope);
    case "cursor":
      return cursorWizard(platform, skipPrompts, defaultNetwork, jsonOutput, customSkills, configScope);
    case "daydreams":
      return daydreamsWizard(platform, skipPrompts, defaultNetwork, jsonOutput, customSkills, configScope);
    case "generic-mcp":
      return genericMcpWizard(platform, skipPrompts, defaultNetwork, jsonOutput, customSkills, configScope);
    case "standalone":
      // Standalone mode is handled differently (full project scaffold)
      // This should not be called for standalone
      throw new Error("Standalone mode should use createProject(), not runWizard()");
    default:
      throw new Error(`Unknown platform type: ${platform.type}`);
  }
}
