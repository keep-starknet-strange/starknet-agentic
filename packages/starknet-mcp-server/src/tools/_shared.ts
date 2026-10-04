/**
 * Shared types and helpers for MCP tool modules (src/tools/*.ts).
 *
 * Each tool module exports:
 *   - `definition`: the MCP Tool (name, description, JSON Schema inputSchema)
 *     returned verbatim by tools/list.
 *   - `handler(args, ctx)`: executes the tool; throw an Error to return an
 *     error result (the server formats and logs it).
 *   - optional `isListed(ctx)`: hide the tool from tools/list for this server
 *     configuration. Unlisted tools stay callable so callers get the handler's
 *     own "not configured" error instead of "Unknown tool".
 */

import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { validateAndParseAddress, type Account, type Call, type RpcProvider } from "starknet";
import { getTokenService } from "../services/index.js";
import type { TxReceiptLike } from "../helpers/txReceipt.js";

/** Raw tool arguments as received in a tools/call request. */
export type ToolArgs = Record<string, unknown> | undefined;

/** Result returned by a tool handler (an MCP CallToolResult). */
export type ToolResult = CallToolResult;

/** Validated server environment values that tool handlers read. */
export interface ToolEnv {
  STARKNET_RPC_URL: string;
  STARKNET_ACCOUNT_ADDRESS: string;
  STARKNET_PRIVATE_KEY?: string;
  AVNU_BASE_URL?: string;
  AGENT_ACCOUNT_FACTORY_ADDRESS?: string;
  ERC8004_IDENTITY_REGISTRY_ADDRESS?: string;
}

/**
 * Runtime dependencies injected into every handler. Built once at startup in
 * src/index.ts, which owns the provider, signer/account and transaction
 * submission.
 */
export interface ToolContext {
  env: ToolEnv;
  signerMode: "direct" | "proxy";
  provider: RpcProvider;
  account: Account;
  isSponsored: boolean;
  vesuPoolFactoryAddress: string;
  executeTransaction: (
    calls: Call | Call[],
    gasfree: boolean,
    gasToken?: string,
    dryRun?: boolean
  ) => Promise<string>;
  waitForTransactionSuccess: (transactionHash: string, context: string) => Promise<TxReceiptLike>;
}

export interface ToolModule {
  definition: Tool;
  isListed?: (ctx: ToolContext) => boolean;
  handler: (args: ToolArgs, ctx: ToolContext) => Promise<ToolResult>;
}

export function parseFelt(name: string, value: string): bigint {
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

export function parseAddress(name: string, value: string): string {
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

export const MAX_CALLDATA_LEN = 256;

export function parseCalldata(name: string, calldata: string[]): string[] {
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

export function validateEntrypoint(name: string, value: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required and must be non-empty`);
  }
  if (/[\x00-\x1f\x7f]/.test(value)) {
    throw new Error(`${name} contains invalid control characters`);
  }
  return value.trim();
}

export async function parseAmount(
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

/**
 * Reject an AVNU quote whose server-provided expiry has already passed.
 * The `expiry` field is a Unix-seconds timestamp set by the AVNU router;
 * executing an expired quote will fail on-chain and waste gas.
 */
export function assertQuoteNotExpired(quote: { expiry?: number | null }): void {
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
export const HIGH_PRICE_IMPACT_THRESHOLD = 5;

export function priceImpactWarning(priceImpact?: number): string | undefined {
  if (priceImpact != null && Math.abs(priceImpact) >= HIGH_PRICE_IMPACT_THRESHOLD) {
    return (
      `WARNING: Price impact is ${priceImpact.toFixed(2)}% which exceeds the ${HIGH_PRICE_IMPACT_THRESHOLD}% threshold. ` +
      "This swap may result in significant value loss. Consider reducing the amount or using a more liquid pair."
    );
  }
  return undefined;
}
