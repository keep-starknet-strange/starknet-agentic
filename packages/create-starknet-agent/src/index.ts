#!/usr/bin/env node
/**
 * create-starknet-agent
 *
 * CLI tool to scaffold a Starknet AI agent project.
 * Run with: npx create-starknet-agent@latest [project-name] [--template <template>]
 */

import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import pc from "picocolors";
import type {
  ProjectConfig,
  Network,
  Template,
  DeFiProtocol,
  ExampleType,
  DetectedPlatform,
  PlatformType,
} from "./types.js";
import { generateProject } from "./templates.js";
import {
  detectPlatforms,
  formatDetectedPlatforms,
  getPlatformByType,
  isValidPlatformType,
} from "./platform.js";
import { runWizard } from "./wizards.js";

const VERSION = "0.2.0";

// CLI banner
function printBanner() {
  console.log();
  console.log(pc.bold(pc.cyan("  create-starknet-agent")) + pc.dim(` v${VERSION}`));
  console.log(pc.dim("  Scaffold a Starknet AI agent project"));
  console.log();
}

// Help text
function printHelp() {
  console.log(`
${pc.bold("Usage:")}
  npx create-starknet-agent [project-name] [options]

${pc.bold("Options:")}
  --template <name>     Template to use (minimal, defi, full)
  --network <name>      Network (mainnet, sepolia)
  --platform <name>     Target platform (openclaw, claude-code, cursor, daydreams, generic-mcp, standalone)
  --detect-only         Detect platforms and exit (useful for debugging)
  --yes, -y             Skip prompts and use defaults
  --help, -h            Show this help message
  --version, -v         Show version number

${pc.bold("Platform Modes:")}
  The CLI auto-detects your agent platform and provides the appropriate setup:

  ${pc.cyan("openclaw")}       OpenClaw/MoltBook - MCP config + skills
  ${pc.cyan("claude-code")}    Claude Code - CLAUDE.md + MCP settings
  ${pc.cyan("cursor")}         Cursor - MCP config in .cursor/
  ${pc.cyan("daydreams")}      Daydreams - daydreams.config integration
  ${pc.cyan("generic-mcp")}    Generic MCP - mcp.json configuration
  ${pc.cyan("standalone")}     Full project scaffold (default if no platform detected)

${pc.bold("Examples:")}
  npx create-starknet-agent my-agent
  npx create-starknet-agent my-agent --template defi
  npx create-starknet-agent my-agent --template full --network sepolia
  npx create-starknet-agent my-agent --platform claude-code
  npx create-starknet-agent --detect-only
  npx create-starknet-agent my-agent -y
`);
}

// Parsed CLI arguments interface
interface ParsedArgs {
  projectName?: string;
  template?: Template;
  network?: Network;
  platform?: PlatformType;
  detectOnly: boolean;
  skipPrompts: boolean;
  showHelp: boolean;
  showVersion: boolean;
}

// Parse CLI arguments
function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    projectName: undefined,
    template: undefined,
    network: undefined,
    platform: undefined,
    detectOnly: false,
    skipPrompts: false,
    showHelp: false,
    showVersion: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.showHelp = true;
    } else if (arg === "--version" || arg === "-v") {
      result.showVersion = true;
    } else if (arg === "--yes" || arg === "-y") {
      result.skipPrompts = true;
    } else if (arg === "--detect-only") {
      result.detectOnly = true;
    } else if (arg === "--template" && args[i + 1]) {
      const template = args[++i];
      if (["minimal", "defi", "full"].includes(template)) {
        result.template = template as Template;
      }
    } else if (arg === "--network" && args[i + 1]) {
      const network = args[++i];
      if (["mainnet", "sepolia", "custom"].includes(network)) {
        result.network = network as Network;
      }
    } else if (arg === "--platform" && args[i + 1]) {
      const platform = args[++i];
      if (isValidPlatformType(platform)) {
        result.platform = platform;
      } else {
        console.log(pc.yellow(`Warning: Unknown platform "${platform}". Using auto-detection.`));
      }
    } else if (!arg.startsWith("-") && !result.projectName) {
      result.projectName = arg;
    }
  }

  return result;
}

// Validate project name
function isValidProjectName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
}

/**
 * Platform descriptions for wizard display
 */
const PLATFORM_DESCRIPTIONS: Record<PlatformType, string> = {
  "openclaw": "OpenClaw/MoltBook agent platform",
  "claude-code": "Claude Code CLI integration",
  "cursor": "Cursor AI editor",
  "daydreams": "Daydreams agent framework",
  "generic-mcp": "Generic MCP configuration",
  "standalone": "Full project scaffold (advanced)",
};

