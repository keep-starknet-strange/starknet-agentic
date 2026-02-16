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
 * - starknet_build_calls: Build unsigned calls for external signing (Controller, multisig)
 * - starknet_register_session_key: Register session key on SessionAccount
 * - starknet_revoke_session_key: Revoke a session key
 * - starknet_get_session_data: Read session key data (remaining calls, expiry, etc.)
 * - starknet_build_transfer_calls: Build unsigned ERC-20 transfer calls
 * - starknet_build_swap_calls: Build unsigned AVNU swap calls (approval + route)
 * - starknet_register_agent: Register agent identity (ERC-8004)
 * - starknet_set_agent_metadata: Set on-chain metadata for an ERC-8004 agent
 * - starknet_get_agent_metadata: Read on-chain metadata for an ERC-8004 agent
 *
 * Usage:
 *   STARKNET_RPC_URL=... STARKNET_ACCOUNT_ADDRESS=... STARKNET_PRIVATE_KEY=... node dist/index.js
 *   STARKNET_RPC_URL=... STARKNET_ACCOUNT_ADDRESS=... STARKNET_SIGNER_MODE=proxy KEYRING_PROXY_URL=... KEYRING_HMAC_SECRET=... node dist/index.js
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
  hash,
  ec,
  validateAndParseAddress,
  type Call,
} from "starknet";
import { randomBytes } from "node:crypto";
import {
  resolveTokenAddressAsync,
  validateTokensInputAsync,
} from "./utils.js";
import { getTokenService, configureTokenServiceProvider, TOKENS, STATIC_TOKENS } from "./services/index.js";
import {
  fetchTokenBalance,
  fetchTokenBalances,
} from "./helpers/balance.js";
import {
  getVTokenAddress,
  buildDepositCalls,
  buildWithdrawCalls,
  VESU_PRIME_POOL,
} from "./helpers/vesu.js";
import { uint256 } from "starknet";
import {
  getQuotes,
  quoteToCalls,
  type QuoteRequest,
} from "@avnu/avnu-sdk";
import { z } from "zod";
import { createStarknetPaymentSignatureHeader } from "@starknet-agentic/x402-starknet";
import { formatAmount, formatQuoteFields, formatErrorMessage } from "./utils/formatter.js";
import { PolicyGuard, loadPolicyConfig } from "./middleware/policyGuard.js";
import { KeyringProxySigner } from "./helpers/keyringProxySigner.js";
import { parseDecimalToBigInt } from "./helpers/parseDecimal.js";
import { log } from "./logger.js";

// Environment validation
const envSchema = z.object({
  STARKNET_RPC_URL: z.string().url(),
  STARKNET_ACCOUNT_ADDRESS: z.string().startsWith("0x"),
  STARKNET_SIGNER_MODE: z.enum(["direct", "proxy"]).optional(),
  STARKNET_PRIVATE_KEY: z.string().startsWith("0x").optional(),
  AVNU_BASE_URL: z.string().url().optional(),
  AVNU_PAYMASTER_URL: z.string().url().optional(),
  AVNU_PAYMASTER_API_KEY: z.string().optional(),
  AGENT_ACCOUNT_FACTORY_ADDRESS: z.string().startsWith("0x").optional(),
  ERC8004_IDENTITY_REGISTRY_ADDRESS: z.string().startsWith("0x").optional(),
  KEYRING_PROXY_URL: z.string().url().optional(),
  KEYRING_HMAC_SECRET: z.string().min(1).optional(),
  KEYRING_CLIENT_ID: z.string().min(1).optional(),
  KEYRING_SIGNING_KEY_ID: z.string().min(1).optional(),
  KEYRING_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  KEYRING_SESSION_VALIDITY_SECONDS: z.coerce.number().int().positive().optional(),
  KEYRING_TLS_CLIENT_CERT_PATH: z.string().min(1).optional(),
  KEYRING_TLS_CLIENT_KEY_PATH: z.string().min(1).optional(),
  KEYRING_TLS_CA_PATH: z.string().min(1).optional(),
  NODE_ENV: z.string().optional(),
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
  STARKNET_SIGNER_MODE: process.env.STARKNET_SIGNER_MODE,
  STARKNET_PRIVATE_KEY: process.env.STARKNET_PRIVATE_KEY,
  AVNU_BASE_URL: process.env.AVNU_BASE_URL || defaultAvnuApiUrl,
  AVNU_PAYMASTER_URL: process.env.AVNU_PAYMASTER_URL || defaultAvnuPaymasterUrl,
  AVNU_PAYMASTER_API_KEY: process.env.AVNU_PAYMASTER_API_KEY,
  AGENT_ACCOUNT_FACTORY_ADDRESS: process.env.AGENT_ACCOUNT_FACTORY_ADDRESS,
  ERC8004_IDENTITY_REGISTRY_ADDRESS: process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS,
  KEYRING_PROXY_URL: process.env.KEYRING_PROXY_URL,
  KEYRING_HMAC_SECRET: process.env.KEYRING_HMAC_SECRET,
  KEYRING_CLIENT_ID: process.env.KEYRING_CLIENT_ID,
  KEYRING_SIGNING_KEY_ID: process.env.KEYRING_SIGNING_KEY_ID,
  KEYRING_REQUEST_TIMEOUT_MS: process.env.KEYRING_REQUEST_TIMEOUT_MS,
  KEYRING_SESSION_VALIDITY_SECONDS: process.env.KEYRING_SESSION_VALIDITY_SECONDS,
  KEYRING_TLS_CLIENT_CERT_PATH: process.env.KEYRING_TLS_CLIENT_CERT_PATH,
  KEYRING_TLS_CLIENT_KEY_PATH: process.env.KEYRING_TLS_CLIENT_KEY_PATH,
  KEYRING_TLS_CA_PATH: process.env.KEYRING_TLS_CA_PATH,
  NODE_ENV: process.env.NODE_ENV,
});

const signerMode = env.STARKNET_SIGNER_MODE ?? "direct";
const runtimeEnvironment = (env.NODE_ENV || "development").toLowerCase();
const isProductionRuntime = runtimeEnvironment === "production";

if (isProductionRuntime && signerMode !== "proxy") {
  throw new Error(
    "Production mode requires STARKNET_SIGNER_MODE=proxy to prevent in-process private key signing"
  );
}

if (signerMode === "direct" && !env.STARKNET_PRIVATE_KEY) {
  throw new Error("Missing STARKNET_PRIVATE_KEY for STARKNET_SIGNER_MODE=direct");
}

