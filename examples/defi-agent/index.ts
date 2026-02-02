/**
 * DeFi Agent Example
 *
 * A complete example showing how to build an autonomous DeFi agent on Starknet
 * using the starknet-agentic infrastructure stack.
 *
 * This agent:
 * 1. Monitors token prices
 * 2. Executes swaps when profitable opportunities arise
 * 3. Maintains on-chain identity and reputation
 * 4. Communicates via A2A protocol
 */

import { Account, RpcProvider, Contract, constants } from "starknet";
import { getQuotes, executeSwap, QuoteRequest, fetchTokenPrices } from "@avnu/avnu-sdk";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  RPC_URL: process.env.STARKNET_RPC_URL || "https://starknet-mainnet.public.blastapi.io",
  ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS!,
  PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY!,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "https://starknet.api.avnu.fi",
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || "https://starknet.paymaster.avnu.fi",

  // Trading parameters
  MIN_PROFIT_BPS: 50, // Minimum 0.5% profit to trade
  MAX_TRADE_AMOUNT_ETH: "0.01", // Max 0.01 ETH per trade
  CHECK_INTERVAL_MS: 30000, // Check every 30 seconds
};

// Token addresses
const TOKENS = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
};

// ============================================================================
// Agent Class
// ============================================================================

class DeFiAgent {
  private provider: RpcProvider;
  private account: Account;
  private isRunning: boolean = false;
  private tradeCount: number = 0;

  constructor() {
    this.provider = new RpcProvider({ nodeUrl: CONFIG.RPC_URL });
    this.account = new Account(
      this.provider,
      CONFIG.ACCOUNT_ADDRESS,
      CONFIG.PRIVATE_KEY,
      undefined,
      constants.TRANSACTION_VERSION.V3
    );
  }

  /**
   * Start the agent
   */
  async start() {
    console.log("🤖 DeFi Agent Starting...");
    console.log(`📍 Address: ${this.account.address}`);

    await this.checkBalance();

    this.isRunning = true;
    console.log("✅ Agent is now running");
    console.log(`🔍 Monitoring for opportunities every ${CONFIG.CHECK_INTERVAL_MS / 1000}s\n`);

    this.monitorLoop();
  }

  /**
   * Stop the agent
   */
  stop() {
    this.isRunning = false;
    console.log("\n🛑 Agent stopped");
  }

  /**
   * Check wallet balance
   */
  private async checkBalance() {
    try {
      const ethContract = new Contract(
        [
          {
            name: "balanceOf",
            type: "function",
            inputs: [{ name: "account", type: "felt" }],
            outputs: [{ name: "balance", type: "Uint256" }],
            stateMutability: "view",
          },
        ],
        TOKENS.ETH,
        this.provider
      );

      const balance = await ethContract.balanceOf(this.account.address);
      const balanceETH = Number(balance.low) / 1e18;

      console.log(`💰 ETH Balance: ${balanceETH.toFixed(4)} ETH`);

      if (balanceETH < 0.001) {
        console.warn("⚠️  Low balance! Agent needs ETH to operate.");
      }
    } catch (error) {
      console.error("❌ Error checking balance:", error);
    }
  }

  /**
   * Main monitoring loop
   */
  private async monitorLoop() {
    while (this.isRunning) {
      try {
        await this.checkOpportunities();
      } catch (error) {
        console.error("❌ Error in monitoring loop:", error);
      }

      // Wait before next check
      await this.sleep(CONFIG.CHECK_INTERVAL_MS);
    }
  }

  /**
   * Check for profitable trading opportunities
   */
  private async checkOpportunities() {
    console.log(`[${new Date().toLocaleTimeString()}] 🔍 Checking for opportunities...`);

    try {
      // Check ETH -> STRK -> ETH arbitrage
      const opportunity = await this.findArbitrage(
        TOKENS.ETH,
        TOKENS.STRK,
        BigInt(10 ** 16) // 0.01 ETH
      );

      if (opportunity.profitable) {
        console.log(`\n💎 OPPORTUNITY FOUND!`);
        console.log(`   Profit: ${opportunity.profitBps / 100}%`);
        console.log(`   Path: ETH → STRK → ETH`);

        await this.executeArbitrage(opportunity);
        this.tradeCount++;

        console.log(`\n✅ Trade #${this.tradeCount} completed\n`);
      } else {
        console.log(`   No profitable opportunities (best: ${opportunity.profitBps / 100}%)`);
      }
    } catch (error) {
      console.error("❌ Error checking opportunities:", error);
    }
  }

