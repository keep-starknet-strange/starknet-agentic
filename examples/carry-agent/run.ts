#!/usr/bin/env -S npx tsx
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseConfig } from "./src/config.js";
import { ExtendedPythonPerpExecutor } from "./src/extendedPerp.js";
import { executeHedgedEntry, McpSpotExecutionVenue, MockExecutionVenue } from "./src/execution.js";
import { createExtendedClient } from "./src/extended.js";
import { McpSidecar } from "./src/mcp.js";
import { evaluateExecutionSafety } from "./src/safety.js";
import { estimateCarryEdge, evaluateCarryDecision } from "./src/strategy.js";
import type { ExecutionOutcome } from "./src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

function log(level: "INFO" | "WARN" | "ERROR", message: string, data?: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    component: "carry-agent-demo",
    message,
    ...(data || {}),
  };
  const line = JSON.stringify(payload);
  if (level === "ERROR") {
    console.error(line);
  } else if (level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function buildMcpEnv(): Record<string, string> {
  const keys = [
    "STARKNET_RPC_URL",
    "STARKNET_ACCOUNT_ADDRESS",
    "STARKNET_PRIVATE_KEY",
    "STARKNET_SIGNER_MODE",
    "KEYRING_PROXY_URL",
    "KEYRING_HMAC_SECRET",
    "KEYRING_CLIENT_ID",
    "KEYRING_SIGNING_KEY_ID",
    "AVNU_PAYMASTER_API_KEY",
    "AVNU_PAYMASTER_FEE_MODE",
    "STARKNET_MCP_POLICY",
  ];

  const env: Record<string, string> = {};
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0) {
      env[key] = value;
    }
  }
  return env;
}

function requiredExtendedEnv(config: ReturnType<typeof parseConfig>): {
  apiKey: string;
  publicKey: string;
  privateKey: string;
  vaultNumber: number;
} {
  const apiKey = config.EXTENDED_API_KEY;
  const publicKey = config.EXTENDED_PUBLIC_KEY;
  const privateKey = config.EXTENDED_PRIVATE_KEY;
  const vaultNumber = config.EXTENDED_VAULT_NUMBER;

  const missing: string[] = [];
  if (!apiKey) missing.push("EXTENDED_API_KEY");
  if (!publicKey) missing.push("EXTENDED_PUBLIC_KEY");
  if (!privateKey) missing.push("EXTENDED_PRIVATE_KEY");
  if (!vaultNumber) missing.push("EXTENDED_VAULT_NUMBER");

  if (missing.length > 0) {
    throw new Error(
      `CARRY_EXECUTION_SURFACE=mcp_spot requires Extended perp credentials: ${missing.join(", ")}`,
    );
  }

  return {
    apiKey: apiKey!,
    publicKey: publicKey!,
    privateKey: privateKey!,
    vaultNumber: vaultNumber!,
  };
}