if (signerMode === "proxy") {
  if (!env.KEYRING_PROXY_URL || !env.KEYRING_HMAC_SECRET) {
    throw new Error(
      "Missing keyring proxy configuration for STARKNET_SIGNER_MODE=proxy (KEYRING_PROXY_URL, KEYRING_HMAC_SECRET)"
    );
  }
  if (isProductionRuntime) {
    const proxyUrl = new URL(env.KEYRING_PROXY_URL);
    const isLoopback =
      proxyUrl.hostname === "127.0.0.1" ||
      proxyUrl.hostname === "localhost" ||
      proxyUrl.hostname === "::1" ||
      proxyUrl.hostname === "[::1]";
    if (proxyUrl.protocol !== "https:" && !isLoopback) {
      throw new Error(
        "Production proxy mode requires KEYRING_PROXY_URL to use https unless loopback is used"
      );
    }
    if (!isLoopback) {
      if (
        !env.KEYRING_TLS_CLIENT_CERT_PATH ||
        !env.KEYRING_TLS_CLIENT_KEY_PATH ||
        !env.KEYRING_TLS_CA_PATH
      ) {
        throw new Error(
          "Production proxy mode requires KEYRING_TLS_CLIENT_CERT_PATH, KEYRING_TLS_CLIENT_KEY_PATH, and KEYRING_TLS_CA_PATH for mTLS"
        );
      }
    }
  }
  if (isProductionRuntime && env.STARKNET_PRIVATE_KEY) {
    throw new Error(
      "STARKNET_PRIVATE_KEY must not be set in production when STARKNET_SIGNER_MODE=proxy"
    );
  }
}

// Enforce HTTPS for RPC URL in production to prevent eavesdropping on
// account balances, transaction details, and nonce values.
if (isProductionRuntime) {
  const rpcUrl = new URL(env.STARKNET_RPC_URL);
  const isLoopback =
    rpcUrl.hostname === "127.0.0.1" ||
    rpcUrl.hostname === "localhost" ||
    rpcUrl.hostname === "::1" ||
    rpcUrl.hostname === "[::1]";
  if (rpcUrl.protocol !== "https:" && !isLoopback) {
    throw new Error(
      "Production mode requires STARKNET_RPC_URL to use HTTPS to protect transaction data in transit."
    );
  }
}

// Initialize Starknet provider and account
const provider = new RpcProvider({ nodeUrl: env.STARKNET_RPC_URL, batch: 0 });

// Fee mode: sponsored (gasfree, dApp pays) vs default (user pays in gasToken)
const isSponsored = !!env.AVNU_PAYMASTER_API_KEY;
const paymaster = new PaymasterRpc({
  nodeUrl: env.AVNU_PAYMASTER_URL,
  headers: env.AVNU_PAYMASTER_API_KEY
    ? { "x-paymaster-api-key": env.AVNU_PAYMASTER_API_KEY }
    : {},
});

const accountSigner =
  signerMode === "proxy"
    ? new KeyringProxySigner({
        proxyUrl: env.KEYRING_PROXY_URL!,
        hmacSecret: env.KEYRING_HMAC_SECRET!,
        clientId: env.KEYRING_CLIENT_ID || "starknet-mcp-server",
        accountAddress: env.STARKNET_ACCOUNT_ADDRESS,
        requestTimeoutMs: env.KEYRING_REQUEST_TIMEOUT_MS ?? 5_000,
        sessionValiditySeconds: env.KEYRING_SESSION_VALIDITY_SECONDS ?? 300,
        keyId: env.KEYRING_SIGNING_KEY_ID,
        tlsClientCertPath: env.KEYRING_TLS_CLIENT_CERT_PATH,
        tlsClientKeyPath: env.KEYRING_TLS_CLIENT_KEY_PATH,
        tlsCaPath: env.KEYRING_TLS_CA_PATH,
      })
    : env.STARKNET_PRIVATE_KEY!;

const account = new Account({
  provider,
  address: env.STARKNET_ACCOUNT_ADDRESS,
  signer: accountSigner,
  transactionVersion: ETransactionVersion.V3,
  paymaster,
});

// Initialize TokenService with avnu base URL and RPC provider for on-chain fallback
getTokenService(env.AVNU_BASE_URL);
configureTokenServiceProvider(provider);

// Initialize preflight policy guard
const policyConfig = loadPolicyConfig();
const policyGuard = new PolicyGuard(policyConfig);

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
  // Starknet felts are field elements; in practice most calldata values should fit in 251 bits.
  // Enforce 251-bit bound to fail fast with a clear error instead of a provider/encoding failure.
  const max251 = (1n << 251n) - 1n;
  if (parsed > max251) {
    throw new Error(`${name} must fit in 251 bits`);
  }
  return parsed;
}

function parseAddress(name: string, value: string): string {
  try {
    const parsed = validateAndParseAddress(value);
    // Reject the zero address — it's never a valid target for transfers or calls.
    if (/^0x0+$/.test(parsed)) {
      throw new Error("zero address");
    }
    return parsed;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "zero address") {
      throw new Error(`${name} cannot be the zero address.`);
    }
    throw new Error(
      `${name} is not a valid Starknet address: "${value}". ` +
        "Expected a hex string starting with 0x."
    );
  }
}

const MAX_CALLDATA_LEN = 256;

function parseCalldata(name: string, calldata: string[]): string[] {
  if (!Array.isArray(calldata)) {
    throw new Error(`${name} must be an array of felts`);
  }
  if (calldata.length > MAX_CALLDATA_LEN) {
    throw new Error(`${name} too large (max ${MAX_CALLDATA_LEN} items)`);
  }

  return calldata.map((raw, i) => {
    if (typeof raw !== "string") {
      throw new Error(`${name}[${i}] must be a string felt`);
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new Error(`${name}[${i}] must be a valid felt`);
    }
    const felt = parseFelt(`${name}[${i}]`, trimmed);
    return `0x${felt.toString(16)}`;
  });
}

