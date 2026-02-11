/**
 * Template generators for create-starknet-agent
 */

import type {
  ProjectConfig,
  GeneratedFiles,
  DeFiProtocol,
} from "./types.js";
import { RPC_URLS, TOKEN_ADDRESSES, AVNU_URLS } from "./types.js";

/**
 * Generate all files for the project
 */
export function generateProject(config: ProjectConfig): GeneratedFiles {
  const files: GeneratedFiles = {};

  // Core files
  files["package.json"] = generatePackageJson(config);
  files["tsconfig.json"] = generateTsConfig();
  files[".env.example"] = generateEnvExample(config);
  files[".gitignore"] = generateGitignore();
  files["README.md"] = generateReadme(config);

  // Entry point based on template
  if (config.template === "minimal") {
    files["src/index.ts"] = generateMinimalAgent(config);
  } else if (config.template === "defi") {
    files["src/index.ts"] = generateDeFiAgent(config);
    files["src/config.ts"] = generateDeFiConfig(config);
  } else {
    // full template
    files["src/index.ts"] = generateFullAgent(config);
    files["src/config.ts"] = generateFullConfig(config);
    files["src/identity.ts"] = generateIdentityModule();
  }

  // Shared utilities
  files["src/utils.ts"] = generateUtils();

  return files;
}

function generatePackageJson(config: ProjectConfig): string {
  const deps: Record<string, string> = {
    dotenv: "^16.4.7",
    starknet: "^8.9.1",
  };

  const devDeps: Record<string, string> = {
    tsx: "^4.0.0",
    typescript: "^5.9.0",
    "@types/node": "^22.0.0",
  };

  // Add DeFi dependencies
  if (
    config.template === "defi" ||
    config.template === "full" ||
    config.defiProtocols.length > 0
  ) {
    if (config.defiProtocols.includes("avnu") || config.template !== "minimal") {
      deps["@avnu/avnu-sdk"] = "^4.0.1";
    }
  }

  // Add identity deps for full template
  if (config.template === "full") {
    deps["zod"] = "^3.23.0";
  }

  const pkg = {
    name: config.projectName,
    version: "0.1.0",
    description: `${config.projectName} - Starknet AI Agent`,
    private: true,
    type: "module",
    main: "src/index.ts",
    scripts: {
      start: "tsx src/index.ts",
      dev: "tsx watch src/index.ts",
      build: "tsc",
    },
    dependencies: deps,
    devDependencies: devDeps,
    engines: {
      node: ">=18.0.0",
    },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      lib: ["ES2022"],
      moduleResolution: "bundler",
      resolveJsonModule: true,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: "./dist",
      declaration: true,
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"],
  };

  return JSON.stringify(config, null, 2) + "\n";
}

function generateEnvExample(config: ProjectConfig): string {
  const rpcUrl =
    config.network === "custom"
      ? config.customRpcUrl || "https://your-rpc-url.com"
      : RPC_URLS[config.network];

  let env = `# Starknet RPC Configuration
STARKNET_RPC_URL=${rpcUrl}

# Agent Wallet (required)
# Create an account using Ready or Braavos wallet, then export the private key
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
`;

  if (config.template !== "minimal") {
    const avnuUrls =
      config.network === "sepolia" ? AVNU_URLS.sepolia : AVNU_URLS.mainnet;
    env += `
# AVNU DEX Aggregator
AVNU_BASE_URL=${avnuUrls.api}
AVNU_PAYMASTER_URL=${avnuUrls.paymaster}
`;
  }

  if (config.template === "full") {
    env += `
# ERC-8004 Identity (optional)
# Deploy your own registry or use the shared Sepolia registry
IDENTITY_REGISTRY_ADDRESS=0x...
`;
  }

  return env;
}

function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build output
dist/

# Environment
.env
.env.local
.env.*.local

# IDE
.idea/
.vscode/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*
`;
}

function generateReadme(config: ProjectConfig): string {
  const networkName = config.network === "custom" ? "custom network" : config.network;

  return `# ${config.projectName}