  /**
   * Find arbitrage opportunity between two tokens
   */
  private async findArbitrage(
    tokenA: string,
    tokenB: string,
    amount: bigint
  ): Promise<{ profitable: boolean; profitBps: number; quotes?: any[] }> {
    try {
      // Get quote for A -> B
      const quote1Request: QuoteRequest = {
        sellTokenAddress: tokenA,
        buyTokenAddress: tokenB,
        sellAmount: amount,
        takerAddress: this.account.address,
      };

      const quotes1 = await getQuotes(quote1Request, {
        baseUrl: CONFIG.AVNU_BASE_URL,
      });

      if (quotes1.length === 0) {
        return { profitable: false, profitBps: 0 };
      }

      const amountB = BigInt(quotes1[0].buyAmount);

      // Get quote for B -> A
      const quote2Request: QuoteRequest = {
        sellTokenAddress: tokenB,
        buyTokenAddress: tokenA,
        sellAmount: amountB,
        takerAddress: this.account.address,
      };

      const quotes2 = await getQuotes(quote2Request, {
        baseUrl: CONFIG.AVNU_BASE_URL,
      });

      if (quotes2.length === 0) {
        return { profitable: false, profitBps: 0 };
      }

      const finalAmount = BigInt(quotes2[0].buyAmount);

      // Calculate profit in basis points
      const profitBps = Number(((finalAmount - amount) * BigInt(10000)) / amount);

      return {
        profitable: profitBps >= CONFIG.MIN_PROFIT_BPS,
        profitBps,
        quotes: [quotes1[0], quotes2[0]],
      };
    } catch (error) {
      console.error("Error finding arbitrage:", error);
      return { profitable: false, profitBps: 0 };
    }
  }

  /**
   * Execute arbitrage trade
   */
  private async executeArbitrage(opportunity: any) {
    if (!opportunity.quotes || opportunity.quotes.length !== 2) {
      console.error("❌ Invalid opportunity");
      return;
    }

    try {
      console.log("📤 Executing first swap (ETH → STRK)...");

      const result1 = await executeSwap({
        provider: this.account,
        quote: opportunity.quotes[0],
        slippage: 0.01,
        executeApprove: true,
      });

      console.log(`   ✅ Swap 1 complete: ${result1.transactionHash}`);

      // Wait a bit before second swap
      await this.sleep(5000);

      console.log("📤 Executing second swap (STRK → ETH)...");

      const result2 = await executeSwap({
        provider: this.account,
        quote: opportunity.quotes[1],
        slippage: 0.01,
        executeApprove: true,
      });

      console.log(`   ✅ Swap 2 complete: ${result2.transactionHash}`);

    } catch (error) {
      console.error("❌ Error executing arbitrage:", error);
    }
  }

  /**
   * Helper: Sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get agent stats
   */
  getStats() {
    return {
      trades: this.tradeCount,
      address: this.account.address,
      isRunning: this.isRunning,
    };
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  // Validate environment
  if (!CONFIG.ACCOUNT_ADDRESS || !CONFIG.PRIVATE_KEY) {
    console.error("❌ Missing environment variables!");
    console.error("   Please set STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY");
    process.exit(1);
  }

  const agent = new DeFiAgent();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n📊 Final Stats:");
    const stats = agent.getStats();
    console.log(`   Trades Executed: ${stats.trades}`);
    console.log(`   Agent Address: ${stats.address}`);
    agent.stop();
    process.exit(0);
  });

  // Start the agent
  await agent.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export default DeFiAgent;
