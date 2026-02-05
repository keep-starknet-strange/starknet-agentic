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
 * - starknet_deploy_agent_account: Deploy agent account via factory (ERC-8004 linked)
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
  CallData,
  cairo,
  ETransactionVersion,
  num,
  byteArray,
  hash,
  type Call,
  type PaymasterDetails,
} from "starknet";
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
import { SessionKeySigner } from "./helpers/sessionKeySigner.js";

// Environment validation
const envSchema = z.object({
  STARKNET_RPC_URL: z.string().url(),
  STARKNET_ACCOUNT_ADDRESS: z.string().startsWith("0x"),
  STARKNET_PRIVATE_KEY: z.string().startsWith("0x"),
  STARKNET_SESSION_PRIVATE_KEY: z.string().startsWith("0x").optional(),
  STARKNET_SESSION_PUBLIC_KEY: z.string().startsWith("0x").optional(),
  STARKNET_SIGNER: z.enum(["owner", "session"]).optional(),
  STARKNET_AGENT_ACCOUNT_FACTORY: z.string().startsWith("0x").optional(),
  AVNU_BASE_URL: z.string().url().optional(),
  AVNU_PAYMASTER_URL: z.string().url().optional(),
  AVNU_PAYMASTER_API_KEY: z.string().optional(),
});

const env = envSchema.parse({
  STARKNET_RPC_URL: process.env.STARKNET_RPC_URL,
  STARKNET_ACCOUNT_ADDRESS: process.env.STARKNET_ACCOUNT_ADDRESS,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  STARKNET_SESSION_PRIVATE_KEY: process.env.STARKNET_SESSION_PRIVATE_KEY,
  STARKNET_SESSION_PUBLIC_KEY: process.env.STARKNET_SESSION_PUBLIC_KEY,
  STARKNET_SIGNER: process.env.STARKNET_SIGNER as "owner" | "session" | undefined,
  STARKNET_AGENT_ACCOUNT_FACTORY: process.env.STARKNET_AGENT_ACCOUNT_FACTORY,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || "https://starknet.api.avnu.fi",
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || "https://starknet.paymaster.avnu.fi",
  AVNU_PAYMASTER_API_KEY: process.env.AVNU_PAYMASTER_API_KEY,
});

// Initialize Starknet provider and account
const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL, batch: 0 });
const account = new Account({
  provider,
  address: env.STARKNET_ACCOUNT_ADDRESS,
  signer: env.STARKNET_PRIVATE_KEY,
  transactionVersion: ETransactionVersion.V3,
});

const hasSessionSigner =
  !!env.STARKNET_SESSION_PRIVATE_KEY && !!env.STARKNET_SESSION_PUBLIC_KEY;
const sessionPublicKey = hasSessionSigner
  ? num.toHex(env.STARKNET_SESSION_PUBLIC_KEY as string)
  : null;
const sessionAccount = hasSessionSigner
  ? new Account({
      provider,
      address: env.STARKNET_ACCOUNT_ADDRESS,
      signer: new SessionKeySigner(
        env.STARKNET_SESSION_PRIVATE_KEY as string,
        sessionPublicKey as string
      ),
      transactionVersion: ETransactionVersion.V3,
    })
  : null;

const defaultSignerMode =
  env.STARKNET_SIGNER || (sessionAccount ? "session" : "owner");

function getAccount(signerMode?: "owner" | "session"): Account {
  const mode = signerMode || (defaultSignerMode as "owner" | "session");
  if (mode === "session") {
    if (!sessionAccount) {
      throw new Error("Session signer not configured");
    }
    return sessionAccount;
  }
  return account;
}

// Fee mode: sponsored (gasfree, dApp pays) vs default (user pays in gasToken)
const isSponsored = !!env.AVNU_PAYMASTER_API_KEY;

// Initialize TokenService with avnu base URL and RPC provider for on-chain fallback
getTokenService(env.AVNU_BASE_URL);
configureTokenServiceProvider(provider);

/**
 * Execute transaction with optional gasfree mode.
 * - gasfree=false: standard account.execute
 * - gasfree=true + API key: sponsored mode (dApp pays all gas)
 * - gasfree=true + no API key: user pays gas in gasToken
 */