A Starknet AI Agent built with [starknet-agentic](https://github.com/keep-starknet-strange/starknet-agentic).

## Quick Start

1. Install dependencies:
   \`\`\`bash
   npm install
   # or
   pnpm install
   \`\`\`

2. Configure your environment:
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your account address and private key
   \`\`\`

3. Run the agent:
   \`\`\`bash
   npm start
   # or for development with auto-reload:
   npm run dev
   \`\`\`

## Configuration

This agent is configured for **${networkName}**.

### Environment Variables

| Variable | Description |
|----------|-------------|
| \`STARKNET_RPC_URL\` | Starknet RPC endpoint |
| \`STARKNET_ACCOUNT_ADDRESS\` | Your agent's account address |
| \`STARKNET_PRIVATE_KEY\` | Private key for signing transactions |
${config.template !== "minimal" ? "| `AVNU_BASE_URL` | AVNU API endpoint for swaps |\n| `AVNU_PAYMASTER_URL` | AVNU Paymaster for gas abstraction |" : ""}

## Template: ${config.template}

${getTemplateDescription(config.template)}

## Resources

- [Starknet Agentic Docs](https://starknet-agentic.vercel.app)
- [starknet.js Documentation](https://www.starknetjs.com/)
- [AVNU SDK](https://github.com/avnu-labs/avnu-sdk)
`;
}

function getTemplateDescription(template: string): string {
  switch (template) {
    case "minimal":
      return "The **minimal** template includes basic wallet operations (balance check, transfers). Perfect for getting started.";
    case "defi":
      return "The **defi** template adds DeFi capabilities via the AVNU SDK: token swaps, quotes, and price monitoring.";
    case "full":
      return "The **full** template includes wallet, DeFi, on-chain identity (ERC-8004), and A2A protocol support for agent-to-agent communication.";
    default:
      return "";
  }
}

function generateUtils(): string {
  return `/**
 * Shared utilities for Starknet Agent
 */

/**
 * Format a token amount from raw units to human-readable
 */
export function formatAmount(raw: bigint, decimals: number): string {
  const str = raw.toString();
  if (decimals === 0) return str;
  const padded = str.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const frac = padded.slice(-decimals).replace(/0+$/, "");
  return frac ? \`\${whole}.\${frac}\` : whole;
}

/**
 * Parse a human-readable amount to raw units
 */
export function parseAmount(amount: string, decimals: number): bigint {
  const [whole, frac = ""] = amount.split(".");
  const paddedFrac = frac.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole + paddedFrac);
}

/**
 * Sleep for the specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Validate a Starknet address format
 */
export function isValidAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{1,64}$/.test(address);
}
`;
}

function generateMinimalAgent(config: ProjectConfig): string {
  const tokens = config.network === "sepolia"
    ? TOKEN_ADDRESSES.sepolia
    : TOKEN_ADDRESSES.mainnet;

  return `/**
 * ${config.projectName} - Minimal Starknet Agent
 *
 * This agent demonstrates basic wallet operations:
 * - Connect to Starknet
 * - Check token balances
 * - Execute transfers
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Account, RpcProvider, Contract, CallData, cairo } from "starknet";
import { formatAmount } from "./utils.js";

// Load .env from script's directory
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

// Configuration
const CONFIG = {
  RPC_URL: process.env.STARKNET_RPC_URL!,
  ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS!,
  PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY!,
};

// Token addresses
const TOKENS = {
  ETH: "${tokens.ETH}",
  STRK: "${tokens.STRK}",
};

// ERC20 ABI for balance and transfer
const ERC20_ABI = [
  {
    type: "interface",
    name: "openzeppelin::token::erc20::interface::IERC20",
    items: [
      {
        type: "function",
        name: "balance_of",
        inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "decimals",
        inputs: [],
        outputs: [{ type: "core::integer::u8" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "transfer",
        inputs: [
          { name: "recipient", type: "core::starknet::contract_address::ContractAddress" },
          { name: "amount", type: "core::integer::u256" },
        ],
        outputs: [{ type: "core::bool" }],
        state_mutability: "external",
      },
    ],
  },
];

class StarknetAgent {
  private provider: RpcProvider;
  private account: Account;

  constructor() {
    this.provider = new RpcProvider({ nodeUrl: CONFIG.RPC_URL });
    this.account = new Account({
      provider: this.provider,
      address: CONFIG.ACCOUNT_ADDRESS,
      signer: CONFIG.PRIVATE_KEY,
    });
  }

  /**
   * Get the agent's address
   */
  get address(): string {
    return this.account.address;
  }

  /**
   * Check balance of a token
   */
  async getBalance(tokenAddress: string): Promise<{ balance: bigint; decimals: number }> {
    const contract = new Contract({
      abi: ERC20_ABI,
      address: tokenAddress,
      providerOrAccount: this.provider,
    });

    const decimals = Number(await contract.decimals());
    const balance = await contract.balance_of(this.account.address);
    const balanceBigInt = typeof balance === "bigint" ? balance : BigInt(balance);

    return { balance: balanceBigInt, decimals };
  }

  /**
   * Transfer tokens to a recipient
   */
  async transfer(tokenAddress: string, recipient: string, amount: bigint): Promise<string> {
    const call = {
      contractAddress: tokenAddress,
      entrypoint: "transfer",
      calldata: CallData.compile({ recipient, amount: cairo.uint256(amount) }),
    };

    const result = await this.account.execute(call);
    await this.provider.waitForTransaction(result.transaction_hash);
    return result.transaction_hash;
  }
}

async function main() {
  // Validate environment
  if (!CONFIG.ACCOUNT_ADDRESS || !CONFIG.PRIVATE_KEY || !CONFIG.RPC_URL) {
    console.error("Missing environment variables!");
    console.error("Please configure .env with:");
    console.error("  - STARKNET_RPC_URL");
    console.error("  - STARKNET_ACCOUNT_ADDRESS");
    console.error("  - STARKNET_PRIVATE_KEY");
    process.exit(1);
  }

  console.log("${config.projectName} - Starting...");

  const agent = new StarknetAgent();
  console.log(\`Agent Address: \${agent.address}\`);
  console.log(\`RPC: \${CONFIG.RPC_URL}\`);

  // Check ETH balance
  const { balance, decimals } = await agent.getBalance(TOKENS.ETH);
  console.log(\`ETH Balance: \${formatAmount(balance, decimals)} ETH\`);

  // Check STRK balance
  const strk = await agent.getBalance(TOKENS.STRK);
  console.log(\`STRK Balance: \${formatAmount(strk.balance, strk.decimals)} STRK\`);

  console.log("\\nAgent ready! Extend this code to add your custom logic.");
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
`;
}

