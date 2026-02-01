#!/usr/bin/env node

/**
 * Starknet MCP Server
 *
 * Exposes Starknet operations as MCP tools for AI agents.
 * Works with any MCP-compatible client: Claude, ChatGPT, Cursor, OpenClaw.
 *
 * Tools:
 * - starknet_get_balance: Check token balances
 * - starknet_transfer: Send tokens
 * - starknet_call_contract: Read contract state
 * - starknet_invoke_contract: Write to contracts
 * - starknet_swap: Execute swaps via AVNU
 * - starknet_get_quote: Get swap quotes
 * - starknet_register_agent: Register agent identity (ERC-8004)
 *
 * Usage:
 *   STARKNET_RPC_URL=... STARKNET_ACCOUNT_ADDRESS=... STARKNET_PRIVATE_KEY=... node dist/index.js
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  Account,
  RpcProvider,
  Contract,
  constants,
  CallData,
  uint256,
  cairo,
} from "starknet";
import {
  getQuotes,
  executeSwap,
  QuoteRequest,
  fetchTokenPrices,
} from "@avnu/avnu-sdk";
import { z } from "zod";

// Environment validation
const envSchema = z.object({
  STARKNET_RPC_URL: z.string().url(),
  STARKNET_ACCOUNT_ADDRESS: z.string().startsWith("0x"),
  STARKNET_PRIVATE_KEY: z.string().startsWith("0x"),
  AVNU_BASE_URL: z.string().url().optional(),
});

const env = envSchema.parse({
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "https://starknet.api.avnu.fi",
});

// Token addresses (Mainnet)
const TOKENS = {
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
  USDT: "0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8",
};

// ERC20 ABI (minimal)
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "felt" }],
    outputs: [{ name: "balance", type: "Uint256" }],
    stateMutability: "view",
  },
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "recipient", type: "felt" },
      { name: "amount", type: "Uint256" },
    ],
    outputs: [{ name: "success", type: "felt" }],
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "decimals", type: "felt" }],
    stateMutability: "view",
  },
];

// Initialize Starknet provider and account
const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL });
const account = new Account(
  provider,
  env.STARKNET_ACCOUNT_ADDRESS,
  env.STARKNET_PRIVATE_KEY,
  undefined,
  constants.TRANSACTION_VERSION.V3
);

// MCP Server setup
const server = new Server(
  {
    name: "starknet-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools: Tool[] = [
  {
    name: "starknet_get_balance",
    description:
      "Get token balance for an address on Starknet. Supports ETH, STRK, USDC, USDT, or any token address.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The address to check balance for (defaults to agent's address)",
        },
        token: {
          type: "string",
          description: "Token symbol (ETH, STRK, USDC, USDT) or contract address",
        },
      },
      required: ["token"],
    },
  },
  {
    name: "starknet_transfer",
    description: "Transfer tokens to another address on Starknet",
    inputSchema: {
      type: "object",
      properties: {
        recipient: {
          type: "string",
          description: "Recipient address (must start with 0x)",
        },
        token: {
          type: "string",
          description: "Token symbol (ETH, STRK, USDC, USDT) or contract address",
        },
        amount: {
          type: "string",
          description: "Amount to transfer in human-readable format (e.g., '1.5' for 1.5 tokens)",
        },
      },
      required: ["recipient", "token", "amount"],
    },
  },
  {
    name: "starknet_call_contract",
    description: "Call a read-only contract function on Starknet",
    inputSchema: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "Contract address",
        },
        entrypoint: {
          type: "string",
          description: "Function name to call",
        },
        calldata: {
          type: "array",
          items: { type: "string" },
          description: "Function arguments as array of strings",
          default: [],
        },
      },
      required: ["contractAddress", "entrypoint"],
    },
  },
  {
    name: "starknet_invoke_contract",
    description: "Invoke a state-changing contract function on Starknet",
    inputSchema: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "Contract address",
        },
        entrypoint: {
          type: "string",
          description: "Function name to call",
        },
        calldata: {
          type: "array",
          items: { type: "string" },
          description: "Function arguments as array of strings",
          default: [],
        },
      },
      required: ["contractAddress", "entrypoint"],
    },
  },
  {
    name: "starknet_swap",
    description:
      "Execute a token swap on Starknet using AVNU aggregator for best prices",
    inputSchema: {
      type: "object",
      properties: {
        sellToken: {
          type: "string",
          description: "Token to sell (symbol or address)",
        },
        buyToken: {
          type: "string",
          description: "Token to buy (symbol or address)",
        },
        amount: {
          type: "string",
          description: "Amount to sell in human-readable format",
        },
        slippage: {
          type: "number",
          description: "Maximum slippage tolerance (0.01 = 1%)",
          default: 0.01,
        },
      },
      required: ["sellToken", "buyToken", "amount"],
    },
  },
  {
    name: "starknet_get_quote",
    description: "Get swap quote without executing the trade",
    inputSchema: {
      type: "object",
      properties: {
        sellToken: {
          type: "string",
          description: "Token to sell (symbol or address)",
        },
        buyToken: {
          type: "string",
          description: "Token to buy (symbol or address)",
        },
        amount: {
          type: "string",
          description: "Amount to sell in human-readable format",
        },
      },
      required: ["sellToken", "buyToken", "amount"],
    },
  },
  {
    name: "starknet_estimate_fee",
    description: "Estimate transaction fee for a contract call",
    inputSchema: {
      type: "object",
      properties: {
        contractAddress: {
          type: "string",
          description: "Contract address",
        },
        entrypoint: {
          type: "string",
          description: "Function name",
        },
        calldata: {
          type: "array",
          items: { type: "string" },
          description: "Function arguments",
          default: [],
        },
      },
      required: ["contractAddress", "entrypoint"],
    },
  },
];

// Helper: Resolve token address from symbol
function resolveTokenAddress(token: string): string {
  const upperToken = token.toUpperCase();
  if (upperToken in TOKENS) {
    return TOKENS[upperToken as keyof typeof TOKENS];
  }
  if (token.startsWith("0x")) {
    return token;
  }
  throw new Error(`Unknown token: ${token}`);
}

// Helper: Parse amount with decimals
async function parseAmount(
  amount: string,
  tokenAddress: string
): Promise<bigint> {
  const contract = new Contract(ERC20_ABI, tokenAddress, provider);
  const decimals = await contract.decimals();
  const decimalsBigInt = BigInt(decimals.toString());

  // Handle decimal amounts
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(Number(decimalsBigInt), "0");
  const amountStr = whole + paddedFraction.slice(0, Number(decimalsBigInt));

  return BigInt(amountStr);
}

// Helper: Format amount with decimals
function formatAmount(amount: bigint, decimals: number): string {
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals) || "0";
  const fraction = amountStr.slice(-decimals);
  return `${whole}.${fraction}`.replace(/\.?0+$/, "");
}

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "starknet_get_balance": {
        const { address = env.STARKNET_ACCOUNT_ADDRESS, token } = args as {
          address?: string;
          token: string;
        };

        const tokenAddress = resolveTokenAddress(token);
        const contract = new Contract(ERC20_ABI, tokenAddress, provider);

        const balance = await contract.balanceOf(address);
        const decimals = await contract.decimals();

        const balanceBigInt = uint256.uint256ToBN(balance);
        const formattedBalance = formatAmount(balanceBigInt, Number(decimals));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                address,
                token,
                balance: formattedBalance,
                raw: balanceBigInt.toString(),
                decimals: Number(decimals),
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_transfer": {
        const { recipient, token, amount } = args as {
          recipient: string;
          token: string;
          amount: string;
        };

        const tokenAddress = resolveTokenAddress(token);
        const amountWei = await parseAmount(amount, tokenAddress);

        const { transaction_hash } = await account.execute({
          contractAddress: tokenAddress,
          entrypoint: "transfer",
          calldata: CallData.compile({
            recipient,
            amount: uint256.bnToUint256(amountWei),
          }),
        });

        await provider.waitForTransaction(transaction_hash);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash: transaction_hash,
                recipient,
                token,
                amount,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_call_contract": {
        const { contractAddress, entrypoint, calldata = [] } = args as {
          contractAddress: string;
          entrypoint: string;
          calldata?: string[];
        };

        const result = await provider.callContract({
          contractAddress,
          entrypoint,
          calldata,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                result: result.result,
                contractAddress,
                entrypoint,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_invoke_contract": {
        const { contractAddress, entrypoint, calldata = [] } = args as {
          contractAddress: string;
          entrypoint: string;
          calldata?: string[];
        };

        const { transaction_hash } = await account.execute({
          contractAddress,
          entrypoint,
          calldata,
        });

        await provider.waitForTransaction(transaction_hash);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash: transaction_hash,
                contractAddress,
                entrypoint,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_swap": {
        const { sellToken, buyToken, amount, slippage = 0.01 } = args as {
          sellToken: string;
          buyToken: string;
          amount: string;
          slippage?: number;
        };

        const sellTokenAddress = resolveTokenAddress(sellToken);
        const buyTokenAddress = resolveTokenAddress(buyToken);
        const sellAmount = await parseAmount(amount, sellTokenAddress);

        const quoteRequest: QuoteRequest = {
          sellTokenAddress,
          buyTokenAddress,
          sellAmount,
          takerAddress: account.address,
        };

        const quotes = await getQuotes(quoteRequest, {
          baseUrl: env.AVNU_BASE_URL,
        });

        if (quotes.length === 0) {
          throw new Error("No quotes available for this swap");
        }

        const bestQuote = quotes[0];

        const result = await executeSwap({
          provider: account,
          quote: bestQuote,
          slippage,
          executeApprove: true,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash: result.transactionHash,
                sellToken,
                buyToken,
                sellAmount: amount,
                buyAmount: formatAmount(
                  BigInt(bestQuote.buyAmount),
                  18
                ),
                slippage,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_get_quote": {
        const { sellToken, buyToken, amount } = args as {
          sellToken: string;
          buyToken: string;
          amount: string;
        };

        const sellTokenAddress = resolveTokenAddress(sellToken);
        const buyTokenAddress = resolveTokenAddress(buyToken);
        const sellAmount = await parseAmount(amount, sellTokenAddress);

        const quoteRequest: QuoteRequest = {
          sellTokenAddress,
          buyTokenAddress,
          sellAmount,
          takerAddress: account.address,
        };

        const quotes = await getQuotes(quoteRequest, {
          baseUrl: env.AVNU_BASE_URL,
        });

        if (quotes.length === 0) {
          throw new Error("No quotes available");
        }

        const bestQuote = quotes[0];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                sellToken,
                buyToken,
                sellAmount: amount,
                buyAmount: formatAmount(BigInt(bestQuote.buyAmount), 18),
                priceImpact: bestQuote.priceRatioUsd,
                gasEstimate: bestQuote.gasEstimate,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_estimate_fee": {
        const { contractAddress, entrypoint, calldata = [] } = args as {
          contractAddress: string;
          entrypoint: string;
          calldata?: string[];
        };

        const fee = await account.estimateInvokeFee({
          contractAddress,
          entrypoint,
          calldata,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                overallFee: formatAmount(
                  BigInt(fee.overall_fee.toString()),
                  18
                ),
                gasPrice: fee.gas_price?.toString(),
                gasUsed: fee.gas_consumed?.toString(),
                unit: "STRK",
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: errorMessage,
            tool: name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Starknet MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
