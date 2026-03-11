import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { executeHedgedEntry, McpSpotExecutionVenue, MockExecutionVenue } from "../src/execution.js";

const snapshot = {
  market: "ETH-USD",
  markPrice: 2000,
  indexPrice: 1999,
  fundingRate: 0.00001,
  tradingConfig: {
    minOrderSize: 0.01,
    minOrderSizeChange: 0.001,
    minPriceChange: 0.1,
  },
};

describe("executeHedgedEntry", () => {
  it("blocks when notional is below estimated venue minimum", async () => {
    const venue = new MockExecutionVenue("success", 20, 1);
    const outcome = await executeHedgedEntry(venue, {
      market: "ETH-USD",
      notionalUsd: 5,
      maxUnhedgedNotionalUsd: 100,
      leggingTimeoutMs: 200,
      partialFillTimeoutMs: 10,
      deadmanSwitchEnabled: true,
      deadmanSwitchSeconds: 30,
      marketSnapshot: snapshot,
    });

    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.reasonCode, "BLOCK_BELOW_MIN_ORDER_SIZE");
  });

  it("executes successfully when both legs fill within bounds", async () => {
    const venue = new MockExecutionVenue("success", 20, 1);
    const outcome = await executeHedgedEntry(venue, {
      market: "ETH-USD",
      notionalUsd: 1000,
      maxUnhedgedNotionalUsd: 1200,
      leggingTimeoutMs: 200,
      partialFillTimeoutMs: 10,
      deadmanSwitchEnabled: true,
      deadmanSwitchSeconds: 30,
      marketSnapshot: snapshot,
    });

    assert.equal(outcome.status, "executed");
    assert.equal(outcome.reasonCode, "EXECUTED_HEDGED_ENTRY");
    assert.ok(outcome.spotOrder);
    assert.ok(outcome.perpOrder);
  });

  it("neutralizes when second leg fails", async () => {
    const venue = new MockExecutionVenue("second_leg_failure", 20, 1);
    const outcome = await executeHedgedEntry(venue, {
      market: "ETH-USD",
      notionalUsd: 1000,
      maxUnhedgedNotionalUsd: 1200,
      leggingTimeoutMs: 200,
      partialFillTimeoutMs: 10,
      deadmanSwitchEnabled: true,
      deadmanSwitchSeconds: 30,
      marketSnapshot: snapshot,
    });

    assert.equal(outcome.status, "neutralized");
    assert.equal(outcome.reasonCode, "NEUTRALIZED_SECOND_LEG_FAILURE");
    assert.ok(outcome.neutralizationOrder);
    assert.equal(outcome.incidents[0]?.type, "second_leg_failed");
  });

  it("neutralizes when second leg times out", async () => {
    const venue = new MockExecutionVenue("success", 250, 1);
    const outcome = await executeHedgedEntry(venue, {
      market: "ETH-USD",
      notionalUsd: 1000,
      maxUnhedgedNotionalUsd: 1200,
      leggingTimeoutMs: 40,
      partialFillTimeoutMs: 10,
      deadmanSwitchEnabled: false,
      deadmanSwitchSeconds: 30,
      marketSnapshot: snapshot,
    });

    assert.equal(outcome.status, "neutralized");
    assert.equal(outcome.reasonCode, "NEUTRALIZED_LEGGING_TIMEOUT");
    assert.equal(outcome.incidents[0]?.type, "legging_timeout");
  });

  it("neutralizes immediately when first leg breaches unhedged cap", async () => {
    const venue = new MockExecutionVenue("success", 20, 1);
    const outcome = await executeHedgedEntry(venue, {
      market: "ETH-USD",
      notionalUsd: 1000,
      maxUnhedgedNotionalUsd: 100,
      leggingTimeoutMs: 200,
      partialFillTimeoutMs: 10,
      deadmanSwitchEnabled: false,
      deadmanSwitchSeconds: 30,
      marketSnapshot: snapshot,
    });

    assert.equal(outcome.status, "neutralized");
    assert.equal(outcome.reasonCode, "NEUTRALIZED_UNHEDGED_CAP");
    assert.equal(outcome.incidents[0]?.type, "unhedged_exceeds_cap");
  });

  it("neutralizes unresolved residual after partial fill timeout", async () => {
    const venue = new MockExecutionVenue("partial_fill", 20, 0.4);
    const outcome = await executeHedgedEntry(venue, {
      market: "ETH-USD",
      notionalUsd: 1000,
      maxUnhedgedNotionalUsd: 1200,
      leggingTimeoutMs: 200,
      partialFillTimeoutMs: 20,
      deadmanSwitchEnabled: false,
      deadmanSwitchSeconds: 30,
      marketSnapshot: snapshot,
    });

    assert.equal(outcome.status, "neutralized");
    assert.equal(outcome.reasonCode, "NEUTRALIZED_PARTIAL_FILL_TIMEOUT");
    assert.equal(outcome.incidents[0]?.type, "unhedged_exceeds_cap");
  });
});

describe("McpSpotExecutionVenue", () => {
  it("calls starknet_swap for spot buy and reverse swap for neutralization", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const toolCaller = {
      callTool: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { transactionHash: "0xabc" };
      },
    };

    const venue = new McpSpotExecutionVenue(toolCaller, {
      spotSellToken: "USDC",
      spotBuyToken: "ETH",
      slippage: 0.02,
      markPrice: 2000,
    });

    const spot = await venue.placeSpotBuy({ market: "ETH-USD", notionalUsd: 1000 });
    const unwind = await venue.neutralizeSpot({ market: "ETH-USD", notionalUsd: 1000 });

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.name, "starknet_swap");
    assert.equal(calls[0]?.args.sellToken, "USDC");
    assert.equal(calls[0]?.args.buyToken, "ETH");
    assert.equal(calls[0]?.args.amount, "1000");

    assert.equal(calls[1]?.name, "starknet_swap");
    assert.equal(calls[1]?.args.sellToken, "ETH");
    assert.equal(calls[1]?.args.buyToken, "USDC");
    assert.equal(calls[1]?.args.amount, "0.5");

    assert.equal(spot.txHash, "0xabc");
    assert.equal(unwind.txHash, "0xabc");
  });
});