async function main(): Promise<void> {
  const cfg = parseConfig();
  const client = createExtendedClient({
    baseUrl: cfg.EXTENDED_BASE_URL,
    apiPrefix: cfg.EXTENDED_API_PREFIX,
    apiKey: cfg.EXTENDED_API_KEY,
  });

  log("INFO", "Starting carry-agent demo run.", {
    market: cfg.CARRY_MARKET,
    notionalUsd: cfg.CARRY_NOTIONAL_USD,
    holdHours: cfg.CARRY_HOLD_HOURS,
    fundingWindowHours: cfg.CARRY_FUNDING_WINDOW_HOURS,
    runMode: cfg.CARRY_RUN_MODE,
    executionSurface: cfg.CARRY_EXECUTION_SURFACE,
  });

  const nowMs = Date.now();
  const windowStartMs = nowMs - cfg.CARRY_FUNDING_WINDOW_HOURS * 60 * 60 * 1000;

  const [snapshot, fundingHistory] = await Promise.all([
    client.getMarketSnapshot(cfg.CARRY_MARKET),
    client.getFundingHistory(cfg.CARRY_MARKET, windowStartMs, nowMs),
  ]);

  let perpEntryFeeRate = 0.00025;
  let perpExitFeeRate = 0.00025;
  let feesSource: "default" | "extended_user_tier" = "default";

  if (cfg.EXTENDED_API_KEY) {
    try {
      const fees = await client.getUserFees(cfg.CARRY_MARKET);
      perpEntryFeeRate = fees.takerFeeRate;
      perpExitFeeRate = fees.takerFeeRate;
      feesSource = "extended_user_tier";
    } catch (error) {
      log("WARN", "Failed to fetch user fee tier; using default taker fee assumption.", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const edge = estimateCarryEdge({
    notionalUsd: cfg.CARRY_NOTIONAL_USD,
    holdHours: cfg.CARRY_HOLD_HOURS,
    expectedFundingRateHourly: snapshot.fundingRate,
    spotEntryFeeRate: cfg.CARRY_SPOT_ENTRY_FEE_RATE,
    spotExitFeeRate: cfg.CARRY_SPOT_EXIT_FEE_RATE,
    perpEntryFeeRate,
    perpExitFeeRate,
    expectedSlippageBps: cfg.CARRY_EXPECTED_SLIPPAGE_BPS,
    driftReserveBps: cfg.CARRY_DRIFT_RESERVE_BPS,
    gasCostUsdTotal: cfg.CARRY_GAS_COST_USD_TOTAL,
  });

  const fundingHistoryHourly = fundingHistory.map((point) => point.fundingRate);
  const spotQuoteAgeMs = 500;
  const perpSnapshotAgeMs = 500;
  const feesAgeMs = 500;
  const decision = evaluateCarryDecision({
    market: cfg.CARRY_MARKET,
    hasOpenPosition: cfg.CARRY_HAS_OPEN_POSITION,
    venueHealthy: cfg.CARRY_VENUE_HEALTHY,
    spotQuoteAgeMs,
    perpSnapshotAgeMs,
    feesAgeMs,
    maxDataAgeMs: cfg.CARRY_MAX_DATA_AGE_MS,
    fundingHistoryHourly,
    minFundingAverageHourly: cfg.CARRY_MIN_FUNDING_AVG_HOURLY,
    minFundingPositiveShare: cfg.CARRY_MIN_FUNDING_POSITIVE_SHARE,
    enterMinNetEdgeUsd: cfg.CARRY_ENTER_MIN_NET_EDGE_USD,
    enterMinNetEdgeBps: cfg.CARRY_ENTER_MIN_NET_EDGE_BPS,
    holdMinNetEdgeUsd: cfg.CARRY_HOLD_MIN_NET_EDGE_USD,
    edge,
  });

  const executionSafety = evaluateExecutionSafety({
    runMode: cfg.CARRY_RUN_MODE,
    decisionAction: decision.action,
    notionalUsd: cfg.CARRY_NOTIONAL_USD,
    maxNotionalUsd: cfg.CARRY_MAX_NOTIONAL_USD,
    spotQuoteAgeMs,
    perpSnapshotAgeMs,
    feesAgeMs,
    maxDataAgeMs: cfg.CARRY_MAX_DATA_AGE_MS,
  });

  let executionOutcome: ExecutionOutcome | undefined = undefined;
  if (executionSafety.allowed) {
    if (cfg.CARRY_EXECUTION_SURFACE === "mcp_spot") {
      const resolvedEntry = path.isAbsolute(cfg.CARRY_MCP_ENTRY)
        ? cfg.CARRY_MCP_ENTRY
        : path.resolve(__dirname, cfg.CARRY_MCP_ENTRY);
      const sidecar = new McpSidecar(resolvedEntry, buildMcpEnv());
      await sidecar.connect(cfg.CARRY_MCP_LABEL);

      try {
        const tools = await sidecar.listTools();
        if (!tools.includes("starknet_swap")) {
          throw new Error("starknet_swap tool is required for mcp_spot execution surface.");
        }

        const venue = new McpSpotExecutionVenue(sidecar, {
          spotSellToken: cfg.CARRY_SPOT_SELL_TOKEN,
          spotBuyToken: cfg.CARRY_SPOT_BUY_TOKEN,
          slippage: cfg.CARRY_SWAP_SLIPPAGE,
          markPrice: snapshot.markPrice,
        }, new ExtendedPythonPerpExecutor({
          pythonBin: cfg.CARRY_EXTENDED_PYTHON_BIN,
          scriptPath: path.isAbsolute(cfg.CARRY_EXTENDED_PYTHON_SCRIPT)
            ? cfg.CARRY_EXTENDED_PYTHON_SCRIPT
            : path.resolve(__dirname, cfg.CARRY_EXTENDED_PYTHON_SCRIPT),
          baseUrl: cfg.EXTENDED_BASE_URL,
          apiPrefix: cfg.EXTENDED_API_PREFIX,
          slippageBps: cfg.CARRY_PERP_SLIPPAGE_BPS,
          pollIntervalMs: cfg.CARRY_PERP_ORDER_POLL_INTERVAL_MS,
          pollTimeoutMs: cfg.CARRY_PERP_ORDER_POLL_TIMEOUT_MS,
          commandTimeoutMs: cfg.CARRY_EXTENDED_COMMAND_TIMEOUT_MS,
          ...requiredExtendedEnv(cfg),
        }));

        executionOutcome = await executeHedgedEntry(venue, {
          market: cfg.CARRY_MARKET,
          notionalUsd: cfg.CARRY_NOTIONAL_USD,
          maxUnhedgedNotionalUsd: cfg.CARRY_MAX_UNHEDGED_NOTIONAL_USD,
          leggingTimeoutMs: cfg.CARRY_LEGGING_TIMEOUT_MS,
          partialFillTimeoutMs: cfg.CARRY_PARTIAL_FILL_TIMEOUT_MS,
          deadmanSwitchEnabled: cfg.CARRY_DEADMAN_SWITCH_ENABLED,
          deadmanSwitchSeconds: cfg.CARRY_DEADMAN_SWITCH_SECONDS,
          marketSnapshot: snapshot,
        });
      } finally {
        await sidecar.close();
      }
    } else {
      const venue = new MockExecutionVenue(
        cfg.CARRY_EXECUTION_SCENARIO,
        cfg.CARRY_MOCK_SECOND_LEG_DELAY_MS,
        cfg.CARRY_MOCK_SECOND_LEG_FILL_RATIO,
      );

      executionOutcome = await executeHedgedEntry(venue, {
        market: cfg.CARRY_MARKET,
        notionalUsd: cfg.CARRY_NOTIONAL_USD,
        maxUnhedgedNotionalUsd: cfg.CARRY_MAX_UNHEDGED_NOTIONAL_USD,
        leggingTimeoutMs: cfg.CARRY_LEGGING_TIMEOUT_MS,
        partialFillTimeoutMs: cfg.CARRY_PARTIAL_FILL_TIMEOUT_MS,
        deadmanSwitchEnabled: cfg.CARRY_DEADMAN_SWITCH_ENABLED,
        deadmanSwitchSeconds: cfg.CARRY_DEADMAN_SWITCH_SECONDS,
        marketSnapshot: snapshot,
      });
    }
  } else if (cfg.CARRY_RUN_MODE === "execute") {
    log("WARN", "Execution blocked by safety rails.", executionSafety);
  }

  const runId = `carry-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const outputDir = path.resolve(__dirname, cfg.CARRY_OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });
  const artifactPath = path.join(outputDir, `${runId}.json`);

  const artifact = {
    runId,
    generatedAt: new Date().toISOString(),
    config: {
      market: cfg.CARRY_MARKET,
      notionalUsd: cfg.CARRY_NOTIONAL_USD,
      maxNotionalUsd: cfg.CARRY_MAX_NOTIONAL_USD,
      holdHours: cfg.CARRY_HOLD_HOURS,
      fundingWindowHours: cfg.CARRY_FUNDING_WINDOW_HOURS,
      hasOpenPosition: cfg.CARRY_HAS_OPEN_POSITION,
      venueHealthy: cfg.CARRY_VENUE_HEALTHY,
      runMode: cfg.CARRY_RUN_MODE,
      executionSurface: cfg.CARRY_EXECUTION_SURFACE,
    },
    marketSnapshot: snapshot,
    fundingPoints: fundingHistory.length,
    fundingHistoryHourly,
    feeMode: feesSource,
    decision,
    executionSafety,
    executionOutcome,
  };

  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  log("INFO", "Carry-agent demo completed.", {
    action: decision.action,
    reasonCode: decision.reasonCode,
    netEdgeUsd: decision.edge.netEdgeUsd,
    netEdgeBps: decision.edge.netEdgeBps,
    executionSafety,
    executionOutcome,
    artifactPath,
  });

  if (cfg.CARRY_RUN_MODE === "dry-run" && decision.action === "ENTER") {
    log("WARN", "Decision is ENTER. Dry-run mode does not execute orders.");
  }
}

main().catch((error) => {
  log("ERROR", "Carry-agent demo failed.", {
    reason: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
