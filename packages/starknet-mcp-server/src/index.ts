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
 * - starknet_swap: Execute swaps via avnu
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
  CallData,
  cairo,
  uint256,
  PaymasterRpc,
  ETransactionVersion,
  type Call,
  type PaymasterDetails,
} from "starknet";
import {
  getQuotes,
  quoteToCalls,
  type Quote,
  type QuoteRequest,
  type Route,
} from "@avnu/avnu-sdk";
import { z } from "zod";

// Environment validation
const envSchema = z.object({
  STARKNET_RPC_URL: z.string().url(),
  STARKNET_ACCOUNT_ADDRESS: z.string().startsWith("0x"),
  STARKNET_PRIVATE_KEY: z.string().startsWith("0x"),
  AVNU_BASE_URL: z.string().url().optional(),
  AVNU_PAYMASTER_URL: z.string().url().optional(),
  AVNU_PAYMASTER_API_KEY: z.string().optional(),
});

const env = envSchema.parse({
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "https://starknet.api.avnu.fi",
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || "https://starknet.paymaster.avnu.fi",
  AVNU_PAYMASTER_API_KEY: process.env.AVNU_PAYMASTER_API_KEY,
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

// Initialize Starknet provider and account (starknet.js v8 uses options object)
const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL });
const account = new Account({
  provider,
  address: env.STARKNET_ACCOUNT_ADDRESS,
  signer: env.STARKNET_PRIVATE_KEY,
  transactionVersion: ETransactionVersion.V3,
});

// Global Paymaster configuration
// - If AVNU_PAYMASTER_API_KEY is set, use sponsored (gasfree) mode where dApp pays gas
// - Otherwise, use default mode where user pays gas in the specified token
const paymasterRpc = new PaymasterRpc({
  nodeUrl: env.AVNU_PAYMASTER_URL,
  ...(env.AVNU_PAYMASTER_API_KEY && {
    headers: { "x-paymaster-api-key": env.AVNU_PAYMASTER_API_KEY },
  }),
});

// Fee mode: sponsored (gasfree, dApp pays) vs default (user pays in gasToken)
const isSponsored = !!env.AVNU_PAYMASTER_API_KEY;

// Gasfree execution options
interface GasfreeOptions {
  gasToken?: string; // Token address for fee payment (only used in default mode)
}

/**
 * Execute calls with paymaster (gasfree mode).
 * - In sponsored mode: dApp pays all gas fees (requires AVNU_PAYMASTER_API_KEY)
 * - In default mode: user pays gas in the specified token
 */
