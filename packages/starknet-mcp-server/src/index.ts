#!/usr/bin/env node

/**
 * Starknet MCP Server
 *
 * Exposes Starknet operations as MCP tools for AI agents.
 * Works with any MCP-compatible client: Claude, ChatGPT, Cursor, OpenClaw.
 *
 * This file is the server bootstrap: environment validation and production
 * guards, provider/signer/account construction, transaction submission, the
 * preflight policy guard, and the registry-driven tools/list + tools/call
 * handlers. Each tool (definition + handler) lives in src/tools/<tool>.ts and
 * is registered in src/tools/index.ts.
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
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  Account,
  RpcProvider,
  PaymasterRpc,
  ETransactionVersion,
  type Call,
} from "starknet";
import { getTokenService, configureTokenServiceProvider, TOKENS } from "./services/index.js";
import { VESU_POOL_FACTORY } from "./helpers/vesu.js";
import { z } from "zod";
import { formatErrorMessage } from "./utils/formatter.js";
import { PolicyGuard, loadPolicyConfig } from "./middleware/policyGuard.js";
import { KeyringProxySigner } from "./helpers/keyringProxySigner.js";
import {
  TX_WAIT_INTERVAL_MS,
  TX_WAIT_RETRIES,
  isReceiptSuccessful,
  normalizeReceiptStatus,
  type TxReceiptLike,
} from "./helpers/txReceipt.js";
import { parseAddress } from "./tools/_shared.js";
import { getToolHandler, listTools, type ToolContext } from "./tools/index.js";
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
  // When AVNU_PAYMASTER_API_KEY is set, some orgs only allow "default" fee mode (user pays in gas token).
  // Allow overriding to avoid hard-failing on sponsored mode.
  AVNU_PAYMASTER_FEE_MODE: z.enum(["sponsored", "default"]).optional(),
  STARKNET_VESU_POOL_FACTORY: z.string().startsWith("0x").optional(),
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
  AVNU_PAYMASTER_FEE_MODE: process.env.AVNU_PAYMASTER_FEE_MODE as
    | "sponsored"
    | "default"
    | undefined,
  STARKNET_VESU_POOL_FACTORY: process.env.STARKNET_VESU_POOL_FACTORY,
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
let vesuPoolFactoryAddress = env.STARKNET_VESU_POOL_FACTORY ?? VESU_POOL_FACTORY;

// Fee mode:
// - sponsored: dApp pays all gas (requires AVNU paymaster to authorize the API key)
// - default: user pays gas in `gasToken` via paymaster
const paymasterFeeMode =
  env.AVNU_PAYMASTER_FEE_MODE ?? (env.AVNU_PAYMASTER_API_KEY ? "sponsored" : "default");
const isSponsored = paymasterFeeMode === "sponsored" && !!env.AVNU_PAYMASTER_API_KEY;
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

vesuPoolFactoryAddress = parseAddress(
  "STARKNET_VESU_POOL_FACTORY",
  env.STARKNET_VESU_POOL_FACTORY ?? VESU_POOL_FACTORY
);

async function waitForTransactionSuccess(
  transactionHash: string,
  context: string,
): Promise<TxReceiptLike> {
  const receipt = (await provider.waitForTransaction(transactionHash, {
    retries: TX_WAIT_RETRIES,
    retryInterval: TX_WAIT_INTERVAL_MS,
  })) as TxReceiptLike;

  if (!isReceiptSuccessful(receipt)) {
    const status = normalizeReceiptStatus(receipt);
    const revertReason =
      typeof receipt.revert_reason === "string" && receipt.revert_reason.trim().length > 0
        ? receipt.revert_reason.trim()
        : "No revert reason provided";
    throw new Error(
      `Transaction ${transactionHash} failed during ${context} (status=${status}): ${revertReason}`
    );
  }

  return receipt;
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
  gasToken: string = TOKENS.STRK,
  dryRun = false
): Promise<string> {
  if (dryRun) {
    return "0x0";
  }

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

// Runtime dependencies shared by all tool handlers (see src/tools/_shared.ts).
const toolContext: ToolContext = {
  env,
  signerMode,
  provider,
  account,
  isSponsored,
  vesuPoolFactoryAddress,
  executeTransaction,
  waitForTransactionSuccess,
};

// Tool definitions advertised for this configuration (order defined by the registry).
const tools: Tool[] = listTools(toolContext);

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
    const handler = getToolHandler(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return await handler(args, toolContext);
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
