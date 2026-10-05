/**
 * Preflight Policy Guard
 *
 * Validates MCP tool requests against configurable policy rules before execution.
 * Defense-in-depth: catches violations before they hit on-chain session key policies,
 * avoiding wasted gas on calls that would revert.
 *
 * Addresses: https://github.com/keep-starknet-strange/starknet-agentic/issues/221
 */

import { readFileSync } from "node:fs";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TransferPolicy {
  /** Maximum amount per transfer in human-readable units (e.g. "100" = 100 tokens). */
  maxAmountPerCall?: string;
  /** Allowed recipient addresses. Empty = allow all. */
  allowedRecipients?: string[];
  /** Blocked recipient addresses. Checked after allowedRecipients. */
  blockedRecipients?: string[];
  /** Allowed token symbols or addresses. Empty = allow all. */
  allowedTokens?: string[];
}

export interface InvokePolicy {
  /** Blocked entrypoint selectors. These are function names, not raw selectors. */
  blockedEntrypoints?: string[];
  /** Allowed target contract addresses. Empty = allow all. */
  allowedContracts?: string[];
  /** Blocked target contract addresses. Checked after allowedContracts. */
  blockedContracts?: string[];
}

export interface SwapPolicy {
  /** Maximum slippage override (tighter than the 50% server cap). */
  maxSlippage?: number;
  /** Maximum sell amount in human-readable units. */
  maxAmountPerCall?: string;
  /** Blocked buy token symbols or addresses. */
  blockedBuyTokens?: string[];
}

export interface PolicyConfig {
  transfer?: TransferPolicy;
  invoke?: InvokePolicy;
  swap?: SwapPolicy;
  /** If true, reject requests for tools not covered by explicit policy. Default: false. */
  denyUnknownTools?: boolean;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
}

/**
 * A token payment the server is about to authorize without a `starknet_transfer`
 * call, e.g. an x402 payment: `amount` of `asset` to `payTo`.
 */
export interface PaymentPolicyInput {
  /** Token contract address. */
  asset: string;
  /** Recipient address. */
  payTo: string;
  /** Exact amount in the token's atomic units. */
  amount: bigint;
  /** Token decimals, if known. Required when `transfer.maxAmountPerCall` is set. */
  decimals?: number;
  /**
   * Symbol from the server's built-in token list only (never from token metadata
   * fetched at runtime, which the token contract controls). Lets `allowedTokens`
   * entries written as symbols match.
   */
  trustedSymbol?: string;
}

// ── Default deny-list of privileged entrypoints ─────────────────────────────

const DEFAULT_BLOCKED_ENTRYPOINTS = [
  "upgrade",
  "set_owner",
  "transfer_ownership",
  "transferOwnership",
  "renounce_ownership",
  "renounceOwnership",
  "set_admin",
  "change_admin",
  "set_implementation",
  "initialize",
  "register_session_key",
  "revoke_session_key",
  "emergency_revoke_all",
  "schedule_upgrade",
  "execute_upgrade",
];

// ── Guard implementation ────────────────────────────────────────────────────

export class PolicyGuard {
  private config: PolicyConfig;

  constructor(config: PolicyConfig = {}) {
    this.config = config;
  }

  /**
   * Evaluate a tool call against policy. Returns { allowed: true } or { allowed: false, reason }.
   */
  evaluate(toolName: string, args: Record<string, unknown>): PolicyResult {
    switch (toolName) {
      case "starknet_transfer":
        return this.evaluateTransfer(args);
      case "starknet_invoke_contract":
        return this.evaluateInvoke(args);
      case "starknet_swap":
        return this.evaluateSwap(args);
      case "starknet_build_calls":
        return this.evaluateBuildCalls(args);
      default:
        if (this.config.denyUnknownTools) {
          return { allowed: false, reason: `Tool "${toolName}" is not covered by policy` };
        }
        return { allowed: true };
    }
  }

