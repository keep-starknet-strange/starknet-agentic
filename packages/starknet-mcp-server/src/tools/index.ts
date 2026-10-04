/**
 * MCP tool registry.
 *
 * Every tool lives in its own module (see ./_shared.ts for the module shape).
 * The order of TOOL_MODULES is the order tools/list returns, so append new
 * tools rather than inserting them in the middle unless the reorder is
 * intentional.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolContext, ToolModule } from "./_shared.js";

import * as getBalance from "./get-balance.js";
import * as getBalances from "./get-balances.js";
import * as transfer from "./transfer.js";
import * as callContract from "./call-contract.js";
import * as invokeContract from "./invoke-contract.js";
import * as swap from "./swap.js";
import * as getQuote from "./get-quote.js";
import * as estimateFee from "./estimate-fee.js";
import * as vesuDeposit from "./vesu-deposit.js";
import * as vesuWithdraw from "./vesu-withdraw.js";
import * as vesuPositions from "./vesu-positions.js";
import * as buildCalls from "./build-calls.js";
import * as x402SignPaymentRequired from "./x402-sign-payment-required.js";
import * as registerSessionKey from "./register-session-key.js";
import * as revokeSessionKey from "./revoke-session-key.js";
import * as getSessionData from "./get-session-data.js";
import * as buildTransferCalls from "./build-transfer-calls.js";
import * as buildSwapCalls from "./build-swap-calls.js";
import * as deployAgentAccount from "./deploy-agent-account.js";
import * as registerAgent from "./register-agent.js";
import * as setAgentMetadata from "./set-agent-metadata.js";
import * as getAgentMetadata from "./get-agent-metadata.js";

export const TOOL_MODULES: readonly ToolModule[] = [
  getBalance,
  getBalances,
  transfer,
  callContract,
  invokeContract,
  swap,
  getQuote,
  estimateFee,
  vesuDeposit,
  vesuWithdraw,
  vesuPositions,
  buildCalls,
  x402SignPaymentRequired,
  // ── Session key management tools ────────────────────────────────────
  registerSessionKey,
  revokeSessionKey,
  getSessionData,
  // ── Domain-specific unsigned call builders ──────────────────────────
  buildTransferCalls,
  buildSwapCalls,
  // ── Identity (ERC-8004) and agent account deployment ────────────────
  deployAgentAccount,
  registerAgent,
  setAgentMetadata,
  getAgentMetadata,
];

const HANDLERS: ReadonlyMap<string, ToolModule["handler"]> = new Map(
  TOOL_MODULES.map((tool) => [tool.definition.name, tool.handler])
);

/** Tool definitions advertised by tools/list for this server configuration. */
export function listTools(ctx: ToolContext): Tool[] {
  return TOOL_MODULES.filter((tool) => tool.isListed?.(ctx) ?? true).map(
    (tool) => tool.definition
  );
}

/**
 * Look up a tool handler by name. Unlisted tools are still returned so their
 * handlers can report a specific configuration error.
 */
export function getToolHandler(name: string): ToolModule["handler"] | undefined {
  return HANDLERS.get(name);
}

export type { ToolArgs, ToolContext, ToolEnv, ToolModule, ToolResult } from "./_shared.js";