/**
 * All possible platform types for selection
 */
const ALL_PLATFORM_TYPES: PlatformType[] = [
  "openclaw",
  "claude-code",
  "cursor",
  "daydreams",
  "generic-mcp",
  "standalone",
];

/**
 * Select platform from detected platforms
 * Returns the selected platform, prompting user if multiple are detected
 */
async function selectPlatform(
  detectedPlatforms: DetectedPlatform[],
  platformOverride?: PlatformType,
  skipPrompts = false
): Promise<DetectedPlatform> {
  // If --platform flag provided, use that
  if (platformOverride) {
    const match = getPlatformByType(platformOverride);
    if (match) {
      return match;
    }
    // Shouldn't reach here due to validation in parseArgs, but handle gracefully
    console.log(pc.yellow(`Platform "${platformOverride}" not found, using standalone.`));
    return detectedPlatforms.find((p) => p.type === "standalone")!;
  }

  // Non-interactive mode: use first detected platform
  if (skipPrompts || !process.stdin.isTTY) {
    return detectedPlatforms[0];
  }

  // Create a set of detected platform types for quick lookup
  const detectedTypes = new Set(detectedPlatforms.map((p) => p.type));

  // Build choices for all platforms, showing detected ones first
  const detectedChoices: Array<{ title: string; value: PlatformType }> = [];
  const undetectedChoices: Array<{ title: string; value: PlatformType }> = [];

  for (const platformType of ALL_PLATFORM_TYPES) {
    const isDetected = detectedTypes.has(platformType);
    const description = PLATFORM_DESCRIPTIONS[platformType];

    if (isDetected) {
      const isFirst = detectedChoices.length === 0 && platformType !== "standalone";
      const label = isFirst
        ? pc.green(platformType) + pc.dim(` - ${description}`)
        : platformType + pc.dim(` - ${description}`);
      detectedChoices.push({ title: label, value: platformType });
    } else {
      const label = pc.dim(platformType) + pc.dim(` - ${description}`) + pc.yellow(" (not detected)");
      undetectedChoices.push({ title: label, value: platformType });
    }
  }

  // Combine: detected first, then undetected
  const choices = [...detectedChoices, ...undetectedChoices];

  // Cancel handler
  const onCancel = () => {
    console.log(pc.red("\nOperation cancelled."));
    process.exit(0);
  };

  const response = await prompts(
    {
      type: "select",
      name: "platform",
      message: "Select target platform:",
      choices,
      initial: 0,
    },
    { onCancel }
  );

  // Find the selected platform from detected, or create one for undetected
  const selected = detectedPlatforms.find((p) => p.type === response.platform);
  if (selected) {
    return selected;
  }

  // For undetected platforms, get a fresh platform config
  const freshPlatform = getPlatformByType(response.platform);
  return freshPlatform || detectedPlatforms.find((p) => p.type === "standalone")!;
}