async function executeWithPaymaster(
  calls: Call | Call[],
  options: GasfreeOptions = {}
): Promise<{ transaction_hash: string }> {
  const callsArray = Array.isArray(calls) ? calls : [calls];

  const feeDetails: PaymasterDetails = isSponsored
    ? { feeMode: { mode: "sponsored" } }
    : { feeMode: { mode: "default", gasToken: options.gasToken || TOKENS.STRK } };

  // Estimate fees
  const estimation = await account.estimatePaymasterTransactionFee(callsArray, feeDetails);

  // Execute with paymaster
  const result = await account.executePaymasterTransaction(
    callsArray,
    feeDetails,
    estimation.suggested_max_fee_in_gas_token
  );

  return { transaction_hash: result.transaction_hash };
}

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
    description: "Transfer tokens to another address on Starknet. Supports gasfree mode where gas is paid in an ERC-20 token instead of ETH/STRK.",
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
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
        gasToken: {
          type: "string",
          description: "Token to pay gas fees in (symbol or address). Only used when gasfree=true and no API key is set.",
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
    description: "Invoke a state-changing contract function on Starknet. Supports gasfree mode where gas is paid in an ERC-20 token instead of ETH/STRK.",
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
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
        gasToken: {
          type: "string",
          description: "Token to pay gas fees in (symbol or address). Only used when gasfree=true and no API key is set.",
        },
      },
      required: ["contractAddress", "entrypoint"],
    },
  },
  {
    name: "starknet_swap",
    description:
      "Execute a token swap on Starknet using avnu aggregator for best prices. Supports gasfree mode where gas is paid via paymaster.",
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
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
        gasToken: {
          type: "string",
          description: "Token to pay gas fees in (symbol or address). Defaults to sellToken. Only used when gasfree=true and no API key is set.",
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
  const contract = new Contract({ abi: ERC20_ABI, address: tokenAddress, providerOrAccount: provider });
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
        const contract = new Contract({ abi: ERC20_ABI, address: tokenAddress, providerOrAccount: provider });

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
        const { recipient, token, amount, gasfree = false, gasToken } = args as {
          recipient: string;
          token: string;
          amount: string;
          gasfree?: boolean;
          gasToken?: string;
        };

        const tokenAddress = resolveTokenAddress(token);
        const amountWei = await parseAmount(amount, tokenAddress);

        const transferCall: Call = {
          contractAddress: tokenAddress,
          entrypoint: "transfer",
          calldata: CallData.compile({
            recipient,
            amount: cairo.uint256(amountWei),
          }),
        };

        let transaction_hash: string;
        if (gasfree) {
          const gasTokenAddress = gasToken ? resolveTokenAddress(gasToken) : TOKENS.STRK;
          const result = await executeWithPaymaster(transferCall, { gasToken: gasTokenAddress });
          transaction_hash = result.transaction_hash;
        } else {
          const result = await account.execute(transferCall);
          transaction_hash = result.transaction_hash;
        }

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
                gasfree,
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
                result: Array.isArray(result) ? result : (result as any).result,
                contractAddress,
                entrypoint,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_invoke_contract": {
        const { contractAddress, entrypoint, calldata = [], gasfree = false, gasToken } = args as {
          contractAddress: string;
          entrypoint: string;
          calldata?: string[];
          gasfree?: boolean;
          gasToken?: string;
        };

        const invokeCall: Call = {
          contractAddress,
          entrypoint,
          calldata,
        };

        let transaction_hash: string;
        if (gasfree) {
          const gasTokenAddress = gasToken ? resolveTokenAddress(gasToken) : TOKENS.STRK;
          const result = await executeWithPaymaster(invokeCall, { gasToken: gasTokenAddress });
          transaction_hash = result.transaction_hash;
        } else {
          const result = await account.execute(invokeCall);
          transaction_hash = result.transaction_hash;
        }

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
                gasfree,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_swap": {
        const { sellToken, buyToken, amount, slippage = 0.01, gasfree = false, gasToken } = args as {
          sellToken: string;
          buyToken: string;
          amount: string;
          slippage?: number;
          gasfree?: boolean;
          gasToken?: string;
        };

        const sellTokenAddress = resolveTokenAddress(sellToken);
        const buyTokenAddress = resolveTokenAddress(buyToken);
        const sellAmount = await parseAmount(amount, sellTokenAddress);

        // SDK v4: getQuotes takes QuoteRequest object
        const quoteParams: QuoteRequest = {
          sellTokenAddress,
          buyTokenAddress,
          sellAmount,
          takerAddress: account.address,
        };

        const quotes = await getQuotes(quoteParams, { baseUrl: env.AVNU_BASE_URL });

        if (!quotes || quotes.length === 0) {
          throw new Error("No quotes available for this swap");
        }

        const bestQuote = quotes[0];

        // Build calls from quote (includes approve + swap calls)
        const { calls } = await quoteToCalls({
          quoteId: bestQuote.quoteId,
          takerAddress: account.address,
          slippage,
          executeApprove: true,
        }, { baseUrl: env.AVNU_BASE_URL });

        // Execute: gasfree mode uses paymaster, otherwise regular execute
        let transaction_hash: string;
        if (gasfree) {
          const gasTokenAddress = gasToken ? resolveTokenAddress(gasToken) : sellTokenAddress;
          const result = await executeWithPaymaster(calls, { gasToken: gasTokenAddress });
          transaction_hash = result.transaction_hash;
        } else {
          const result = await account.execute(calls);
          transaction_hash = result.transaction_hash;
        }

        await provider.waitForTransaction(transaction_hash);

        // Get buyToken decimals for proper formatting
        const buyTokenContract = new Contract({ abi: ERC20_ABI, address: buyTokenAddress, providerOrAccount: provider });
        const buyDecimals = await buyTokenContract.decimals();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash: transaction_hash,
                sellToken,
                buyToken,
                sellAmount: amount,
                buyAmount: formatAmount(BigInt(bestQuote.buyAmount), Number(buyDecimals)),
                buyAmountInUsd: bestQuote.buyAmountInUsd?.toFixed(2),
                priceImpact: bestQuote.priceImpact
                  ? `${(bestQuote.priceImpact / 100).toFixed(2)}%`
                  : undefined,
                gasFeesUsd: bestQuote.gasFeesInUsd?.toFixed(4),
                routes: bestQuote.routes?.map((r: Route) => ({
                  name: r.name,
                  percent: `${(r.percent * 100).toFixed(1)}%`,
                })),
                slippage,
                gasfree,
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

        // SDK v4: getQuotes takes QuoteRequest object
        const quoteParams: QuoteRequest = {
          sellTokenAddress,
          buyTokenAddress,
          sellAmount,
          takerAddress: account.address,
        };

        const quotes = await getQuotes(quoteParams, { baseUrl: env.AVNU_BASE_URL });

        if (!quotes || quotes.length === 0) {
          throw new Error("No quotes available");
        }

        const bestQuote = quotes[0];

        // Get buyToken decimals for proper formatting
        const buyTokenContract = new Contract({ abi: ERC20_ABI, address: buyTokenAddress, providerOrAccount: provider });
        const buyDecimals = await buyTokenContract.decimals();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                sellToken,
                buyToken,
                sellAmount: amount,
                buyAmount: formatAmount(BigInt(bestQuote.buyAmount), Number(buyDecimals)),
                sellAmountInUsd: bestQuote.sellAmountInUsd?.toFixed(2),
                buyAmountInUsd: bestQuote.buyAmountInUsd?.toFixed(2),
                priceImpact: bestQuote.priceImpact
                  ? `${(bestQuote.priceImpact / 100).toFixed(2)}%`
                  : undefined,
                gasFeesUsd: bestQuote.gasFeesInUsd?.toFixed(4),
                routes: bestQuote.routes?.map((r: Route) => ({
                  name: r.name,
                  percent: `${(r.percent * 100).toFixed(1)}%`,
                })),
                quoteId: bestQuote.quoteId,
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

        // starknet.js v8: EstimateFeeResponseOverhead has overall_fee, resourceBounds, unit
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                overallFee: formatAmount(
                  BigInt(fee.overall_fee.toString()),
                  18
                ),
                resourceBounds: fee.resourceBounds,
                unit: fee.unit || "STRK",
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

    // avnu-specific error handling with user-friendly messages
    let userMessage = errorMessage;
    if (errorMessage.includes("INSUFFICIENT_LIQUIDITY") || errorMessage.includes("insufficient liquidity")) {
      userMessage = "Insufficient liquidity for this swap. Try a smaller amount or different token pair.";
    } else if (errorMessage.includes("SLIPPAGE") || errorMessage.includes("slippage") || errorMessage.includes("Insufficient tokens received")) {
      userMessage = "Slippage exceeded. Try increasing slippage tolerance.";
    } else if (errorMessage.includes("QUOTE_EXPIRED") || errorMessage.includes("quote expired")) {
      userMessage = "Quote expired. Please retry the operation.";
    } else if (errorMessage.includes("INSUFFICIENT_BALANCE") || errorMessage.includes("insufficient balance")) {
      userMessage = "Insufficient token balance for this operation.";
    } else if (errorMessage.includes("No quotes available")) {
      userMessage = "No swap routes available for this token pair. The pair may not have liquidity.";
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: userMessage,
            originalError: errorMessage !== userMessage ? errorMessage : undefined,
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