function validateEntrypoint(name: string, value: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required and must be non-empty`);
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`${name} contains invalid control characters`);
  }
  return value.trim();
}

// Transaction wait config: ~120 s total (40 retries x 3 s interval).
const TX_WAIT_RETRIES = 40;
const TX_WAIT_INTERVAL_MS = 3_000;

/**
 * Reject an AVNU quote whose server-provided expiry has already passed.
 * The `expiry` field is a Unix-seconds timestamp set by the AVNU router;
 * executing an expired quote will fail on-chain and waste gas.
 */
function assertQuoteNotExpired(quote: { expiry?: number | null }): void {
  if (quote.expiry != null && quote.expiry > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec >= quote.expiry) {
      throw new Error(
        `Swap quote has expired (expiry=${quote.expiry}, now=${nowSec}). ` +
          "Please request a fresh quote and retry."
      );
    }
  }
}

/** Threshold (5%) above which we flag high price impact to the AI agent. */
const HIGH_PRICE_IMPACT_THRESHOLD = 5;

function priceImpactWarning(priceImpact?: number): string | undefined {
  if (priceImpact != null && Math.abs(priceImpact) >= HIGH_PRICE_IMPACT_THRESHOLD) {
    return (
      `WARNING: Price impact is ${priceImpact.toFixed(2)}% which exceeds the ${HIGH_PRICE_IMPACT_THRESHOLD}% threshold. ` +
      "This swap may result in significant value loss. Consider reducing the amount or using a more liquid pair."
    );
  }
  return undefined;
}

// parseDecimalToBigInt imported from ./helpers/parseDecimal.js

function randomSaltFelt(): string {
  const random = BigInt(`0x${randomBytes(32).toString("hex")}`);
  // Starknet felts are field elements; keep value in 251-bit range.
  return `0x${BigInt.asUintN(251, random).toString(16)}`;
}

function parseDeployResultFromReceipt(
  receipt: unknown,
  factoryAddress: string
): { accountAddress: string | null; agentId: string | null } {
  const events =
    (receipt as { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> })
      ?.events;
  if (!events) {
    return { accountAddress: null, agentId: null };
  }

  const factory = factoryAddress.toLowerCase();
  const accountDeployedSelector = hash.getSelectorFromName("AccountDeployed").toLowerCase();
  for (const event of events) {
    const from = event.from_address?.toLowerCase();
    const keys = event.keys;
    const data = event.data;
    if (
      from !== factory ||
      !keys ||
      keys.length < 1 ||
      keys[0]?.toLowerCase() !== accountDeployedSelector ||
      !data ||
      data.length < 4
    ) {
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
  const paymasterDetails = isSponsored
    ? { feeMode: { mode: "sponsored" as const } }
    : { feeMode: { mode: "default" as const, gasToken } };

  // Prefer using starknet.js paymaster API (no unsafe casts).
  // For default fee mode, passing the suggested max fee improves reliability.
  const estimation = await account.estimatePaymasterTransactionFee(callsArray, paymasterDetails);
  const result = await account.executePaymasterTransaction(
    callsArray,
    paymasterDetails,
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
    name: "starknet_vesu_deposit",
    description:
      "Supply assets to Vesu V2 lending pool (ERC-4626). Uses Prime pool by default. Requires approve + deposit. Supports gasfree mode.",
    inputSchema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token symbol (STRK, ETH, USDC, USDT) or address",
        },
        amount: {
          type: "string",
          description: "Amount to deposit in human-readable format",
        },
        pool: {
          type: "string",
          description: "Vesu pool address. Defaults to Prime pool.",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode",
          default: false,
        },
        gasToken: {
          type: "string",
          description: "Token to pay gas in when gasfree=true",
        },
      },
      required: ["token", "amount"],
    },
  },
  {
    name: "starknet_vesu_withdraw",
    description:
      "Withdraw assets from Vesu V2 lending pool. Withdraws underlying assets (not shares). Supports gasfree mode.",
    inputSchema: {
      type: "object",
      properties: {
        token: {
          type: "string",
          description: "Token symbol (STRK, ETH, USDC, USDT) or address",
        },
        amount: {
          type: "string",
          description: "Amount of underlying assets to withdraw",
        },
        pool: {
          type: "string",
          description: "Vesu pool address. Defaults to Prime pool.",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode",
          default: false,
        },
        gasToken: {
          type: "string",
          description: "Token to pay gas in when gasfree=true",
        },
      },
      required: ["token", "amount"],
    },
  },
  {
    name: "starknet_vesu_positions",
    description:
      "Get lending positions (vToken balances and converted assets) for the agent's address in Vesu V2 pools.",
    inputSchema: {
      type: "object",
      properties: {
        tokens: {
          type: "array",
          items: { type: "string" },
          description: "Token symbols (STRK, ETH, USDC, USDT) or addresses to check",
        },
        address: {
          type: "string",
          description: "Address to check (defaults to agent's address)",
        },
        pool: {
          type: "string",
          description: "Vesu pool address. Defaults to Prime pool.",
        },
      },
      required: ["tokens"],
    },
  },
  {
    name: "starknet_build_calls",
    description:
      "Build unsigned Starknet calls without executing. Returns a JSON array of Call objects compatible with starknet.js account.execute() and Cartridge Controller. Use this when you need to compose calls for external signing (e.g., session keys, hardware wallets, multisig).",
    inputSchema: {
      type: "object",
      properties: {
        calls: {
          type: "array",
          description: "Array of call objects to build",
          items: {
            type: "object",
            properties: {
              contractAddress: {
                type: "string",
                description: "Target contract address (0x-prefixed)",
              },
              entrypoint: {
                type: "string",
                description: "Function name to call",
              },
              calldata: {
                type: "array",
                items: { type: "string" },
                description: "Function arguments as array of felt strings",
                default: [],
              },
            },
            required: ["contractAddress", "entrypoint"],
          },
        },
      },
      required: ["calls"],
    },
  },
];

if (signerMode === "direct") {
  tools.push({
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
      },
      required: ["paymentRequiredHeader"],
    },
  });
}

tools.push(
  // ── Session key management tools ────────────────────────────────────
  {
    name: "starknet_register_session_key",
    description:
      "Register a session key on a SessionAccount (chipi-pay fork). Owner-only operation. The session key gets time-limited, call-count-limited access with optional selector whitelist.",
    inputSchema: {
      type: "object",
      properties: {
        accountAddress: {
          type: "string",
          description: "SessionAccount contract address (0x-prefixed)",
        },
        sessionPublicKey: {
          type: "string",
          description: "Public key of the session key to register (felt, 0x-prefixed)",
        },
        validUntil: {
          type: "number",
          description: "Unix timestamp (seconds) when session expires",
        },
        maxCalls: {
          type: "number",
          description: "Maximum number of transactions allowed for this session",
        },
        allowedEntrypoints: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional array of allowed function selectors (felt strings). Empty = any non-admin selector on external contracts.",
          default: [],
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas)",
          default: false,
        },
      },
      required: ["accountAddress", "sessionPublicKey", "validUntil", "maxCalls"],
    },
  },
  {
    name: "starknet_revoke_session_key",
    description:
      "Revoke a session key from a SessionAccount. Owner-only. Zeroes the session data and clears allowed entrypoints.",
    inputSchema: {
      type: "object",
      properties: {
        accountAddress: {
          type: "string",
          description: "SessionAccount contract address (0x-prefixed)",
        },
        sessionPublicKey: {
          type: "string",
          description: "Public key of the session key to revoke (felt, 0x-prefixed)",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas)",
          default: false,
        },
      },
      required: ["accountAddress", "sessionPublicKey"],
    },
  },
  {
    name: "starknet_get_session_data",
    description:
      "Read session key data from a SessionAccount. Returns valid_until, max_calls, calls_used, and allowed_entrypoints_len.",
    inputSchema: {
      type: "object",
      properties: {
        accountAddress: {
          type: "string",
          description: "SessionAccount contract address (0x-prefixed)",
        },
        sessionPublicKey: {
          type: "string",
          description: "Public key of the session key to query (felt, 0x-prefixed)",
        },
      },
      required: ["accountAddress", "sessionPublicKey"],
    },
  },
  // ── Domain-specific unsigned call builders ──────────────────────────
  {
    name: "starknet_build_transfer_calls",
    description:
      "Build unsigned ERC-20 transfer calls. Returns Call[] for external signing (session key, owner, hardware wallet).",
    inputSchema: {
      type: "object",
      properties: {
        tokenAddress: {
          type: "string",
          description: "ERC-20 token contract address (0x-prefixed), or token symbol like 'ETH', 'STRK', 'USDC'",
        },
        recipientAddress: {
          type: "string",
          description: "Recipient address (0x-prefixed)",
        },
        amount: {
          type: "string",
          description: "Amount to transfer in human-readable units (e.g. '1.5' for 1.5 tokens)",
        },
      },
      required: ["tokenAddress", "recipientAddress", "amount"],
    },
  },
  {
    name: "starknet_build_swap_calls",
    description:
      "Build unsigned swap calls via AVNU. Returns approval + swap Call[] for external signing.",
    inputSchema: {
      type: "object",
      properties: {
        sellTokenAddress: {
          type: "string",
          description: "Token to sell (address or symbol like 'ETH', 'STRK')",
        },
        buyTokenAddress: {
          type: "string",
          description: "Token to buy (address or symbol)",
        },
        sellAmount: {
          type: "string",
          description: "Amount to sell in human-readable units (e.g. '0.1')",
        },
        signerAddress: {
          type: "string",
          description: "Address of the account that will sign and execute (0x-prefixed)",
        },
        slippageBps: {
          type: "number",
          description: "Slippage tolerance in basis points (default: 100 = 1%)",
          default: 100,
        },
      },
      required: ["sellTokenAddress", "buyTokenAddress", "sellAmount", "signerAddress"],
    },
  }
);

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

if (env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
  tools.push({
    name: "starknet_register_agent",
    description:
      "Register a new ERC-8004 agent identity in IdentityRegistry. Optionally provide token_uri. Returns tx hash and parsed agent_id (best-effort).",
    inputSchema: {
      type: "object",
      properties: {
        token_uri: {
          type: "string",
          description: "Optional token URI (e.g., ipfs://... or data:application/json;utf8,...)",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
      },
      required: [],
    },
  });

  tools.push({
    name: "starknet_set_agent_metadata",
    description:
      "Set on-chain metadata for an ERC-8004 agent. Caller must be owner or approved for the agent_id. Standard keys: agentName, agentType, version, model, status, framework, capabilities, a2aEndpoint, moltbookId.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent ID (u256 decimal or hex string)",
        },
        key: {
          type: "string",
          description:
            "Metadata key (e.g. 'agentName', 'capabilities'). 'agentWallet' is reserved and cannot be set here.",
        },
        value: {
          type: "string",
          description: "Metadata value to store on-chain",
        },
        gasfree: {
          type: "boolean",
          description: "Use gasfree mode (paymaster pays gas or gas paid in token)",
          default: false,
        },
      },
      required: ["agent_id", "key", "value"],
    },
  });

  tools.push({
    name: "starknet_get_agent_metadata",
    description:
      "Read on-chain metadata for an ERC-8004 agent. Returns the value stored for the given key, or empty string if not set.",
    inputSchema: {
      type: "object",
      properties: {
        agent_id: {
          type: "string",
          description: "Agent ID (u256 decimal or hex string)",
        },
        key: {
          type: "string",
          description: "Metadata key to read (e.g. 'agentName', 'capabilities')",
        },
      },
      required: ["agent_id", "key"],
    },
  });
}

function parseIdentityRegisteredFromReceipt(
  receipt: unknown,
  identityRegistryAddress: string
): { agentId: string | null } {
  const events =
    (receipt as { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> })
      ?.events;
  if (!events) {
    return { agentId: null };
  }

  const identity = identityRegistryAddress.toLowerCase();
  const registeredSelector = hash.getSelectorFromName("Registered").toLowerCase();
  for (const event of events) {
    const from = event.from_address?.toLowerCase();
    const keys = event.keys;
    if (
      from !== identity ||
      !keys ||
      keys.length < 3 ||
      keys[0]?.toLowerCase() !== registeredSelector
    ) {
      continue;
    }

    try {
      // `Registered` has `agent_id` as a #[key] u256 -> two felts in keys[1..2]
      const agentIdLow = BigInt(keys[1]);
      const agentIdHigh = BigInt(keys[2]);
      const agentId = (agentIdLow + (agentIdHigh << 128n)).toString();
      return { agentId };
    } catch {
      continue;
    }
  }

  return { agentId: null };
}


async function parseAmount(
  amount: string,
  tokenAddress: string
): Promise<bigint> {
  if (!/^\d+(\.\d+)?$/.test(amount)) {
    throw new Error(
      `Invalid amount "${amount}". Expected a non-negative decimal number (e.g. "1.5", "100").`
    );
  }

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

  // Preflight policy check (defense-in-depth, before any tool execution)
  const policyResult = policyGuard.evaluate(name, args as Record<string, unknown>);
  if (!policyResult.allowed) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: `Policy violation: ${policyResult.reason}`,
            tool: name,
          }, null, 2),
        },
      ],
      isError: true,
    };
  }

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

        const validatedRecipient = parseAddress("recipient", recipient);
        const tokenAddress = await resolveTokenAddressAsync(token);
        const amountWei = await parseAmount(amount, tokenAddress);
        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;

        const transferCall: Call = {
          contractAddress: tokenAddress,
          entrypoint: "transfer",
          calldata: CallData.compile({
            recipient: validatedRecipient,
            amount: cairo.uint256(amountWei),
          }),
        };

        const transactionHash = await executeTransaction(transferCall, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash, { retries: TX_WAIT_RETRIES, retryInterval: TX_WAIT_INTERVAL_MS });

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

        const validatedContractAddress = parseAddress("contractAddress", contractAddress);
        const validatedEntrypoint = validateEntrypoint("entrypoint", entrypoint);
        const validatedCalldata = parseCalldata("calldata", calldata);
        const result = await provider.callContract({
          contractAddress: validatedContractAddress,
          entrypoint: validatedEntrypoint,
          calldata: validatedCalldata,
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

        const validatedContractAddress = parseAddress("contractAddress", contractAddress);
        const validatedEntrypoint = validateEntrypoint("entrypoint", entrypoint);
        const validatedCalldata = parseCalldata("calldata", calldata);
        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
        const invokeCall: Call = {
          contractAddress: validatedContractAddress,
          entrypoint: validatedEntrypoint,
          calldata: validatedCalldata,
        };

        const transactionHash = await executeTransaction(invokeCall, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash, { retries: TX_WAIT_RETRIES, retryInterval: TX_WAIT_INTERVAL_MS });

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

      case "starknet_vesu_deposit": {
        const { token, amount, pool = VESU_PRIME_POOL, gasfree = false, gasToken } = args as {
          token: string;
          amount: string;
          pool?: string;
          gasfree?: boolean;
          gasToken?: string;
        };

        const poolAddress = parseAddress("pool", pool);
        const assetAddress = await resolveTokenAddressAsync(token);
        const amountWei = await parseAmount(amount, assetAddress);
        if (amountWei <= 0n) {
          throw new Error("Amount must be positive");
        }

        const vTokenAddress = await getVTokenAddress(provider, poolAddress, assetAddress);
        const calls = buildDepositCalls(
          assetAddress,
          vTokenAddress,
          amountWei,
          account.address
        );

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
        const transactionHash = await executeTransaction(calls, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash, { retries: TX_WAIT_RETRIES, retryInterval: TX_WAIT_INTERVAL_MS });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
                token,
                amount,
                pool: pool === VESU_PRIME_POOL ? "prime" : pool,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_vesu_withdraw": {
        const { token, amount, pool = VESU_PRIME_POOL, gasfree = false, gasToken } = args as {
          token: string;
          amount: string;
          pool?: string;
          gasfree?: boolean;
          gasToken?: string;
        };

        const poolAddress = parseAddress("pool", pool);
        const assetAddress = await resolveTokenAddressAsync(token);
        const amountWei = await parseAmount(amount, assetAddress);
        if (amountWei <= 0n) {
          throw new Error("Amount must be positive");
        }

        const vTokenAddress = await getVTokenAddress(provider, poolAddress, assetAddress);
        const calls = buildWithdrawCalls(
          vTokenAddress,
          amountWei,
          account.address,
          account.address
        );

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : TOKENS.STRK;
        const transactionHash = await executeTransaction(calls, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash, { retries: TX_WAIT_RETRIES, retryInterval: TX_WAIT_INTERVAL_MS });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                transactionHash,
                token,
                amount,
              }, null, 2),
            },
          ],
        };
      }

      case "starknet_vesu_positions": {
        const { tokens, address = env.STARKNET_ACCOUNT_ADDRESS, pool = VESU_PRIME_POOL } = args as {
          tokens: string[];
          address?: string;
          pool?: string;
        };

        if (!tokens || tokens.length === 0) {
          throw new Error("At least one token is required");
        }

        const poolAddress = parseAddress("pool", pool);
        const userAddress = parseAddress("address", address);
        const tokenAddresses = await validateTokensInputAsync(tokens);
        const tokenService = getTokenService();

        const positions: Array<{
          token: string;
          tokenAddress: string;
          shares: string;
          assets: string;
          decimals: number;
        }> = [];

        for (let i = 0; i < tokens.length; i++) {
          const assetAddress = tokenAddresses[i];
          const vTokenAddress = await getVTokenAddress(provider, poolAddress, assetAddress);

          const balanceRaw = await provider.callContract({
            contractAddress: vTokenAddress,
            entrypoint: "balance_of",
            calldata: [userAddress],
          });

          const balanceArr = Array.isArray(balanceRaw) ? balanceRaw : (balanceRaw as { result?: string[] }).result ?? [];
          const balanceVal = balanceArr.length >= 2
            ? { low: BigInt(balanceArr[0]), high: BigInt(balanceArr[1] ?? 0) }
            : (balanceRaw as { balance?: { low: bigint; high: bigint } })?.balance ?? { low: 0n, high: 0n };
          const shares = uint256.uint256ToBN(balanceVal);

          let assets = shares;
          if (shares > 0n) {
            const sharesU256 = cairo.uint256(shares);
            const assetsRaw = await provider.callContract({
              contractAddress: vTokenAddress,
              entrypoint: "convert_to_assets",
              calldata: [String(sharesU256.low), String(sharesU256.high)],
            });
            const assetsArr = Array.isArray(assetsRaw) ? assetsRaw : (assetsRaw as { result?: string[] }).result ?? [];
            if (assetsArr.length >= 2) {
              assets = uint256.uint256ToBN({
                low: BigInt(assetsArr[0]),
                high: BigInt(assetsArr[1] ?? 0),
              });
            }
          }

          const decimals = await tokenService.getDecimalsAsync(assetAddress);
          positions.push({
            token: tokens[i],
            tokenAddress: assetAddress,
            shares: formatAmount(shares, decimals),
            assets: formatAmount(assets, decimals),
            decimals,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                address: userAddress,
                pool: pool === VESU_PRIME_POOL ? "prime" : pool,
                positions,
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
        if (slippage < 0 || slippage > 0.15) {
          throw new Error("Slippage must be between 0 and 0.15 (15%). Recommended: 0.005-0.03.");
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
        assertQuoteNotExpired(bestQuote);

        const { calls } = await quoteToCalls({
          quoteId: bestQuote.quoteId,
          takerAddress: account.address,
          slippage,
          executeApprove: true,
        }, { baseUrl: env.AVNU_BASE_URL });

        const gasTokenAddress = gasToken ? await resolveTokenAddressAsync(gasToken) : sellTokenAddress;
        const transactionHash = await executeTransaction(calls, gasfree, gasTokenAddress);
        await provider.waitForTransaction(transactionHash, { retries: TX_WAIT_RETRIES, retryInterval: TX_WAIT_INTERVAL_MS });

        const tokenService = getTokenService();
        const buyDecimals = await tokenService.getDecimalsAsync(buyTokenAddress);
        const quoteFields = formatQuoteFields(bestQuote, buyDecimals);

        const swapPriceWarning = priceImpactWarning(bestQuote.priceImpact);

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
                ...(swapPriceWarning ? { warning: swapPriceWarning } : {}),
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
        const quotePriceWarning = priceImpactWarning(bestQuote.priceImpact);

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
                ...(quotePriceWarning ? { warning: quotePriceWarning } : {}),
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

        const validatedContractAddress = parseAddress("contractAddress", contractAddress);
        const validatedEntrypoint = validateEntrypoint("entrypoint", entrypoint);
        const validatedCalldata = parseCalldata("calldata", calldata);
        const fee = await account.estimateInvokeFee({
          contractAddress: validatedContractAddress,
          entrypoint: validatedEntrypoint,
          calldata: validatedCalldata,
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

      case "starknet_build_calls": {
        const { calls: rawCalls } = args as {
          calls: Array<{
            contractAddress: string;
            entrypoint: string;
            calldata?: string[];
          }>;
        };

        if (!rawCalls || rawCalls.length === 0) {
          throw new Error("calls array is required and must not be empty");
        }

        if (rawCalls.length > MAX_CALLDATA_LEN) {
          throw new Error(`Too many calls (${rawCalls.length}). Maximum: ${MAX_CALLDATA_LEN}`);
        }

        const validatedCalls = rawCalls.map((call, i) => {
          if (!call.contractAddress) {
            throw new Error(`calls[${i}].contractAddress is required`);
          }
          if (!call.entrypoint) {
            throw new Error(`calls[${i}].entrypoint is required`);
          }
          if (call.calldata && call.calldata.length > MAX_CALLDATA_LEN) {
            throw new Error(`calls[${i}].calldata too large (${call.calldata.length} items, max ${MAX_CALLDATA_LEN})`);
          }
          const validatedAddress = parseAddress(`calls[${i}].contractAddress`, call.contractAddress);
          const validatedEntrypoint = validateEntrypoint(`calls[${i}].entrypoint`, call.entrypoint);
          const validatedCalldata = call.calldata && call.calldata.length > 0
            ? parseCalldata(`calls[${i}].calldata`, call.calldata)
            : [];

          return {
            contractAddress: validatedAddress,
            entrypoint: validatedEntrypoint,
            calldata: validatedCalldata,
          };
        });

        // Detect exact-duplicate calls — likely an LLM hallucination or copy-paste error.
        const callKeys = validatedCalls.map(
          (c) => `${c.contractAddress}:${c.entrypoint}:${c.calldata.join(",")}`
        );
        const seen = new Set<string>();
        const duplicateIndices: number[] = [];
        for (let idx = 0; idx < callKeys.length; idx++) {
          if (seen.has(callKeys[idx])) duplicateIndices.push(idx);
          seen.add(callKeys[idx]);
        }

        const warning =
          duplicateIndices.length > 0
            ? `WARNING: Identical calls detected at indices [${duplicateIndices.join(", ")}]. ` +
              "This may indicate a duplicate request. Review carefully before signing."
            : undefined;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  calls: validatedCalls,
                  callCount: validatedCalls.length,
                  ...(warning ? { warning } : {}),
                  note: "Unsigned calls. Pass to account.execute(calls) or write to calls.json for external signing.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── Session key management handlers ────────────────────────────────
      case "starknet_register_session_key": {
        const {
          accountAddress: rawAccountAddr,
          sessionPublicKey: rawSessionKey,
          validUntil,
          maxCalls,
          allowedEntrypoints: rawEntrypoints = [],
          gasfree = false,
        } = args as {
          accountAddress: string;
          sessionPublicKey: string;
          validUntil: number;
          maxCalls: number;
          allowedEntrypoints?: string[];
          gasfree?: boolean;
        };

        const sessionAccountAddr = parseAddress("accountAddress", rawAccountAddr);
        const sessionKey = parseFelt("sessionPublicKey", rawSessionKey);

        const configuredAccount = parseAddress("STARKNET_ACCOUNT_ADDRESS", env.STARKNET_ACCOUNT_ADDRESS);
        if (sessionAccountAddr.toLowerCase() !== configuredAccount.toLowerCase()) {
          throw new Error(
            `accountAddress (${sessionAccountAddr}) does not match the configured MCP server account (${configuredAccount}). ` +
            `Session key operations can only target the server's own account.`
          );
        }

        const nowSec = Math.floor(Date.now() / 1000);
        if (validUntil <= nowSec) {
          throw new Error("validUntil must be in the future");
        }
        const MAX_SESSION_DURATION_SECS = 30 * 24 * 60 * 60; // 30 days
        if (validUntil > nowSec + MAX_SESSION_DURATION_SECS) {
          throw new Error(
            `validUntil is too far in the future (max 30 days from now). ` +
            `Max allowed: ${nowSec + MAX_SESSION_DURATION_SECS}, got: ${validUntil}`
          );
        }
        if (maxCalls <= 0 || maxCalls > 1_000_000) {
          throw new Error("maxCalls must be between 1 and 1,000,000");
        }

        // Validate session public key is non-zero and in valid range
        if (sessionKey === 0n) {
          throw new Error(
            "sessionPublicKey must be non-zero. A zero key creates an unusable session."
          );
        }
        // Stark curve order: keys must be < CURVE_ORDER
        const STARK_CURVE_ORDER = BigInt("0x800000000000010ffffffffffffffffb781126dcae7b2321e66a241adc64d2f");
        if (sessionKey >= STARK_CURVE_ORDER) {
          throw new Error(
            "sessionPublicKey exceeds Stark curve order. This is not a valid public key."
          );
        }

        // Validate entrypoints (optional: function selectors as felt strings)
        const entrypoints = rawEntrypoints.map((ep, i) => {
          // Allow selector names like "transfer" or hex felts
          if (ep.startsWith("0x")) {
            return parseFelt(`allowedEntrypoints[${i}]`, ep).toString();
          }
          // Convert function name to selector
          return hash.getSelectorFromName(ep);
        });

        const registerCall: Call = {
          contractAddress: sessionAccountAddr,
          entrypoint: "add_or_update_session_key",
          calldata: CallData.compile({
            session_key: `0x${sessionKey.toString(16)}`,
            valid_until: validUntil,
            max_calls: maxCalls,
            allowed_entrypoints: entrypoints,
          }),
        };

        const executeFn = gasfree && isSponsored
          ? () => account.execute([registerCall], { version: ETransactionVersion.V3 })
          : () => account.execute([registerCall]);

        const result = await executeFn();
        await provider.waitForTransaction(result.transaction_hash, {
          retries: TX_WAIT_RETRIES,
          retryInterval: TX_WAIT_INTERVAL_MS,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  transactionHash: result.transaction_hash,
                  accountAddress: sessionAccountAddr,
                  sessionPublicKey: `0x${sessionKey.toString(16)}`,
                  validUntil,
                  maxCalls,
                  allowedEntrypoints: entrypoints,
                  note: "Session key registered. The session key holder can now sign transactions within these constraints.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "starknet_revoke_session_key": {
        const {
          accountAddress: rawAccountAddr,
          sessionPublicKey: rawSessionKey,
          gasfree = false,
        } = args as {
          accountAddress: string;
          sessionPublicKey: string;
          gasfree?: boolean;
        };

        const sessionAccountAddr = parseAddress("accountAddress", rawAccountAddr);
        const sessionKey = parseFelt("sessionPublicKey", rawSessionKey);

        const configuredAccountRevoke = parseAddress("STARKNET_ACCOUNT_ADDRESS", env.STARKNET_ACCOUNT_ADDRESS);
        if (sessionAccountAddr.toLowerCase() !== configuredAccountRevoke.toLowerCase()) {
          throw new Error(
            `accountAddress (${sessionAccountAddr}) does not match the configured MCP server account (${configuredAccountRevoke}). ` +
            `Session key operations can only target the server's own account.`
          );
        }

        const revokeCall: Call = {
          contractAddress: sessionAccountAddr,
          entrypoint: "revoke_session_key",
          calldata: CallData.compile({
            session_key: `0x${sessionKey.toString(16)}`,
          }),
        };

        const executeFn = gasfree && isSponsored
          ? () => account.execute([revokeCall], { version: ETransactionVersion.V3 })
          : () => account.execute([revokeCall]);

        const result = await executeFn();
        await provider.waitForTransaction(result.transaction_hash, {
          retries: TX_WAIT_RETRIES,
          retryInterval: TX_WAIT_INTERVAL_MS,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  transactionHash: result.transaction_hash,
                  accountAddress: sessionAccountAddr,
                  sessionPublicKey: `0x${sessionKey.toString(16)}`,
                  note: "Session key revoked. It can no longer sign transactions.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "starknet_get_session_data": {
        const {
          accountAddress: rawAccountAddr,
          sessionPublicKey: rawSessionKey,
        } = args as {
          accountAddress: string;
          sessionPublicKey: string;
        };

        const sessionAccountAddr = parseAddress("accountAddress", rawAccountAddr);
        const sessionKey = parseFelt("sessionPublicKey", rawSessionKey);

        const sessionData = await provider.callContract({
          contractAddress: sessionAccountAddr,
          entrypoint: "get_session_data",
          calldata: CallData.compile({
            session_key: `0x${sessionKey.toString(16)}`,
          }),
        });

        // SessionData struct: valid_until (u64), max_calls (u32), calls_used (u32), allowed_entrypoints_len (u32)
        // SessionData struct: valid_until (u64), max_calls (u32), calls_used (u32), allowed_entrypoints_len (u32)
        const validUntil = Number(sessionData[0]);
        const maxCalls = Number(sessionData[1]);
        const callsUsed = Number(sessionData[2]);
        const allowedEntrypointsLen = Number(sessionData[3]);

        const isActive = validUntil > 0 && validUntil > Math.floor(Date.now() / 1000) && callsUsed < maxCalls;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  accountAddress: sessionAccountAddr,
                  sessionPublicKey: `0x${sessionKey.toString(16)}`,
                  validUntil,
                  validUntilISO: validUntil > 0 ? new Date(validUntil * 1000).toISOString() : null,
                  maxCalls,
                  callsUsed,
                  callsRemaining: Math.max(0, maxCalls - callsUsed),
                  allowedEntrypointsLen,
                  isActive,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── Domain-specific unsigned call builders ──────────────────────────
      case "starknet_build_transfer_calls": {
        const {
          tokenAddress: rawToken,
          recipientAddress: rawRecipient,
          amount: rawAmount,
        } = args as {
          tokenAddress: string;
          recipientAddress: string;
          amount: string;
        };

        // Resolve token symbol to address if needed
        const tokenAddress = rawToken.startsWith("0x")
          ? parseAddress("tokenAddress", rawToken)
          : await resolveTokenAddressAsync(rawToken);

        const recipientAddress = parseAddress("recipientAddress", rawRecipient);

        // Look up token decimals for human-readable amount conversion
        const tokenService = getTokenService();
        const decimals = await tokenService.getDecimalsAsync(tokenAddress);
        const tokenSymbol = STATIC_TOKENS.find(
          (t) => t.address.toLowerCase() === tokenAddress.toLowerCase()
        )?.symbol ?? tokenAddress;

        const amountBigInt = parseDecimalToBigInt(rawAmount, decimals);

        // ERC-20 transfer: transfer(recipient, amount_u256_low, amount_u256_high)
        const calls: Call[] = [
          {
            contractAddress: tokenAddress,
            entrypoint: "transfer",
            calldata: CallData.compile({
              recipient: recipientAddress,
              amount: cairo.uint256(amountBigInt),
            }),
          },
        ];

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  calls,
                  callCount: calls.length,
                  token: tokenSymbol,
                  amount: rawAmount,
                  recipient: recipientAddress,
                  note: "Unsigned transfer call. Pass to account.execute(calls) with session key or owner signature.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "starknet_build_swap_calls": {
        const {
          sellTokenAddress: rawSellToken,
          buyTokenAddress: rawBuyToken,
          sellAmount: rawSellAmount,
          signerAddress: rawSigner,
          slippageBps = 100,
        } = args as {
          sellTokenAddress: string;
          buyTokenAddress: string;
          sellAmount: string;
          signerAddress: string;
          slippageBps?: number;
        };

        // Validate slippage bounds (1500 bps = 15% max)
        if (slippageBps < 0 || slippageBps > 1500) {
          throw new Error("slippageBps must be between 0 and 1500 (15%). Recommended: 50-300.");
        }

        const sellTokenAddress = rawSellToken.startsWith("0x")
          ? parseAddress("sellTokenAddress", rawSellToken)
          : await resolveTokenAddressAsync(rawSellToken);

        const buyTokenAddress = rawBuyToken.startsWith("0x")
          ? parseAddress("buyTokenAddress", rawBuyToken)
          : await resolveTokenAddressAsync(rawBuyToken);

        const signerAddress = parseAddress("signerAddress", rawSigner);

        const swapTokenService = getTokenService();
        const sellDecimals = await swapTokenService.getDecimalsAsync(sellTokenAddress);
        const sellAmountBigInt = parseDecimalToBigInt(rawSellAmount, sellDecimals);

        // Get quote from AVNU
        const quoteRequest: QuoteRequest = {
          sellTokenAddress,
          buyTokenAddress,
          sellAmount: sellAmountBigInt,
          takerAddress: signerAddress,
        };

        const quotes = await getQuotes(quoteRequest, { baseUrl: env.AVNU_BASE_URL });
        if (!quotes || quotes.length === 0) {
          throw new Error("No swap quotes available for this pair/amount");
        }

        const bestQuote = quotes[0];
        assertQuoteNotExpired(bestQuote);
        const slippage = slippageBps / 10000;

        const { calls: swapCalls } = await quoteToCalls({
          quoteId: bestQuote.quoteId,
          takerAddress: signerAddress,
          slippage,
          executeApprove: true,
        }, { baseUrl: env.AVNU_BASE_URL });

        const sellSymbol = STATIC_TOKENS.find(
          (t) => t.address.toLowerCase() === sellTokenAddress.toLowerCase()
        )?.symbol ?? sellTokenAddress;
        const buySymbol = STATIC_TOKENS.find(
          (t) => t.address.toLowerCase() === buyTokenAddress.toLowerCase()
        )?.symbol ?? buyTokenAddress;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  calls: swapCalls,
                  callCount: swapCalls.length,
                  sellToken: sellSymbol,
                  buyToken: buySymbol,
                  sellAmount: rawSellAmount,
                  buyAmount: bestQuote.buyAmount?.toString(),
                  slippageBps,
                  signerAddress,
                  note: "Unsigned swap calls (approval + swap). Pass to account.execute(calls) with session key or owner signature.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "x402_starknet_sign_payment_required": {
        const { paymentRequiredHeader } = args as {
          paymentRequiredHeader: string;
        };

        if (signerMode === "proxy") {
          throw new Error(
            "x402_starknet_sign_payment_required is disabled in STARKNET_SIGNER_MODE=proxy (requires direct private key signing)"
          );
        }

        if (!env.STARKNET_RPC_URL || !env.STARKNET_ACCOUNT_ADDRESS || !env.STARKNET_PRIVATE_KEY) {
          throw new Error(
            "Missing required env vars for x402 signing (STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY)",
          );
        }

        const { headerValue, payload } = await createStarknetPaymentSignatureHeader({
          paymentRequiredHeader,
          rpcUrl: env.STARKNET_RPC_URL,
          accountAddress: env.STARKNET_ACCOUNT_ADDRESS,
          privateKey: env.STARKNET_PRIVATE_KEY,
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
        const receipt = await provider.waitForTransaction(transactionHash, { retries: TX_WAIT_RETRIES, retryInterval: TX_WAIT_INTERVAL_MS });
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

      case "starknet_register_agent": {
        if (!env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
          throw new Error("ERC8004_IDENTITY_REGISTRY_ADDRESS not configured");
        }

        const { token_uri, gasfree = false } = args as {
          token_uri?: string;
          gasfree?: boolean;
        };

        const identity = parseAddress(
          "ERC8004_IDENTITY_REGISTRY_ADDRESS",
          env.ERC8004_IDENTITY_REGISTRY_ADDRESS
        );

        const entrypoint =
          token_uri && token_uri.length > 0 ? "register_with_token_uri" : "register";
        const calldata =
          token_uri && token_uri.length > 0
            ? CallData.compile({ token_uri: byteArray.byteArrayFromString(token_uri) })
            : [];

        const call: Call = {
          contractAddress: identity,
          entrypoint,
          calldata,
        };

        const transactionHash = await executeTransaction(call, gasfree);
        const receipt = await provider.waitForTransaction(transactionHash, {
          retries: TX_WAIT_RETRIES,
          retryInterval: TX_WAIT_INTERVAL_MS,
        });
        const { agentId } = parseIdentityRegisteredFromReceipt(receipt, identity);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  transactionHash,
                  identityRegistry: identity,
                  agentId,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "starknet_set_agent_metadata": {
        if (!env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
          throw new Error("ERC8004_IDENTITY_REGISTRY_ADDRESS not configured");
        }

        const { agent_id, key, value, gasfree = false } = args as {
          agent_id: string;
          key: string;
          value: string;
          gasfree?: boolean;
        };

        if (!agent_id) throw new Error("agent_id is required");
        if (!key || key.length === 0) throw new Error("key is required and must be non-empty");
        if (key === "agentWallet") throw new Error("'agentWallet' is a reserved key and cannot be set via set_metadata");
        if (value === undefined || value === null) throw new Error("value is required");

        const identity = parseAddress(
          "ERC8004_IDENTITY_REGISTRY_ADDRESS",
          env.ERC8004_IDENTITY_REGISTRY_ADDRESS
        );

        // agent_id is u256: compile as cairo.uint256
        const agentIdBigInt = BigInt(agent_id);
        const calldata = CallData.compile({
          agent_id: cairo.uint256(agentIdBigInt),
          key: byteArray.byteArrayFromString(key),
          value: byteArray.byteArrayFromString(value),
        });

        const call: Call = {
          contractAddress: identity,
          entrypoint: "set_metadata",
          calldata,
        };

        const transactionHash = await executeTransaction(call, gasfree);
        await provider.waitForTransaction(transactionHash, {
          retries: TX_WAIT_RETRIES,
          retryInterval: TX_WAIT_INTERVAL_MS,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  transactionHash,
                  identityRegistry: identity,
                  agentId: agent_id,
                  key,
                  value,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "starknet_get_agent_metadata": {
        if (!env.ERC8004_IDENTITY_REGISTRY_ADDRESS) {
          throw new Error("ERC8004_IDENTITY_REGISTRY_ADDRESS not configured");
        }

        const { agent_id, key } = args as {
          agent_id: string;
          key: string;
        };

        if (!agent_id) throw new Error("agent_id is required");
        if (!key || key.length === 0) throw new Error("key is required and must be non-empty");

        const identity = parseAddress(
          "ERC8004_IDENTITY_REGISTRY_ADDRESS",
          env.ERC8004_IDENTITY_REGISTRY_ADDRESS
        );

        const agentIdBigInt = BigInt(agent_id);
        const calldata = CallData.compile({
          agent_id: cairo.uint256(agentIdBigInt),
          key: byteArray.byteArrayFromString(key),
        });

        const result = await provider.callContract({
          contractAddress: identity,
          entrypoint: "get_metadata",
          calldata,
        });

        // The result is a serialized ByteArray. Parse it back to a string.
        const resultArray = Array.isArray(result)
          ? result
          : (result as Record<string, unknown>).result
            ? ((result as Record<string, unknown>).result as string[])
            : [];
        const value = byteArray.stringFromByteArray({
          data: resultArray.slice(1, 1 + Number(resultArray[0])).map((v) => BigInt(v)),
          pending_word: BigInt(resultArray[1 + Number(resultArray[0])] ?? "0"),
          pending_word_len: Number(resultArray[2 + Number(resultArray[0])] ?? "0"),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  agentId: agent_id,
                  key,
                  value,
                  identityRegistry: identity,
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

    // Log the full error to stderr for operators; never expose to the agent.
    log({ level: "error", event: "tool.error", tool: name, details: { error: errorMessage } });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: true,
            message: userMessage,
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
  log({ level: "info", event: "server.started", details: { transport: "stdio" } });
}

main().catch((error) => {
  log({
    level: "error",
    event: "server.fatal",
    details: { error: error instanceof Error ? error.message : String(error) },
  });
  process.exit(1);
});