// Interactive prompts
async function getProjectConfig(
  initialName?: string,
  initialTemplate?: Template,
  initialNetwork?: Network,
  initialPlatform?: PlatformType,
  skipPrompts = false
): Promise<ProjectConfig | null> {
  // Detect platforms
  const detectedPlatforms = detectPlatforms();

  // Show detected platforms
  if (!skipPrompts && process.stdin.isTTY) {
    const nonStandalone = detectedPlatforms.filter((p) => p.type !== "standalone");
    if (nonStandalone.length > 0) {
      console.log(pc.dim("Detected platforms:"));
      for (const platform of nonStandalone) {
        const icon = platform.confidence === "high" ? "●" : "◐";
        console.log(pc.dim(`  ${icon} ${platform.name} (${platform.detectedBy})`));
      }
      console.log();
    }
  }

  // Select platform (first step in wizard)
  const selectedPlatform = await selectPlatform(detectedPlatforms, initialPlatform, skipPrompts);

  // If skipping prompts, use defaults
  if (skipPrompts) {
    const projectName = initialName || "my-starknet-agent";
    return {
      projectName,
      network: initialNetwork || "sepolia",
      template: initialTemplate || "minimal",
      defiProtocols: initialTemplate === "minimal" ? [] : ["avnu"],
      includeExample: "none",
      installDeps: true,
      platform: selectedPlatform,
    };
  }

  // Cancel handler
  const onCancel = () => {
    console.log(pc.red("\nOperation cancelled."));
    process.exit(0);
  };

  const questions: prompts.PromptObject[] = [];

  // Project name (only for standalone mode)
  if (!initialName && selectedPlatform.type === "standalone") {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project name:",
      initial: "my-starknet-agent",
      validate: (value: string) =>
        isValidProjectName(value) || "Invalid name. Use letters, numbers, - or _",
    });
  }

  // Template selection (only for standalone mode)
  if (!initialTemplate && selectedPlatform.type === "standalone") {
    questions.push({
      type: "select",
      name: "template",
      message: "Select a template:",
      choices: [
        {
          title: pc.green("minimal") + pc.dim(" - Wallet + basic operations"),
          value: "minimal",
        },
        {
          title: pc.yellow("defi") + pc.dim(" - Wallet + AVNU swaps + DeFi"),
          value: "defi",
        },
        {
          title: pc.magenta("full") + pc.dim(" - All features + Identity + A2A"),
          value: "full",
        },
      ],
      initial: 0,
    });
  }

  // Network selection (only for standalone - wizards handle their own network selection)
  if (!initialNetwork && selectedPlatform.type === "standalone") {
    questions.push({
      type: "select",
      name: "network",
      message: "Select network:",
      choices: [
        {
          title: pc.cyan("sepolia") + pc.dim(" - Testnet (recommended for development)"),
          value: "sepolia",
        },
        {
          title: pc.green("mainnet") + pc.dim(" - Production network"),
          value: "mainnet",
        },
        {
          title: pc.dim("custom") + pc.dim(" - Custom RPC URL"),
          value: "custom",
        },
      ],
      initial: 0,
    });
  }

  // Run initial questions
  let responses: Record<string, unknown> = {};
  if (questions.length > 0) {
    responses = await prompts(questions, { onCancel });
  }

  // For non-standalone platforms, use a default project name based on platform
  const projectName = initialName ||
    (responses.projectName as string) ||
    (selectedPlatform.type !== "standalone" ? "starknet-config" : "my-starknet-agent");

  // For non-standalone platforms, default to minimal template
  const template = initialTemplate ||
    (responses.template as Template) ||
    (selectedPlatform.type !== "standalone" ? "minimal" : "minimal");

  // Network is handled by wizards for non-standalone platforms
  const network = initialNetwork || (responses.network as Network) || "sepolia";

  // Custom RPC URL if needed (standalone only)
  let customRpcUrl: string | undefined;
  if (selectedPlatform.type === "standalone" && network === "custom") {
    const customResponse = await prompts(
      {
        type: "text",
        name: "customRpcUrl",
        message: "Enter custom RPC URL:",
        validate: (value: string) =>
          value.startsWith("http") || "Must be a valid URL",
      },
      { onCancel }
    );
    customRpcUrl = customResponse.customRpcUrl as string;
  }

  // DeFi protocols (only for defi/full templates in standalone mode)
  let defiProtocols: DeFiProtocol[] = [];
  if (selectedPlatform.type === "standalone" && (template === "defi" || template === "full")) {
    const protocolResponse = await prompts(
      {
        type: "multiselect",
        name: "protocols",
        message: "Select DeFi protocols to enable:",
        choices: [
          { title: pc.green("avnu") + pc.dim(" - DEX aggregator (recommended)"), value: "avnu", selected: true },
          { title: "zkLend" + pc.dim(" - Lending protocol"), value: "zklend" },
          { title: "Nostra" + pc.dim(" - Lending & trading"), value: "nostra" },
          { title: "Ekubo" + pc.dim(" - AMM"), value: "ekubo" },
        ],
        hint: "- Space to select, Enter to confirm",
      },
      { onCancel }
    );
    defiProtocols = protocolResponse.protocols as DeFiProtocol[];
  }

  // Install dependencies (only for standalone mode)
  let installDeps = false;
  if (selectedPlatform.type === "standalone") {
    const installResponse = await prompts(
      {
        type: "confirm",
        name: "installDeps",
        message: "Install dependencies with pnpm/npm?",
        initial: true,
      },
      { onCancel }
    );
    installDeps = installResponse.installDeps as boolean;
  }

  return {
    projectName,
    network,
    customRpcUrl,
    template,
    defiProtocols,
    includeExample: "none" as ExampleType,
    installDeps,
    platform: selectedPlatform,
  };
}

