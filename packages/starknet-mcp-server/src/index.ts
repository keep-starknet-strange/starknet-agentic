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
  PaymasterRpc,
  CallData,
  cairo,
  byteArray,
  ETransactionVersion,
  type Call,
} from "starknet";
import { randomBytes } from "node:crypto";
import {
  resolveTokenAddressAsync,
  validateTokensInputAsync,
} from "./utils.js";
import { getTokenService, configureTokenServiceProvider, TOKENS } from "./services/index.js";
import {
  fetchTokenBalance,
  fetchTokenBalances,
} from "./helpers/balance.js";
import {
  getQuotes,
  quoteToCalls,
  type QuoteRequest,
} from "@avnu/avnu-sdk";
import { z } from "zod";
import { createStarknetPaymentSignatureHeader } from "@starknet-agentic/x402-starknet";
import { formatAmount, formatQuoteFields, formatErrorMessage } from "./utils/formatter.js";

// Environment validation
const envSchema = z.object({
  STARKNET_RPC_URL: z.string().url(),
  STARKNET_ACCOUNT_ADDRESS: z.string().startsWith("0x"),
  STARKNET_PRIVATE_KEY: z.string().startsWith("0x"),
  AVNU_BASE_URL: z.string().url().optional(),
  AVNU_PAYMASTER_URL: z.string().url().optional(),
  AVNU_PAYMASTER_API_KEY: z.string().optional(),
  AGENT_ACCOUNT_FACTORY_ADDRESS: z.string().startsWith("0x").optional(),
});

const isSepoliaRpc = (process.env.STARKNET_RPC_URL || "").toLowerCase().includes("sepolia");
const defaultAvnuApiUrl = isSepoliaRpc
  ? "https://sepolia.api.avnu.fi"
  : "https://starknet.api.avnu.fi";
const defaultAvnuPaymasterUrl = isSepoliaRpc
  ? "https://sepolia.paymaster.avnu.fi"
  : "https://starknet.paymaster.avnu.fi";

const env = envSchema.parse({
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || defaultAvnuApiUrl,
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || defaultAvnuPaymasterUrl,
  AVNU_PAYMASTER_API_KEY: process.env.AVNU_PAYMASTER_API_KEY,
  AGENT_ACCOUNT_FACTORY_ADDRESS: process.env.AGENT_ACCOUNT_FACTORY_ADDRESS,
});

// Initialize Starknet provider and account
const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL, batch: 0 });
const account = new Account({
  provider,
  address: env.STARKNET_ACCOUNT_ADDRESS,
  signer: env.STARKNET_PRIVATE_KEY,
  transactionVersion: ETransactionVersion.V3,
});

// Fee mode: sponsored (gasfree, dApp pays) vs default (user pays in gasToken)
const isSponsored = !!env.AVNU_PAYMASTER_API_KEY;
const paymaster = new PaymasterRpc({
  nodeUrl: env.AVNU_PAYMASTER_URL,
  headers: env.AVNU_PAYMASTER_API_KEY
    ? { "x-paymaster-api-key": env.AVNU_PAYMASTER_API_KEY }
    : {},
});

// Initialize TokenService with avnu base URL and RPC provider for on-chain fallback
getTokenService(env.AVNU_BASE_URL);
configureTokenServiceProvider(provider);

function parseFelt(name: string, value: string): bigint {
  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new Error(`${name} must be a valid felt`);
  }
  if (parsed < 0n) {
    throw new Error(`${name} must be non-negative`);
  }
  return parsed;
}

function randomSaltFelt(): string {
  const random = BigInt(`0x${randomBytes(32).toString("hex")}`);
  // Starknet felts are field elements; keep value in 251-bit range.
  return `0x${BigInt.asUintN(251, random).toString(16)}`;
}

function parseDeployResultFromReceipt(
  receipt: unknown,
  factoryAddress: string
): { accountAddress: string | null; agentId: string | null } {
  const events = (receipt as { events?: Array<{ from_address?: string; data?: string[] }> })?.events;
  if (!events) {
    return { accountAddress: null, agentId: null };
  }

  const factory = factoryAddress.toLowerCase();
  for (const event of events) {
    const from = event.from_address?.toLowerCase();
    const data = event.data;
    if (from !== factory || !data || data.length < 4) {
      continue;
    }

    try {
      const accountAddress = data[0];
      const agentIdLow = BigInt(data[2]);
      const agentIdHigh = BigInt(data[3]);
      const agentId = (agentIdLow + (agentIdHigh << 128n)).toString();
      return { accountAddress, agentId };
    } catch {
      continue;
    }
  }

  return { accountAddress: null, agentId: null };
}