function generateDeFiConfig(config: ProjectConfig): string {
  const tokens = config.network === "sepolia"
    ? TOKEN_ADDRESSES.sepolia
    : TOKEN_ADDRESSES.mainnet;
  const avnu = config.network === "sepolia" ? AVNU_URLS.sepolia : AVNU_URLS.mainnet;

  return `/**
 * DeFi Agent Configuration
 */

export const CONFIG = {
  // Network
  RPC_URL: process.env.STARKNET_RPC_URL || "${RPC_URLS[config.network === "custom" ? "mainnet" : config.network]}",

  // Wallet
  ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS!,
  PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY!,

  // AVNU DEX Aggregator
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "${avnu.api}",
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || "${avnu.paymaster}",

  // Trading Parameters
  MIN_PROFIT_BPS: 50,        // Minimum 0.5% profit to trade
  MAX_SLIPPAGE: 0.01,        // 1% max slippage
  CHECK_INTERVAL_MS: 30000,  // Check every 30 seconds
};

export const TOKENS = {
  ETH: "${tokens.ETH}",
  STRK: "${tokens.STRK}",
${config.network !== "sepolia" ? `  USDC: "${TOKEN_ADDRESSES.mainnet.USDC}",
  USDT: "${TOKEN_ADDRESSES.mainnet.USDT}",` : ""}
};
`;
}