  /**
   * Evaluate a payment the server signs without going through `starknet_transfer`
   * (x402) as a transfer of `amount` of `asset` to `payTo`, under the `transfer`
   * policy. Same rules as `evaluateTransfer`, applied strictly because the values
   * come from a counterparty: amounts are compared exactly in atomic units,
   * addresses numerically, and anything that cannot be evaluated is denied.
   */
  evaluatePayment(input: PaymentPolicyInput): PolicyResult {
    const policy = this.config.transfer;
    if (!policy) return { allowed: true };

    const payTo = parseFeltOrUndefined(input.payTo);
    const asset = parseFeltOrUndefined(input.asset);
    if (payTo === undefined || asset === undefined || input.amount < 0n) {
      return { allowed: false, reason: "Payment recipient, token or amount cannot be evaluated" };
    }

    if (policy.maxAmountPerCall) {
      const decimals = input.decimals;
      if (decimals === undefined || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        return {
          allowed: false,
          reason: `Token ${input.asset} decimals are unknown, so the payment cannot be checked against maxAmountPerCall`,
        };
      }
      const limit = parseDecimalToAtomic(policy.maxAmountPerCall, decimals);
      if (limit === undefined) {
        return { allowed: false, reason: `Policy maxAmountPerCall "${policy.maxAmountPerCall}" is not a decimal number` };
      }
      if (input.amount > limit) {
        return {
          allowed: false,
          reason: `Payment amount ${formatAtomic(input.amount, decimals)} exceeds policy limit of ${policy.maxAmountPerCall}`,
        };
      }
    }

    if (policy.allowedRecipients && policy.allowedRecipients.length > 0) {
      if (!policy.allowedRecipients.some((entry) => parseFeltOrUndefined(entry) === payTo)) {
        return { allowed: false, reason: `Recipient ${input.payTo} is not in the allowed recipients list` };
      }
    }

    if (policy.blockedRecipients && policy.blockedRecipients.length > 0) {
      const blocked = policy.blockedRecipients.some(
        (entry) => parseFeltOrUndefined(entry) === payTo || entry.toLowerCase() === input.payTo.toLowerCase()
      );
      if (blocked) {
        return { allowed: false, reason: `Recipient ${input.payTo} is blocked by policy` };
      }
    }

    if (policy.allowedTokens && policy.allowedTokens.length > 0) {
      const symbol = input.trustedSymbol?.toLowerCase();
      const allowed = policy.allowedTokens.some((entry) => {
        const felt = parseFeltOrUndefined(entry);
        if (felt !== undefined) return felt === asset;
        return symbol !== undefined && entry.toLowerCase() === symbol;
      });
      if (!allowed) {
        return { allowed: false, reason: `Token ${input.asset} is not in the allowed tokens list` };
      }
    }

    return { allowed: true };
  }

  private evaluateTransfer(args: Record<string, unknown>): PolicyResult {
    const policy = this.config.transfer;
    if (!policy) return { allowed: true };

    const recipient = normalizeAddress(args.recipient as string | undefined);
    const token = (args.token as string | undefined) ?? "";
    const amount = args.amount as string | undefined;

    // Amount check
    if (policy.maxAmountPerCall && amount) {
      if (compareDecimalStrings(amount, policy.maxAmountPerCall) > 0) {
        return {
          allowed: false,
          reason: `Transfer amount ${amount} exceeds policy limit of ${policy.maxAmountPerCall}`,
        };
      }
    }

    // Recipient allowlist
    if (policy.allowedRecipients && policy.allowedRecipients.length > 0 && recipient) {
      const normalized = policy.allowedRecipients.map(normalizeAddress);
      if (!normalized.includes(recipient)) {
        return {
          allowed: false,
          reason: `Recipient ${recipient} is not in the allowed recipients list`,
        };
      }
    }

    // Recipient blocklist
    if (policy.blockedRecipients && policy.blockedRecipients.length > 0 && recipient) {
      const normalized = policy.blockedRecipients.map(normalizeAddress);
      if (normalized.includes(recipient)) {
        return {
          allowed: false,
          reason: `Recipient ${recipient} is blocked by policy`,
        };
      }
    }

    // Token allowlist
    if (policy.allowedTokens && policy.allowedTokens.length > 0) {
      const normalizedAllowed = policy.allowedTokens.map((t) => t.toLowerCase());
      if (!normalizedAllowed.includes(token.toLowerCase())) {
        return {
          allowed: false,
          reason: `Token "${token}" is not in the allowed tokens list`,
        };
      }
    }

    return { allowed: true };
  }

  private evaluateInvoke(args: Record<string, unknown>): PolicyResult {
    const policy = this.config.invoke;
    const entrypoint = args.entrypoint as string | undefined;
    const contractAddress = normalizeAddress(args.contractAddress as string | undefined);

    // Always check default blocked entrypoints, even without explicit policy
    if (entrypoint && DEFAULT_BLOCKED_ENTRYPOINTS.includes(entrypoint)) {
      return {
        allowed: false,
        reason: `Entrypoint "${entrypoint}" is blocked by default security policy (privileged operation)`,
      };
    }

    if (!policy) return { allowed: true };

    // Custom blocked entrypoints
    if (policy.blockedEntrypoints && entrypoint) {
      if (policy.blockedEntrypoints.includes(entrypoint)) {
        return {
          allowed: false,
          reason: `Entrypoint "${entrypoint}" is blocked by policy`,
        };
      }
    }

    // Contract allowlist
    if (policy.allowedContracts && policy.allowedContracts.length > 0 && contractAddress) {
      const normalized = policy.allowedContracts.map(normalizeAddress);
      if (!normalized.includes(contractAddress)) {
        return {
          allowed: false,
          reason: `Contract ${contractAddress} is not in the allowed contracts list`,
        };
      }
    }

    // Contract blocklist
    if (policy.blockedContracts && policy.blockedContracts.length > 0 && contractAddress) {
      const normalized = policy.blockedContracts.map(normalizeAddress);
      if (normalized.includes(contractAddress)) {
        return {
          allowed: false,
          reason: `Contract ${contractAddress} is blocked by policy`,
        };
      }
    }

    return { allowed: true };
  }