/**
 * Execute transaction with optional gasfree mode.
 * - gasfree=false: standard account.execute
 * - gasfree=true + API key: sponsored mode (dApp pays all gas)
 * - gasfree=true + no API key: user pays gas in gasToken
 */
async function executeTransaction(
  calls: Call | Call[],
  gasfree: boolean,
  gasToken: string = TOKENS.STRK
): Promise<string> {
  if (!gasfree) {
    const result = await account.execute(calls);
    return result.transaction_hash;
  }

  const callsArray = Array.isArray(calls) ? calls : [calls];
  const paymasterParams = isSponsored
    ? {
        version: "0x1" as const,
        feeMode: { mode: "sponsored" as const },
      }
    : {
        version: "0x1" as const,
        feeMode: { mode: "default" as const, gasToken },
      };

  const result = await account.execute(callsArray, {
    paymaster: {
      provider: paymaster,
      params: paymasterParams,
    },
  } as never);

  return result.transaction_hash;
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
  {
    name: "x402_starknet_sign_payment_required",
    description:
      "Sign a base64 PAYMENT-REQUIRED header containing Starknet typedData, return a base64 PAYMENT-SIGNATURE header value.",
    inputSchema: {
      type: "object",
      properties: {
        paymentRequiredHeader: {
          type: "string",
          description: "Base64 JSON from PAYMENT-REQUIRED header",
        },
        rpcUrl: {
          type: "string",
          description: "Starknet RPC URL (defaults to STARKNET_RPC_URL env var)",
        },
        accountAddress: {
          type: "string",
          description:
            "Starknet account address (defaults to STARKNET_ACCOUNT_ADDRESS env var)",
        },
        privateKey: {
          type: "string",
          description: "Starknet private key (defaults to STARKNET_PRIVATE_KEY env var)",
        },
      },
      required: ["paymentRequiredHeader"],
    },
  },
];