// Create project directory and files
async function createProject(config: ProjectConfig): Promise<void> {
  // Handle both relative and absolute paths
  const projectDir = path.isAbsolute(config.projectName)
    ? config.projectName
    : path.resolve(process.cwd(), config.projectName);

  // Extract just the directory name for templates
  const projectBasename = path.basename(projectDir);

  // Check if directory exists
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      console.log(pc.red(`\nError: Directory "${projectBasename}" is not empty.`));
      process.exit(1);
    }
  } else {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  console.log();
  console.log(pc.cyan("Creating project..."));

  // Generate files with the basename as project name
  const templateConfig = { ...config, projectName: projectBasename };
  const files = generateProject(templateConfig);

  // Write files
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(projectDir, relativePath);
    const fileDir = path.dirname(filePath);

    // Create directory if needed
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, "utf-8");
    console.log(pc.dim(`  Created ${relativePath}`));
  }

  // Install dependencies
  if (config.installDeps) {
    console.log();
    console.log(pc.cyan("Installing dependencies..."));

    const { execSync } = await import("node:child_process");
    const packageManager = detectPackageManager();

    try {
      execSync(`${packageManager} install`, {
        cwd: projectDir,
        stdio: "inherit",
      });
    } catch {
      console.log(pc.yellow("\nFailed to install dependencies. Run manually:"));
      console.log(pc.dim(`  cd ${projectBasename}`));
      console.log(pc.dim(`  ${packageManager} install`));
    }
  }

  // Success message
  console.log();
  console.log(pc.green(pc.bold("Success!")) + ` Created ${pc.cyan(projectBasename)}`);
  console.log();
  console.log(pc.bold("Next steps:"));
  console.log();
  console.log(`  ${pc.cyan("1.")} cd ${projectBasename}`);
  if (!config.installDeps) {
    console.log(`  ${pc.cyan("2.")} ${detectPackageManager()} install`);
    console.log(`  ${pc.cyan("3.")} cp .env.example .env`);
    console.log(`  ${pc.cyan("4.")} # Edit .env with your wallet credentials`);
    console.log(`  ${pc.cyan("5.")} ${detectPackageManager()} start`);
  } else {
    console.log(`  ${pc.cyan("2.")} cp .env.example .env`);
    console.log(`  ${pc.cyan("3.")} # Edit .env with your wallet credentials`);
    console.log(`  ${pc.cyan("4.")} ${detectPackageManager()} start`);
  }
  console.log();
  console.log(pc.dim("Documentation: https://starknet-agentic.vercel.app"));
  console.log();
}

// Detect package manager
function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent;
  if (userAgent) {
    if (userAgent.includes("pnpm")) return "pnpm";
    if (userAgent.includes("yarn")) return "yarn";
    if (userAgent.includes("bun")) return "bun";
  }
  return "npm";
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (parsed.showVersion) {
    console.log(VERSION);
    process.exit(0);
  }

  printBanner();

  if (parsed.showHelp) {
    printHelp();
    process.exit(0);
  }

  // Handle --detect-only flag
  if (parsed.detectOnly) {
    const platforms = detectPlatforms();
    console.log(pc.bold("Detected Platforms:"));
    console.log();
    console.log(formatDetectedPlatforms(platforms));
    console.log(pc.dim("Legend: ● high confidence, ◐ medium confidence, ○ low confidence"));
    console.log();

    // Print summary
    const nonStandalone = platforms.filter((p) => p.type !== "standalone");
    if (nonStandalone.length > 0) {
      console.log(pc.green(`Found ${nonStandalone.length} platform(s) for integration mode.`));
      console.log(pc.dim(`Run without --detect-only to configure Starknet for your platform.`));
    } else {
      console.log(pc.yellow("No agent platforms detected."));
      console.log(pc.dim("The CLI will scaffold a standalone project."));
    }

    process.exit(0);
  }

  // Get project configuration
  const config = await getProjectConfig(
    parsed.projectName,
    parsed.template,
    parsed.network,
    parsed.platform,
    parsed.skipPrompts
  );

  if (!config) {
    process.exit(1);
  }

  // Route to appropriate setup flow based on platform
  if (config.platform?.type === "standalone") {
    // Standalone mode creates a full project scaffold
    await createProject(config);
  } else if (config.platform) {
    // Platform-specific wizards for lightweight integration
    await runWizard(config.platform, parsed.skipPrompts, config.network);
  }
}

main().catch((error) => {
  console.error(pc.red("Error:"), error.message);
  process.exit(1);
});