async function executeTransaction(
  calls: Call | Call[],
  gasfree: boolean,
  gasToken: string = TOKENS.STRK,
  signerMode?: "owner" | "session"
): Promise<string> {
  const txAccount = getAccount(signerMode);
  if (!gasfree) {
    const result = await txAccount.execute(calls);
    return result.transaction_hash;
  }

  const callsArray = Array.isArray(calls) ? calls : [calls];
  const feeDetails: PaymasterDetails = isSponsored
    ? { feeMode: { mode: "sponsored" } }
    : { feeMode: { mode: "default", gasToken } };

  const estimation = await txAccount.estimatePaymasterTransactionFee(callsArray, feeDetails);
  const result = await txAccount.executePaymasterTransaction(
    callsArray,
    feeDetails,
    estimation.suggested_max_fee_in_gas_token
  );

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
        signer: {
          type: "string",
          enum: ["owner", "session"],
          description: "Signer to use (defaults to STARKNET_SIGNER or session if configured)",
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
        signer: {
          type: "string",
          enum: ["owner", "session"],
          description: "Signer to use (defaults to STARKNET_SIGNER or session if configured)",
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
        signer: {
          type: "string",
          enum: ["owner", "session"],
          description: "Signer to use (defaults to STARKNET_SIGNER or session if configured)",
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
        signer: {
          type: "string",
          enum: ["owner", "session"],
          description: "Signer to use (defaults to STARKNET_SIGNER or session if configured)",
        },
      },
      required: ["contractAddress", "entrypoint"],
    },
  },
  {
    name: "starknet_deploy_agent_account",
    description:
      "Deploy an AgentAccount via the factory and register an ERC-8004 identity token. Defaults to STARKNET_AGENT_ACCOUNT_FACTORY.",
    inputSchema: {
      type: "object",
      properties: {
        publicKey: {
          type: "string",
          description: "Owner public key for the new account (felt252 hex)",
        },
        salt: {
          type: "string",
          description: "Salt for deterministic deployment (felt252 hex). Defaults to 0.",
        },
        tokenUri: {
          type: "string",
          description: "ERC-8004 token URI (string). Defaults to empty string.",
        },
        factoryAddress: {
          type: "string",
          description: "AgentAccountFactory address (defaults to STARKNET_AGENT_ACCOUNT_FACTORY)",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
        signer: {
          type: "string",
          enum: ["owner", "session"],
          description: "Signer to use (defaults to STARKNET_SIGNER or session if configured)",
        },
        gasToken: {
          type: "string",
          description: "Token to pay gas fees in (symbol or address). Only used when gasfree=true and no API key is set.",
        },
      },
      required: ["publicKey"],
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
        const { recipient, token, amount, gasfree = false, gasToken, signer } = args as {
          recipient: string;
          token: string;
          amount: string;
          gasfree?: boolean;
          gasToken?: string;
          signer?: "owner" | "session";
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

        const transactionHash = await executeTransaction(
          transferCall,
          gasfree,
          gasTokenAddress,
          signer
        );
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
        const {
          contractAddress,
          entrypoint,
          calldata = [],
          gasfree = false,
          gasToken,
          signer,
        } = args as {
          contractAddress: string;
          entrypoint: string;
          calldata?: string[];
          gasfree?: boolean;
          gasToken?: string;
          signer?: "owner" | "session";
        };

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
        const invokeCall: Call = { contractAddress, entrypoint, calldata };

        const transactionHash = await executeTransaction(
          invokeCall,
          gasfree,
          gasTokenAddress,
          signer
        );
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
        const {
          sellToken,
          buyToken,
          amount,
          slippage = 0.01,
          gasfree = false,
          gasToken,
          signer,
        } = args as {
          sellToken: string;
          buyToken: string;
          amount: string;
          slippage?: number;
          gasfree?: boolean;
          gasToken?: string;
          signer?: "owner" | "session";
        };

        // Validate slippage is within reasonable bounds
        if (slippage < 0 || slippage > 0.5) {
          throw new Error("Slippage must be between 0 and 0.5 (50%). Recommended: 0.005-0.03.");
        }

        const txAccount = getAccount(signer);
        const [sellTokenAddress, buyTokenAddress] = await Promise.all([
          resolveTokenAddressAsync(sellToken),
          resolveTokenAddressAsync(buyToken),
        ]);
        const sellAmount = await parseAmount(amount, sellTokenAddress);

        const quoteParams: QuoteRequest = {
          sellTokenAddress,
          buyTokenAddress,
          sellAmount,
          takerAddress: txAccount.address,
        };

        const quotes = await getQuotes(quoteParams, { baseUrl: env.AVNU_BASE_URL });
        if (!quotes || quotes.length === 0) {
          throw new Error("No quotes available for this swap");
        }

        const bestQuote = quotes[0];

        const { calls } = await quoteToCalls({
          quoteId: bestQuote.quoteId,
          takerAddress: txAccount.address,
          slippage,
          executeApprove: true,
        }, { baseUrl: env.AVNU_BASE_URL });

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : sellTokenAddress;
        const transactionHash = await executeTransaction(
          calls,
          gasfree,
          gasTokenAddress,
          signer
        );
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
        const { contractAddress, entrypoint, calldata = [], signer } = args as {
          contractAddress: string;
          entrypoint: string;
          calldata?: string[];
          signer?: "owner" | "session";
        };

        const feeAccount = getAccount(signer);
        const fee = await feeAccount.estimateInvokeFee({
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

      case "starknet_deploy_agent_account": {
        const {
          publicKey,
          salt,
          tokenUri = "",
          factoryAddress,
          gasfree = false,
          gasToken,
          signer,
        } = args as {
          publicKey: string;
          salt?: string;
          tokenUri?: string;
          factoryAddress?: string;
          gasfree?: boolean;
          gasToken?: string;
          signer?: "owner" | "session";
        };

        const factory = factoryAddress || env.STARKNET_AGENT_ACCOUNT_FACTORY;
        if (!factory) {
          throw new Error(
            "AgentAccount factory not configured. Set STARKNET_AGENT_ACCOUNT_FACTORY or pass factoryAddress."
          );
        }

        const publicKeyHex = num.toHex(publicKey);
        const saltHex = num.toHex(salt || "0x0");
        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;

        const deployCall: Call = {
          contractAddress: factory,
          entrypoint: "deploy_account",
          calldata: CallData.compile({
            public_key: publicKeyHex,
            salt: saltHex,
            token_uri: byteArray.byteArrayFromString(tokenUri),
          }),
        };

        const transactionHash = await executeTransaction(
          deployCall,
          gasfree,
          gasTokenAddress,
          signer
        );
        const receipt = await provider.waitForTransaction(transactionHash);

        const events = (receipt as { events?: unknown[] }).events || [];
        const accountDeployedKey = hash.getSelectorFromName("AccountDeployed");
        const factoryHex = num.toHex(factory);
        const deployedEvent = events.find((event) => {
          const typedEvent = event as {
            from_address?: unknown;
            fromAddress?: unknown;
            keys?: unknown[];
          };
          const fromAddress = typedEvent.from_address ?? typedEvent.fromAddress;
          if (!fromAddress) {
            return false;
          }
          if (num.toHex(fromAddress) !== factoryHex) {
            return false;
          }
          const keys = typedEvent.keys || [];
          if (keys.length === 0) {
            return false;
          }
          return num.toHex(keys[0] as string) === accountDeployedKey;
        });

        let accountAddress: string | null = null;
        let agentId: string | null = null;
        if (deployedEvent) {
          const data = (deployedEvent as { data?: unknown[] }).data || [];
          if (data.length >= 5) {
            accountAddress = num.toHex(data[0] as string);
            const low = BigInt(data[2] as string);
            const high = BigInt(data[3] as string);
            agentId = (low + (high << 128n)).toString();
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
                accountAddress,
                agentId,
                factory,
                publicKey: publicKeyHex,
                salt: saltHex,
                tokenUri,
                gasfree,
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
