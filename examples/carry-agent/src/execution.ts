import type {
  ExecutionIncident,
  ExecutionOutcome,
  ExecutionOrderResult,
  ExtendedMarketSnapshot,
} from "./types.js";

export type ExecuteEntryInput = {
  market: string;
  notionalUsd: number;
  maxUnhedgedNotionalUsd: number;
  leggingTimeoutMs: number;
  partialFillTimeoutMs: number;
  deadmanSwitchEnabled: boolean;
  deadmanSwitchSeconds: number;
  marketSnapshot: ExtendedMarketSnapshot;
};

export type ExecutionVenue = {
  armDeadmanSwitch: (seconds: number) => Promise<void>;
  cancelAllOpenOrders: () => Promise<void>;
  placeSpotBuy: (input: { market: string; notionalUsd: number }) => Promise<ExecutionOrderResult>;
  placePerpShort: (input: { market: string; notionalUsd: number }) => Promise<ExecutionOrderResult>;
  neutralizeSpot: (input: { market: string; notionalUsd: number }) => Promise<ExecutionOrderResult>;
};

export type MockExecutionScenario =
  | "success"
  | "second_leg_failure"
  | "second_leg_timeout"
  | "partial_fill";

export type ToolCaller = {
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockHash(seed: string): string {
  const suffix = Buffer.from(`${seed}-${Date.now()}`).toString("hex").slice(0, 16);
  return `0x${suffix.padEnd(64, "0")}`;
}

function extractTxHash(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== "object") {
    return undefined;
  }
  const asRecord = payload as Record<string, unknown>;
  for (const key of ["transactionHash", "txHash", "hash"]) {
    const value = asRecord[key];
    if (typeof value === "string" && value.startsWith("0x")) {
      return value;
    }
  }
  return undefined;
}