function generateDeFiAgent(config: ProjectConfig): string {
  return `/**
 * ${config.projectName} - DeFi Agent
 *
 * This agent demonstrates DeFi operations on Starknet:
 * - Token swaps via AVNU aggregator
 * - Price monitoring
 * - Arbitrage detection
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Account, RpcProvider, Contract } from "starknet";
import { getQuotes, executeSwap, type QuoteRequest } from "@avnu/avnu-sdk";
import { CONFIG, TOKENS } from "./config.js";
import { formatAmount, sleep } from "./utils.js";

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

// ERC20 ABI
const ERC20_ABI = [
  {
    type: "interface",
    name: "openzeppelin::token::erc20::interface::IERC20",
    items: [
      {
        type: "function",
        name: "balance_of",
        inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
      },
    ],
  },
];

class DeFiAgent {
  private provider: RpcProvider;
  private account: Account;
  private isRunning = false;

  constructor() {
    this.provider = new RpcProvider({ nodeUrl: CONFIG.RPC_URL });
    this.account = new Account({
      provider: this.provider,
      address: CONFIG.ACCOUNT_ADDRESS,
      signer: CONFIG.PRIVATE_KEY,
    });
  }

  get address(): string {
    return this.account.address;
  }

  /**
   * Start the agent
   */
  async start() {
    console.log("DeFi Agent Starting...");
    console.log(\`Address: \${this.address}\`);

    await this.checkBalances();

    this.isRunning = true;
    console.log(\`\\nMonitoring for opportunities every \${CONFIG.CHECK_INTERVAL_MS / 1000}s\\n\`);

    this.monitorLoop();
  }

  /**
   * Stop the agent
   */
  stop() {
    this.isRunning = false;
    console.log("Agent stopped");
  }

  /**
   * Check wallet balances
   */
  private async checkBalances() {
    const ethContract = new Contract({
      abi: ERC20_ABI,
      address: TOKENS.ETH,
      providerOrAccount: this.provider,
    });

    const balance = await ethContract.balance_of(this.address);
    const balanceBigInt = typeof balance === "bigint" ? balance : BigInt(balance);
    console.log(\`ETH Balance: \${formatAmount(balanceBigInt, 18)} ETH\`);
  }

  /**
   * Main monitoring loop
   */
  private async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.checkOpportunities();
      } catch (error) {
        console.error("Monitor error:", error);
      }
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  /**
   * Check for trading opportunities
   */
  private async checkOpportunities() {
    const now = new Date().toLocaleTimeString();
    console.log(\`[\${now}] Checking for opportunities...\`);

    try {
      // Get quote for ETH -> STRK
      const quoteRequest: QuoteRequest = {
        sellTokenAddress: TOKENS.ETH,
        buyTokenAddress: TOKENS.STRK,
        sellAmount: BigInt(10 ** 16), // 0.01 ETH
        takerAddress: this.address,
      };

      const quotes = await getQuotes(quoteRequest, {
        baseUrl: CONFIG.AVNU_BASE_URL,
      });

      if (quotes.length > 0) {
        const best = quotes[0];
        const buyAmount = BigInt(best.buyAmount);
        console.log(\`  Best quote: 0.01 ETH -> \${formatAmount(buyAmount, 18)} STRK\`);
      } else {
        console.log("  No quotes available");
      }
    } catch (error) {
      console.error("Quote error:", error);
    }
  }

  /**
   * Execute a swap
   */
  async swap(
    sellToken: string,
    buyToken: string,
    sellAmount: bigint
  ): Promise<string | null> {
    try {
      const quoteRequest: QuoteRequest = {
        sellTokenAddress: sellToken,
        buyTokenAddress: buyToken,
        sellAmount,
        takerAddress: this.address,
      };

      const quotes = await getQuotes(quoteRequest, {
        baseUrl: CONFIG.AVNU_BASE_URL,
      });

      if (quotes.length === 0) {
        console.error("No quotes available");
        return null;
      }

      const result = await executeSwap({
        provider: this.account,
        quote: quotes[0],
        slippage: CONFIG.MAX_SLIPPAGE,
        executeApprove: true,
      });

      console.log(\`Swap executed: \${result.transactionHash}\`);
      return result.transactionHash;
    } catch (error) {
      console.error("Swap error:", error);
      return null;
    }
  }
}

async function main() {
  if (!CONFIG.ACCOUNT_ADDRESS || !CONFIG.PRIVATE_KEY) {
    console.error("Missing environment variables!");
    console.error("Please configure .env with STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY");
    process.exit(1);
  }

  const agent = new DeFiAgent();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\\nShutting down...");
    agent.stop();
    process.exit(0);
  });

  await agent.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export default DeFiAgent;
`;
}

function generateFullConfig(config: ProjectConfig): string {
  const tokens = config.network === "sepolia"
    ? TOKEN_ADDRESSES.sepolia
    : TOKEN_ADDRESSES.mainnet;
  const avnu = config.network === "sepolia" ? AVNU_URLS.sepolia : AVNU_URLS.mainnet;

  return `/**
 * Full Agent Configuration
 */

export const CONFIG = {
  // Network
  RPC_URL: process.env.STARKNET_RPC_URL || "${RPC_URLS[config.network === "custom" ? "mainnet" : config.network]}",

  // Wallet
  ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS!,
  PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY!,

  // AVNU DEX Aggregator
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "${avnu.api}",
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || "${avnu.paymaster}",

  // ERC-8004 Identity
  IDENTITY_REGISTRY_ADDRESS: process.env.IDENTITY_REGISTRY_ADDRESS || "",

  // Trading Parameters
  MIN_PROFIT_BPS: 50,
  MAX_SLIPPAGE: 0.01,
  CHECK_INTERVAL_MS: 30000,
};

export const TOKENS = {
  ETH: "${tokens.ETH}",
  STRK: "${tokens.STRK}",
${config.network !== "sepolia" ? `  USDC: "${TOKEN_ADDRESSES.mainnet.USDC}",
  USDT: "${TOKEN_ADDRESSES.mainnet.USDT}",` : ""}
};

export const AGENT_METADATA = {
  name: "${config.projectName}",
  version: "0.1.0",
  agentType: "defi",
  framework: "starknet-agentic",
  capabilities: ["swap", "monitor", "identity"],
};
`;
}