if (env.AGENT_ACCOUNT_FACTORY_ADDRESS) {
  tools.push({
    name: "starknet_deploy_agent_account",
    description:
      "Deploy a new agent account via AgentAccountFactory. Requires caller-supplied public_key (no server-side key generation).",
    inputSchema: {
      type: "object",
      properties: {
        public_key: {
          type: "string",
          description: "Stark public key (felt, 0x-prefixed recommended)",
        },
        token_uri: {
          type: "string",
          description: "Token URI to register identity metadata",
        },
        salt: {
          type: "string",
          description: "Optional deploy salt felt. Random if omitted.",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
      },
      required: ["public_key", "token_uri"],
    },
  });
}


async function parseAmount(
  amount: string,
  tokenAddress: string
): Promise<bigint> {
  const tokenService = getTokenService();
  const decimals = await tokenService.getDecimalsAsync(tokenAddress);

  // Handle decimal amounts
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0");
  const amountStr = whole + paddedFraction.slice(0, decimals);

  return BigInt(amountStr);
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

        const tokenAddress = await resolveTokenAddressAsync(token);
        const { balance, decimals } = await fetchTokenBalance(address, tokenAddress, provider);

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

        const tokenAddresses = await validateTokensInputAsync(tokens);
        const { balances, method } = await fetchTokenBalances(address, tokens, tokenAddresses, provider);

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
        const { recipient, token, amount, gasfree = false, gasToken } = args as {
          recipient: string;
          token: string;
          amount: string;
          gasfree?: boolean;
          gasToken?: string;
        };

        const tokenAddress = await resolveTokenAddressAsync(token);
        const amountWei = await parseAmount(amount, tokenAddress);
        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;

        const transferCall: Call = {
          contractAddress: tokenAddress,
          entrypoint: "transfer",
          calldata: CallData.compile({
            recipient,
            amount: cairo.uint256(amountWei),
          }),
        };

        const transactionHash = await executeTransaction(transferCall, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
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
                result: Array.isArray(result) ? result : (result as Record<string, unknown>).result ?? result,
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

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
        const invokeCall: Call = { contractAddress, entrypoint, calldata };

        const transactionHash = await executeTransaction(invokeCall, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
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

        // Validate slippage is within reasonable bounds
        if (slippage < 0 || slippage > 0.5) {
          throw new Error("Slippage must be between 0 and 0.5 (50%). Recommended: 0.005-0.03.");
        }

        const [sellTokenAddress, buyTokenAddress] = await Promise.all([
          resolveTokenAddressAsync(sellToken),
          resolveTokenAddressAsync(buyToken),
        ]);
        const sellAmount = await parseAmount(amount, sellTokenAddress);

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

        const { calls } = await quoteToCalls({
          quoteId: bestQuote.quoteId,
          takerAddress: account.address,
          slippage,
          executeApprove: true,
        }, { baseUrl: env.AVNU_BASE_URL });

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : sellTokenAddress;
        const transactionHash = await executeTransaction(calls, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash);

        const tokenService = getTokenService();
        const buyDecimals = await tokenService.getDecimalsAsync(buyTokenAddress);
        const quoteFields = formatQuoteFields(bestQuote, buyDecimals);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
                sellToken,
                buyToken,
                sellAmount: amount,
                ...quoteFields,
                buyAmountInUsd: bestQuote.buyAmountInUsd?.toFixed(2),
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

        const [sellTokenAddress, buyTokenAddress] = await Promise.all([
          resolveTokenAddressAsync(sellToken),
          resolveTokenAddressAsync(buyToken),
        ]);
        const sellAmount = await parseAmount(amount, sellTokenAddress);

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

        const tokenService = getTokenService();
        const buyDecimals = await tokenService.getDecimalsAsync(buyTokenAddress);
        const quoteFields = formatQuoteFields(bestQuote, buyDecimals);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                sellToken,
                buyToken,
                sellAmount: amount,
                ...quoteFields,
                sellAmountInUsd: bestQuote.sellAmountInUsd?.toFixed(2),
                buyAmountInUsd: bestQuote.buyAmountInUsd?.toFixed(2),
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

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                overallFee: formatAmount(BigInt(fee.overall_fee.toString()), 18),
                resourceBounds: fee.resourceBounds,
                unit: fee.unit || "STRK",
              }, null, 2),
            },
          ],
        };
      }

      case "x402_starknet_sign_payment_required": {
        const {
          paymentRequiredHeader,
          rpcUrl = env.STARKNET_RPC_URL,
          accountAddress = env.STARKNET_ACCOUNT_ADDRESS,
          privateKey = env.STARKNET_PRIVATE_KEY,
        } = args as {
          paymentRequiredHeader: string;
          rpcUrl?: string;
          accountAddress?: string;
          privateKey?: string;
        };

        const { headerValue, payload } = await createStarknetPaymentSignatureHeader({
          paymentRequiredHeader,
          rpcUrl,
          accountAddress,
          privateKey,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  paymentSignatureHeader: headerValue,
                  payload,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "starknet_deploy_agent_account": {
        if (!env.AGENT_ACCOUNT_FACTORY_ADDRESS) {
          throw new Error("AGENT_ACCOUNT_FACTORY_ADDRESS not configured");
        }

        const { public_key, token_uri, salt, gasfree = false } = args as {
          public_key: string;
          token_uri: string;
          salt?: string;
          gasfree?: boolean;
        };

        if (!public_key || typeof public_key !== "string") {
          throw new Error("public_key is required");
        }
        if (!token_uri || typeof token_uri !== "string") {
          throw new Error("token_uri is required");
        }

        const parsedPublicKey = parseFelt("public_key", public_key);
        if (parsedPublicKey === 0n) {
          throw new Error("public_key must be non-zero felt");
        }
        const parsedSalt = parseFelt("salt", salt || randomSaltFelt());

        const deployCall: Call = {
          contractAddress: env.AGENT_ACCOUNT_FACTORY_ADDRESS,
          entrypoint: "deploy_account",
          calldata: CallData.compile({
            public_key: `0x${parsedPublicKey.toString(16)}`,
            salt: `0x${parsedSalt.toString(16)}`,
            token_uri: byteArray.byteArrayFromString(token_uri),
          }),
        };

        const transactionHash = await executeTransaction(deployCall, gasfree);
        const receipt = await provider.waitForTransaction(transactionHash);
        const { accountAddress, agentId } = parseDeployResultFromReceipt(
          receipt,
          env.AGENT_ACCOUNT_FACTORY_ADDRESS
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
                factoryAddress: env.AGENT_ACCOUNT_FACTORY_ADDRESS,
                publicKey: `0x${parsedPublicKey.toString(16)}`,
                salt: `0x${parsedSalt.toString(16)}`,
                accountAddress,
                agentId,
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
    const userMessage = formatErrorMessage(errorMessage);

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
