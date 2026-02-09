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
} from "./types.js";
import { generateProject } from "./templates.js";

const VERSION = "0.1.0";

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
  --template <name>   Template to use (minimal, defi, full)
  --network <name>    Network (mainnet, sepolia)
  --yes, -y           Skip prompts and use defaults
  --help, -h          Show this help message
  --version, -v       Show version number

${pc.bold("Examples:")}
  npx create-starknet-agent my-agent
  npx create-starknet-agent my-agent --template defi
  npx create-starknet-agent my-agent --template full --network sepolia
  npx create-starknet-agent my-agent -y
`);
}

// Parse CLI arguments
function parseArgs(args: string[]): {
  projectName?: string;
  template?: Template;
  network?: Network;
  skipPrompts: boolean;
  showHelp: boolean;
  showVersion: boolean;
} {
  const result = {
    projectName: undefined as string | undefined,
    template: undefined as Template | undefined,
    network: undefined as Network | undefined,
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

// Interactive prompts
async function getProjectConfig(
  initialName?: string,
  initialTemplate?: Template,
  initialNetwork?: Network,
  skipPrompts = false
): Promise<ProjectConfig | null> {
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
    };
  }

  // Cancel handler
  const onCancel = () => {
    console.log(pc.red("\nOperation cancelled."));
    process.exit(0);
  };

  const questions: prompts.PromptObject[] = [];

  // Project name
  if (!initialName) {
    questions.push({
      type: "text",
      name: "projectName",
      message: "Project name:",
      initial: "my-starknet-agent",
      validate: (value: string) =>
        isValidProjectName(value) || "Invalid name. Use letters, numbers, - or _",
    });
  }

  // Template selection
  if (!initialTemplate) {
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

  // Network selection
  if (!initialNetwork) {
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

  const projectName = initialName || (responses.projectName as string);
  const template = initialTemplate || (responses.template as Template);
  const network = initialNetwork || (responses.network as Network);

  // Custom RPC URL if needed
  let customRpcUrl: string | undefined;
  if (network === "custom") {
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

  // DeFi protocols (only for defi/full templates)
  let defiProtocols: DeFiProtocol[] = [];
  if (template === "defi" || template === "full") {
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

  // Install dependencies
  const installResponse = await prompts(
    {
      type: "confirm",
      name: "installDeps",
      message: "Install dependencies with pnpm/npm?",
      initial: true,
    },
    { onCancel }
  );

  return {
    projectName,
    network,
    customRpcUrl,
    template,
    defiProtocols,
    includeExample: "none" as ExampleType,
    installDeps: installResponse.installDeps as boolean,
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

  // Get project configuration
  const config = await getProjectConfig(
    parsed.projectName,
    parsed.template,
    parsed.network,
    parsed.skipPrompts
  );

  if (!config) {
    process.exit(1);
  }

  // Create the project
  await createProject(config);
}

main().catch((error) => {
  console.error(pc.red("Error:"), error.message);
  process.exit(1);
});