  private evaluateSwap(args: Record<string, unknown>): PolicyResult {
    const policy = this.config.swap;
    if (!policy) return { allowed: true };

    const slippage = args.slippage as number | undefined;
    const amount = args.amount as string | undefined;
    const buyToken = (args.buyToken as string | undefined) ?? "";

    // Slippage check
    if (policy.maxSlippage !== undefined && slippage !== undefined) {
      if (slippage > policy.maxSlippage) {
        return {
          allowed: false,
          reason: `Slippage ${slippage} exceeds policy limit of ${policy.maxSlippage}`,
        };
      }
    }

    // Amount check
    if (policy.maxAmountPerCall && amount) {
      if (compareDecimalStrings(amount, policy.maxAmountPerCall) > 0) {
        return {
          allowed: false,
          reason: `Swap amount ${amount} exceeds policy limit of ${policy.maxAmountPerCall}`,
        };
      }
    }

    // Blocked buy tokens
    if (policy.blockedBuyTokens && policy.blockedBuyTokens.length > 0) {
      const normalizedBlocked = policy.blockedBuyTokens.map((t) => t.toLowerCase());
      if (normalizedBlocked.includes(buyToken.toLowerCase())) {
        return {
          allowed: false,
          reason: `Buy token "${buyToken}" is blocked by policy`,
        };
      }
    }

    return { allowed: true };
  }

  private evaluateBuildCalls(args: Record<string, unknown>): PolicyResult {
    const calls = args.calls as Array<{
      contractAddress?: string;
      entrypoint?: string;
      calldata?: string[];
    }> | undefined;

    if (!calls || !Array.isArray(calls)) return { allowed: true };

    // Check each call in the batch against invoke policy
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const result = this.evaluateInvoke({
        contractAddress: call.contractAddress,
        entrypoint: call.entrypoint,
      });
      if (!result.allowed) {
        return {
          allowed: false,
          reason: `calls[${i}]: ${result.reason}`,
        };
      }
    }

    return { allowed: true };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a Starknet address to lowercase with consistent 0x prefix.
 * Returns empty string for undefined/null input.
 */
function normalizeAddress(addr: string | undefined | null): string {
  if (!addr) return "";
  return addr.toLowerCase();
}

/** Parse a 0x-hex felt; undefined for anything else (symbols, garbage). */
function parseFeltOrUndefined(value: unknown): bigint | undefined {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(value.trim())) return undefined;
  return BigInt(value.trim());
}

/**
 * Exact conversion of a human-readable decimal ("1.5") to atomic units, rounding
 * down any precision the token does not have. Undefined if not a plain decimal.
 */
function parseDecimalToAtomic(value: string, decimals: number): bigint | undefined {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return undefined;
  const [, whole, fraction = ""] = match;
  return BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, "0"));
}

function formatAtomic(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const digits = amount.toString().padStart(decimals + 1, "0");
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  const whole = digits.slice(0, -decimals);
  return fraction ? `${whole}.${fraction}` : whole;
}

/**
 * Compare two decimal number strings. Returns:
 *  -1 if a < b, 0 if a == b, 1 if a > b
 *
 * Handles integer and decimal formats (e.g. "1.5", "100").
 */
export function compareDecimalStrings(a: string, b: string): number {
  const fa = parseFloat(a);
  const fb = parseFloat(b);
  if (Number.isNaN(fa) || Number.isNaN(fb)) return 0;
  if (fa < fb) return -1;
  if (fa > fb) return 1;
  return 0;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Load policy config from STARKNET_MCP_POLICY_PATH env var (JSON file)
 * or STARKNET_MCP_POLICY env var (inline JSON). Returns empty config if neither is set.
 */
export function loadPolicyConfig(): PolicyConfig {
  const inlinePolicy = process.env.STARKNET_MCP_POLICY;
  if (inlinePolicy) {
    try {
      return JSON.parse(inlinePolicy) as PolicyConfig;
    } catch (e) {
      console.error("Failed to parse STARKNET_MCP_POLICY:", e);
      return {};
    }
  }

  const policyPath = process.env.STARKNET_MCP_POLICY_PATH;
  if (policyPath) {
    try {
      const content = readFileSync(policyPath, "utf-8");
      return JSON.parse(content) as PolicyConfig;
    } catch (e) {
      console.error(`Failed to load policy from ${policyPath}:`, e);
      return {};
    }
  }

  return {};
}