function generateIdentityModule(): string {
  return `/**
 * Identity Module - ERC-8004 Integration
 *
 * Provides on-chain identity and reputation for the agent.
 */

import { Contract, type RpcProvider, type Account } from "starknet";

// Minimal ABI for IdentityRegistry
const IDENTITY_REGISTRY_ABI = [
  {
    type: "interface",
    name: "IIdentityRegistry",
    items: [
      {
        type: "function",
        name: "get_metadata",
        inputs: [
          { name: "token_id", type: "core::integer::u256" },
          { name: "key", type: "core::byte_array::ByteArray" },
        ],
        outputs: [{ type: "core::byte_array::ByteArray" }],
        state_mutability: "view",
      },
      {
        type: "function",
        name: "set_metadata",
        inputs: [
          { name: "token_id", type: "core::integer::u256" },
          { name: "key", type: "core::byte_array::ByteArray" },
          { name: "value", type: "core::byte_array::ByteArray" },
        ],
        outputs: [],
        state_mutability: "external",
      },
    ],
  },
];

export interface AgentIdentity {
  tokenId: bigint;
  name: string;
  agentType: string;
  version: string;
}

export class IdentityClient {
  private contract: Contract;

  constructor(
    registryAddress: string,
    providerOrAccount: RpcProvider | Account
  ) {
    this.contract = new Contract({
      abi: IDENTITY_REGISTRY_ABI,
      address: registryAddress,
      providerOrAccount,
    });
  }

  /**
   * Get agent metadata by token ID
   */
  async getMetadata(tokenId: bigint, key: string): Promise<string> {
    try {
      const result = await this.contract.get_metadata(tokenId, key);
      return String(result);
    } catch {
      return "";
    }
  }

  /**
   * Get full agent identity
   */
  async getIdentity(tokenId: bigint): Promise<AgentIdentity | null> {
    try {
      const [name, agentType, version] = await Promise.all([
        this.getMetadata(tokenId, "agentName"),
        this.getMetadata(tokenId, "agentType"),
        this.getMetadata(tokenId, "version"),
      ]);

      return { tokenId, name, agentType, version };
    } catch {
      return null;
    }
  }
}
`;
}