function toDecimalAmount(value: number, decimals = 6): string {
  return value.toFixed(decimals).replace(/\.?0+$/, "");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export class McpSpotExecutionVenue implements ExecutionVenue {
  constructor(
    private readonly toolCaller: ToolCaller,
    private readonly settings: {
      spotSellToken: string;
      spotBuyToken: string;
      slippage: number;
      markPrice: number;
    },
  ) {}

  async armDeadmanSwitch(_seconds: number): Promise<void> {
    return;
  }

  async cancelAllOpenOrders(): Promise<void> {
    return;
  }

  async placeSpotBuy(input: { market: string; notionalUsd: number }): Promise<ExecutionOrderResult> {
    const response = await this.toolCaller.callTool("starknet_swap", {
      sellToken: this.settings.spotSellToken,
      buyToken: this.settings.spotBuyToken,
      amount: toDecimalAmount(input.notionalUsd, 6),
      slippage: this.settings.slippage,
    });

    return {
      orderId: `mcp-spot-${Date.now()}`,
      filledNotionalUsd: input.notionalUsd,
      txHash: extractTxHash(response),
    };
  }

  async placePerpShort(input: { market: string; notionalUsd: number }): Promise<ExecutionOrderResult> {
    return {
      orderId: `perp-mock-${Date.now()}`,
      filledNotionalUsd: input.notionalUsd,
      txHash: mockHash(`perp-mock:${input.market}`),
    };
  }

  async neutralizeSpot(input: { market: string; notionalUsd: number }): Promise<ExecutionOrderResult> {
    const estimatedBaseAmount = input.notionalUsd / this.settings.markPrice;
    const response = await this.toolCaller.callTool("starknet_swap", {
      sellToken: this.settings.spotBuyToken,
      buyToken: this.settings.spotSellToken,
      amount: toDecimalAmount(estimatedBaseAmount, 8),
      slippage: this.settings.slippage,
    });

    return {
      orderId: `mcp-neutralize-${Date.now()}`,
      filledNotionalUsd: input.notionalUsd,
      txHash: extractTxHash(response),
    };
  }
}

export class MockExecutionVenue implements ExecutionVenue {
  constructor(
    private readonly scenario: MockExecutionScenario,
    private readonly secondLegDelayMs: number,
    private readonly secondLegFillRatio: number,
  ) {}

  async armDeadmanSwitch(_seconds: number): Promise<void> {
    return;
  }

  async cancelAllOpenOrders(): Promise<void> {
    return;
  }

  async placeSpotBuy(input: { market: string; notionalUsd: number }): Promise<ExecutionOrderResult> {
    await sleep(100);
    return {
      orderId: `spot-${Date.now()}`,
      filledNotionalUsd: input.notionalUsd,
      txHash: mockHash(`spot:${input.market}`),
    };
  }

  async placePerpShort(input: { market: string; notionalUsd: number }): Promise<ExecutionOrderResult> {
    await sleep(this.secondLegDelayMs);

    if (this.scenario === "second_leg_failure") {
      throw new Error("Perp leg rejected by venue in mock scenario.");
    }

    if (this.scenario === "partial_fill") {
      return {
        orderId: `perp-${Date.now()}`,
        filledNotionalUsd: input.notionalUsd * this.secondLegFillRatio,
        txHash: mockHash(`perp_partial:${input.market}`),
      };
    }

    return {
      orderId: `perp-${Date.now()}`,
      filledNotionalUsd: input.notionalUsd,
      txHash: mockHash(`perp:${input.market}`),
    };
  }

  async neutralizeSpot(input: { market: string; notionalUsd: number }): Promise<ExecutionOrderResult> {
    await sleep(100);
    return {
      orderId: `neutralize-${Date.now()}`,
      filledNotionalUsd: input.notionalUsd,
      txHash: mockHash(`neutralize:${input.market}`),
    };
  }
}

function buildNeutralizedOutcome(input: {
  reasonCode: string;
  message: string;
  incidents: ExecutionIncident[];
  deadmanArmed: boolean;
  spotOrder: ExecutionOrderResult;
  neutralizationOrder: ExecutionOrderResult;
}): ExecutionOutcome {
  return {
    status: "neutralized",
    reasonCode: input.reasonCode,
    message: input.message,
    incidents: input.incidents,
    deadmanArmed: input.deadmanArmed,
    spotOrder: input.spotOrder,
    neutralizationOrder: input.neutralizationOrder,
  };
}

export async function executeHedgedEntry(
  venue: ExecutionVenue,
  input: ExecuteEntryInput,
): Promise<ExecutionOutcome> {
  const minNotionalUsd =
    input.marketSnapshot.markPrice * input.marketSnapshot.tradingConfig.minOrderSize;
  if (input.notionalUsd < minNotionalUsd) {
    return {
      status: "blocked",
      reasonCode: "BLOCK_BELOW_MIN_ORDER_SIZE",
      message: `Notional ${input.notionalUsd} is below estimated venue minimum ${minNotionalUsd.toFixed(4)}.`,
      incidents: [],
      deadmanArmed: false,
    };
  }

  let deadmanArmed = false;
  const incidents: ExecutionIncident[] = [];

  if (input.deadmanSwitchEnabled) {
    await venue.armDeadmanSwitch(input.deadmanSwitchSeconds);
    deadmanArmed = true;
  }

  const spotOrder = await venue.placeSpotBuy({
    market: input.market,
    notionalUsd: input.notionalUsd,
  });

  if (spotOrder.filledNotionalUsd > input.maxUnhedgedNotionalUsd) {
    const neutralizationOrder = await venue.neutralizeSpot({
      market: input.market,
      notionalUsd: spotOrder.filledNotionalUsd,
    });

    incidents.push({
      type: "unhedged_exceeds_cap",
      message: "Spot leg exceeded unhedged cap before hedge completion.",
    });

    await venue.cancelAllOpenOrders();
    return buildNeutralizedOutcome({
      reasonCode: "NEUTRALIZED_UNHEDGED_CAP",
      message: "Spot leg exceeded unhedged cap; position neutralized.",
      incidents,
      deadmanArmed,
      spotOrder,
      neutralizationOrder,
    });
  }

  try {
    const perpOrder = await withTimeout(
      venue.placePerpShort({ market: input.market, notionalUsd: input.notionalUsd }),
      input.leggingTimeoutMs,
      `Perp hedge leg timed out after ${input.leggingTimeoutMs}ms.`,
    );

    const residualUnhedged = Math.max(0, spotOrder.filledNotionalUsd - perpOrder.filledNotionalUsd);
    if (residualUnhedged > input.maxUnhedgedNotionalUsd) {
      const neutralizationOrder = await venue.neutralizeSpot({
        market: input.market,
        notionalUsd: residualUnhedged,
      });

      incidents.push({
        type: "unhedged_exceeds_cap",
        message: "Residual unhedged exposure after partial fill exceeded cap.",
      });

      await venue.cancelAllOpenOrders();
      return buildNeutralizedOutcome({
        reasonCode: "NEUTRALIZED_PARTIAL_FILL_UNHEDGED",
        message: "Partial fill left excessive unhedged exposure; neutralized.",
        incidents,
        deadmanArmed,
        spotOrder,
        neutralizationOrder,
      });
    }

    if (residualUnhedged > 0) {
      await sleep(input.partialFillTimeoutMs);
      const neutralizationOrder = await venue.neutralizeSpot({
        market: input.market,
        notionalUsd: residualUnhedged,
      });

      incidents.push({
        type: "unhedged_exceeds_cap",
        message: "Residual unhedged exposure after partial fill did not heal in time.",
      });

      await venue.cancelAllOpenOrders();
      return buildNeutralizedOutcome({
        reasonCode: "NEUTRALIZED_PARTIAL_FILL_TIMEOUT",
        message: "Partial fill remained unhedged beyond timeout; neutralized residual exposure.",
        incidents,
        deadmanArmed,
        spotOrder,
        neutralizationOrder,
      });
    }

    return {
      status: "executed",
      reasonCode: "EXECUTED_HEDGED_ENTRY",
      message: "Spot and perp legs completed within safety bounds.",
      incidents,
      deadmanArmed,
      spotOrder,
      perpOrder,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const isTimeout = reason.toLowerCase().includes("timed out");

    incidents.push({
      type: isTimeout ? "legging_timeout" : "second_leg_failed",
      message: reason,
    });

    const neutralizationOrder = await venue.neutralizeSpot({
      market: input.market,
      notionalUsd: spotOrder.filledNotionalUsd,
    });

    await venue.cancelAllOpenOrders();
    return buildNeutralizedOutcome({
      reasonCode: isTimeout ? "NEUTRALIZED_LEGGING_TIMEOUT" : "NEUTRALIZED_SECOND_LEG_FAILURE",
      message: "Second leg failed safety requirements; spot leg neutralized.",
      incidents,
      deadmanArmed,
      spotOrder,
      neutralizationOrder,
    });
  }
}
