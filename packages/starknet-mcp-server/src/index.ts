#!/usr/bin/env node

/**
 * Starknet MCP Server
 *
 * Exposes Starknet operations as MCP tools for AI agents.
 * Works with any MCP-compatible client: Claude, ChatGPT, Cursor, OpenClaw.
 *
 * Tools:
 * - starknet_get_balance: Check single token balance
 * - starknet_get_balances: Check multiple token balances (batch, single RPC call)
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
  PaymasterRpc,
  ETransactionVersion,
} from "starknet";
import {
  TOKENS,
  MAX_BATCH_TOKENS,
  resolveTokenAddress,
  formatAmount,
  normalizeAddress,
  getCachedDecimals,
} from "./utils.js";
import {
  getQuotes,
  executeSwap,
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
});

const env = envSchema.parse({
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "https://starknet.api.avnu.fi",
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || "https://starknet.paymaster.avnu.fi",
});


// BalanceChecker contract (batch balance queries in single RPC call)
const BALANCE_CHECKER_ADDRESS = "0x031ce64a666fbf9a2b1b2ca51c2af60d9a76d3b85e5fbfb9d5a8dbd3fedc9716";

// BalanceChecker ABI (with struct definitions for proper parsing)
const BALANCE_CHECKER_ABI = [
  {
    type: "struct",
    name: "core::integer::u256",
    members: [
      { name: "low", type: "core::integer::u128" },
      { name: "high", type: "core::integer::u128" },
    ],
  },
  {
    type: "struct",
    name: "governance::balance_checker::NonZeroBalance",
    members: [
      { name: "token", type: "core::starknet::contract_address::ContractAddress" },
      { name: "balance", type: "core::integer::u256" },
    ],
  },
  {
    type: "function",
    name: "get_balances",
    inputs: [
      { name: "address", type: "core::starknet::contract_address::ContractAddress" },
      { name: "tokens", type: "core::array::Span::<core::starknet::contract_address::ContractAddress>" },
    ],
    outputs: [
      { type: "core::array::Span::<governance::balance_checker::NonZeroBalance>" },
    ],
    state_mutability: "view",
  },
];

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
      "Get token balance for an address on Starknet. Supports ETH, STRK, USDC, USDT, or any token address. For multiple tokens, use starknet_get_balances instead.",
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
    name: "starknet_get_balances",
    description:
      "Get multiple token balances for an address in a single RPC call. More efficient than calling starknet_get_balance multiple times. Supports ETH, STRK, USDC, USDT, or any token addresses.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "The address to check balances for (defaults to agent's address)",
        },
        tokens: {
          type: "array",
          items: { type: "string" },
          description: "Array of token symbols (ETH, STRK, USDC, USDT) or contract addresses",
        },
      },
      required: ["tokens"],
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
      "Execute a token swap on Starknet using avnu aggregator for best prices. Supports gasless mode where gas is paid in the sell token.",
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
        gasless: {
          type: "boolean",
          description: "Pay gas in sell token instead of ETH/STRK",
          default: false,
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

// Token balance result type
type TokenBalanceResult = {
  token: string;
  tokenAddress: string;
  balance: bigint;
  decimals: number;
};

type BatchBalanceResult = {
  balances: TokenBalanceResult[];
  method: "balance_checker" | "batch_rpc";
};

// Helper: Fetch single token balance
async function fetchTokenBalance(
  walletAddress: string,
  tokenAddress: string,
  rpcProvider: RpcProvider = provider
): Promise<{ balance: bigint; decimals: number }> {
  const contract = new Contract({
    abi: ERC20_ABI,
    address: tokenAddress,
    providerOrAccount: rpcProvider,
  });

  const cached = getCachedDecimals(tokenAddress);
  const [balanceResult, decimalsResult] = await Promise.all([
    contract.balanceOf(walletAddress),
    cached !== undefined ? Promise.resolve(cached) : contract.decimals(),
  ]);

  // starknet.js v6+ returns { balance: bigint } from balanceOf
  const balance = typeof balanceResult === 'bigint' ? balanceResult : balanceResult.balance;
  return {
    balance,
    decimals: Number(decimalsResult),
  };
}

// Helper: Fetch multiple token balances via batch RPC
async function fetchTokenBalancesViaBatchRpc(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[]
): Promise<TokenBalanceResult[]> {
  const batchProvider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL, batch: 0 });

  const results = await Promise.all(
    tokenAddresses.map((addr) => fetchTokenBalance(walletAddress, addr, batchProvider))
  );

  return tokens.map((token, i) => ({
    token,
    tokenAddress: tokenAddresses[i],
    balance: results[i].balance,
    decimals: results[i].decimals,
  }));
}

// Helper: Fetch multiple token balances via BalanceChecker contract
async function fetchTokenBalancesViaBalanceChecker(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[]
): Promise<TokenBalanceResult[]> {
  const balanceChecker = new Contract({
    abi: BALANCE_CHECKER_ABI,
    address: BALANCE_CHECKER_ADDRESS,
    providerOrAccount: provider,
  });

  const result = await balanceChecker.get_balances(walletAddress, tokenAddresses);

  // Parse non-zero balances from contract response
  // With proper ABI struct definitions, starknet.js converts u256 to bigint automatically
  const balanceMap = new Map<string, bigint>();
  for (const item of result) {
    const addr = normalizeAddress("0x" + BigInt(item.token).toString(16));
    balanceMap.set(addr, BigInt(item.balance));
  }

  // Fetch decimals (cached or via batch RPC)
  const batchProvider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL, batch: 0 });
  const decimalsResults = await Promise.all(
    tokenAddresses.map(async (addr) => {
      const cached = getCachedDecimals(addr);
      if (cached !== undefined) return cached;
      const contract = new Contract({ abi: ERC20_ABI, address: addr, providerOrAccount: batchProvider });
      return Number(await contract.decimals());
    })
  );

  return tokens.map((token, i) => ({
    token,
    tokenAddress: tokenAddresses[i],
    balance: balanceMap.get(normalizeAddress(tokenAddresses[i])) ?? BigInt(0),
    decimals: decimalsResults[i],
  }));
}

// Helper: Fetch multiple token balances (tries BalanceChecker, falls back to batch RPC)
async function fetchTokenBalances(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[]
): Promise<BatchBalanceResult> {
  try {
    const balances = await fetchTokenBalancesViaBalanceChecker(walletAddress, tokens, tokenAddresses);
    return { balances, method: "balance_checker" };
  } catch {
    const balances = await fetchTokenBalancesViaBatchRpc(walletAddress, tokens, tokenAddresses);
    return { balances, method: "batch_rpc" };
  }
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
        const { balance, decimals } = await fetchTokenBalance(address, tokenAddress);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                address,
                token,
                tokenAddress,
                balance: formatAmount(balance, decimals),
                raw: balance.toString(),
                decimals,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_get_balances": {
        const { address = env.STARKNET_ACCOUNT_ADDRESS, tokens } = args as {
          address?: string;
          tokens: string[];
        };

        if (!tokens || tokens.length === 0) {
          throw new Error("At least one token is required");
        }

        if (tokens.length > MAX_BATCH_TOKENS) {
          throw new Error(`Maximum ${MAX_BATCH_TOKENS} tokens per request`);
        }

        const tokenAddresses = tokens.map(resolveTokenAddress);
        const { balances, method } = await fetchTokenBalances(address, tokens, tokenAddresses);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                address,
                balances: balances.map((b) => ({
                  token: b.token,
                  tokenAddress: b.tokenAddress,
                  balance: formatAmount(b.balance, b.decimals),
                  raw: b.balance.toString(),
                  decimals: b.decimals,
                })),
                tokensQueried: tokens.length,
                method,
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
            amount: cairo.uint256(amountWei),
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
                result: Array.isArray(result) ? result : (result as any).result,
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
        const { sellToken, buyToken, amount, slippage = 0.01, gasless = false } = args as {
          sellToken: string;
          buyToken: string;
          amount: string;
          slippage?: number;
          gasless?: boolean;
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

        // SDK v4: executeSwap takes single object param
        const swapParams: Parameters<typeof executeSwap>[0] = {
          provider: account,
          quote: bestQuote,
          slippage,
          executeApprove: true,
        };

        // Gasless mode using PaymasterRpc
        if (gasless) {
          const paymaster = new PaymasterRpc({ nodeUrl: env.AVNU_PAYMASTER_URL });
          swapParams.paymaster = {
            active: true,
            provider: paymaster,
            params: {
              version: "0x1" as const,
              feeMode: { mode: "default", gasToken: sellTokenAddress },
            },
          };
        }

        const result = await executeSwap(swapParams);

        // Get buyToken decimals for proper formatting
        const buyTokenContract = new Contract({ abi: ERC20_ABI, address: buyTokenAddress, providerOrAccount: provider });
        const buyDecimals = await buyTokenContract.decimals();

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
                gasless,
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