function generateFullAgent(config: ProjectConfig): string {
  return `/**
 * ${config.projectName} - Full Agent
 *
 * Complete agent with:
 * - Wallet operations
 * - DeFi via AVNU
 * - On-chain identity (ERC-8004)
 * - A2A protocol ready
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Account, RpcProvider, Contract } from "starknet";
import { getQuotes, executeSwap, type QuoteRequest } from "@avnu/avnu-sdk";
import { CONFIG, TOKENS, AGENT_METADATA } from "./config.js";
import { IdentityClient, type AgentIdentity } from "./identity.js";
import { formatAmount, sleep } from "./utils.js";

// Load .env
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

// ERC20 ABI
const ERC20_ABI = [
  {
    type: "interface",
    name: "openzeppelin::token::erc20::interface::IERC20",
    items: [
      {
        type: "function",
        name: "balance_of",
        inputs: [{ name: "account", type: "core::starknet::contract_address::ContractAddress" }],
        outputs: [{ type: "core::integer::u256" }],
        state_mutability: "view",
      },
    ],
  },
];

class FullAgent {
  private provider: RpcProvider;
  private account: Account;
  private identityClient: IdentityClient | null = null;
  private identity: AgentIdentity | null = null;
  private isRunning = false;

  constructor() {
    this.provider = new RpcProvider({ nodeUrl: CONFIG.RPC_URL });
    this.account = new Account({
      provider: this.provider,
      address: CONFIG.ACCOUNT_ADDRESS,
      signer: CONFIG.PRIVATE_KEY,
    });

    // Initialize identity client if registry configured
    if (CONFIG.IDENTITY_REGISTRY_ADDRESS) {
      this.identityClient = new IdentityClient(
        CONFIG.IDENTITY_REGISTRY_ADDRESS,
        this.provider
      );
    }
  }

  get address(): string {
    return this.account.address;
  }

  /**
   * Start the agent
   */
  async start() {
    console.log("Full Agent Starting...");
    console.log(\`Address: \${this.address}\`);
    console.log(\`Agent: \${AGENT_METADATA.name} v\${AGENT_METADATA.version}\`);

    await this.checkBalances();

    if (this.identityClient) {
      await this.loadIdentity();
    }

    this.isRunning = true;
    console.log(\`\\nAgent ready. Monitoring every \${CONFIG.CHECK_INTERVAL_MS / 1000}s\\n\`);

    this.monitorLoop();
  }

  /**
   * Stop the agent
   */
  stop() {
    this.isRunning = false;
    console.log("Agent stopped");
  }

  /**
   * Load on-chain identity
   */
  private async loadIdentity() {
    if (!this.identityClient) return;

    console.log("Loading on-chain identity...");
    // In a real implementation, you'd look up the token ID for this address
    // For now, we just note that identity is available
    console.log("  Identity system available (configure IDENTITY_REGISTRY_ADDRESS)");
  }

  /**
   * Check wallet balances
   */
  private async checkBalances() {
    const ethContract = new Contract({
      abi: ERC20_ABI,
      address: TOKENS.ETH,
      providerOrAccount: this.provider,
    });

    const balance = await ethContract.balance_of(this.address);
    const balanceBigInt = typeof balance === "bigint" ? balance : BigInt(balance);
    console.log(\`ETH Balance: \${formatAmount(balanceBigInt, 18)} ETH\`);
  }

  /**
   * Main monitoring loop
   */
  private async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.runCycle();
      } catch (error) {
        console.error("Cycle error:", error);
      }
      await sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  /**
   * Run one agent cycle
   */
  private async runCycle() {
    const now = new Date().toLocaleTimeString();
    console.log(\`[\${now}] Running cycle...\`);

    // Check market conditions
    await this.checkMarket();

    // Additional logic can go here:
    // - Process incoming A2A messages
    // - Update reputation
    // - Execute strategies
  }

  /**
   * Check market conditions
   */
  private async checkMarket() {
    try {
      const quoteRequest: QuoteRequest = {
        sellTokenAddress: TOKENS.ETH,
        buyTokenAddress: TOKENS.STRK,
        sellAmount: BigInt(10 ** 16),
        takerAddress: this.address,
      };

      const quotes = await getQuotes(quoteRequest, {
        baseUrl: CONFIG.AVNU_BASE_URL,
      });

      if (quotes.length > 0) {
        const buyAmount = BigInt(quotes[0].buyAmount);
        console.log(\`  ETH/STRK: 0.01 ETH -> \${formatAmount(buyAmount, 18)} STRK\`);
      }
    } catch (error) {
      console.error("Market check error:", error);
    }
  }

  /**
   * Execute a swap
   */
  async swap(
    sellToken: string,
    buyToken: string,
    sellAmount: bigint
  ): Promise<string | null> {
    try {
      const quoteRequest: QuoteRequest = {
        sellTokenAddress: sellToken,
        buyTokenAddress: buyToken,
        sellAmount,
        takerAddress: this.address,
      };

      const quotes = await getQuotes(quoteRequest, {
        baseUrl: CONFIG.AVNU_BASE_URL,
      });

      if (quotes.length === 0) {
        console.error("No quotes available");
        return null;
      }

      const result = await executeSwap({
        provider: this.account,
        quote: quotes[0],
        slippage: CONFIG.MAX_SLIPPAGE,
        executeApprove: true,
      });

      return result.transactionHash;
    } catch (error) {
      console.error("Swap error:", error);
      return null;
    }
  }

  /**
   * Get agent info for A2A
   */
  getAgentCard() {
    return {
      name: AGENT_METADATA.name,
      version: AGENT_METADATA.version,
      capabilities: AGENT_METADATA.capabilities,
      address: this.address,
      identity: this.identity,
    };
  }
}

async function main() {
  if (!CONFIG.ACCOUNT_ADDRESS || !CONFIG.PRIVATE_KEY) {
    console.error("Missing environment variables!");
    console.error("Please configure .env with STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY");
    process.exit(1);
  }

  const agent = new FullAgent();

  process.on("SIGINT", () => {
    console.log("\\nShutting down...");
    agent.stop();
    process.exit(0);
  });

  await agent.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

export default FullAgent;
`;
}
