import { describe, it, expect } from "vitest";
import { scanArbs, buildVenueSnapshot, type InputSnapshot } from "../src/index.js";
import { polymarketFixture, raizeFixture, limitlessFixture } from "../src/fixtures.js";
import { normalizeTitle, canonicalEventKey } from "../src/normalize.js";
import { computeMid, computeSpreadBps, computeEdgeBpsGross } from "../src/score.js";
import { pickHedgeRecipe, hedgeRecipeToString } from "../src/hedge.js";

// ============================================================================
// scanArbs — core scanner logic
// ============================================================================

describe("scanArbs", () => {
  it("matches cross-venue event and emits Starknet hedge recipe", () => {
    const opps = scanArbs({
      snapshots: [polymarketFixture, raizeFixture, limitlessFixture],
      minEdgeBps: 25,
    });

    expect(opps.length).toBeGreaterThanOrEqual(1);
    const opp = opps[0];

    expect(opp.starknetNative).toBe(true);
    expect(opp.venueMarketIds.polymarket).toBeDefined();
    expect(opp.venueMarketIds.raize).toBeDefined();

    const hasTopOfBook = opp.snapshots.every((s) => (s.depth.topOfBookUsd ?? 0) > 0);
    expect(hasTopOfBook).toBe(true);

    expect(opp.starknetHedgeRecipe.toLowerCase()).toContain("starknet");
    expect(opp.starknetHedgeRecipe.length).toBeGreaterThan(20);
  });

  it("returns empty array when only one venue snapshot provided", () => {
    const opps = scanArbs({
      snapshots: [polymarketFixture],
      minEdgeBps: 25,
    });
    expect(opps).toEqual([]);
  });

  it("returns empty array when edge is below threshold", () => {
    const snap1: InputSnapshot = {
      ...polymarketFixture,
      venue: "polymarket",
      bestBid: 0.50,
      bestAsk: 0.52,
    };
    const snap2: InputSnapshot = {
      ...raizeFixture,
      venue: "raize",
      bestBid: 0.50,
      bestAsk: 0.52,
    };
    const opps = scanArbs({ snapshots: [snap1, snap2], minEdgeBps: 25 });
    expect(opps).toEqual([]);
  });

  it("uses default minEdgeBps of 25 when not specified", () => {
    const snap1: InputSnapshot = {
      ...polymarketFixture,
      venue: "polymarket",
      bestBid: 0.50,
      bestAsk: 0.52,
    };
    const snap2: InputSnapshot = {
      ...raizeFixture,
      venue: "raize",
      bestBid: 0.51,
      bestAsk: 0.53,
    };
    // mid1 = 0.51, mid2 = 0.52 => edge = 100 bps
    const opps = scanArbs({ snapshots: [snap1, snap2] });
    expect(opps.length).toBeGreaterThanOrEqual(1);
  });

  it("handles snapshots with missing bid/ask", () => {
    const snap1: InputSnapshot = {
      ...polymarketFixture,
      venue: "polymarket",
      bestBid: undefined,
      bestAsk: undefined,
    };
    const snap2: InputSnapshot = {
      ...raizeFixture,
      venue: "raize",
      bestBid: undefined,
      bestAsk: undefined,
    };
    const opps = scanArbs({ snapshots: [snap1, snap2], minEdgeBps: 25 });
    expect(opps).toEqual([]);
  });

  it("marks opportunity as not starknet native when no raize venue", () => {
    // Use identical title so they match into the same canonical event key
    const commonTitle = "STRK Token Price above $1 by 2026-12-31?";
    const snap1: InputSnapshot = {
      ...polymarketFixture,
      venue: "polymarket",
      eventTitle: commonTitle,
      bestBid: 0.40,
      bestAsk: 0.42,
    };
    const snap2: InputSnapshot = {
      ...limitlessFixture,
      venue: "limitless",
      eventTitle: commonTitle,
      bestBid: 0.50,
      bestAsk: 0.52,
    };
    const opps = scanArbs({ snapshots: [snap1, snap2], minEdgeBps: 25 });
    expect(opps.length).toBeGreaterThanOrEqual(1);
    expect(opps[0].starknetNative).toBe(false);
  });

  it("validates opportunity against Zod schema (no throws)", () => {
    const opps = scanArbs({
      snapshots: [polymarketFixture, raizeFixture, limitlessFixture],
      minEdgeBps: 1,
    });
    expect(opps.length).toBeGreaterThanOrEqual(1);
  });

  it("populates edgeBpsGross and impliedProbDelta correctly", () => {
    const opps = scanArbs({
      snapshots: [polymarketFixture, raizeFixture],
      minEdgeBps: 1,
    });
    expect(opps.length).toBeGreaterThanOrEqual(1);
    const opp = opps[0];
    expect(opp.edgeBpsGross).toBeGreaterThan(0);
    expect(typeof opp.impliedProbDelta).toBe("number");
  });
});

// ============================================================================
// buildVenueSnapshot
// ============================================================================

describe("buildVenueSnapshot", () => {
  it("computes mid and spread from bid/ask", () => {
    const snap = buildVenueSnapshot(polymarketFixture);
    expect(snap.mid).toBeCloseTo(0.43, 2);
    expect(snap.spreadBps).toBeDefined();
    expect(snap.spreadBps!).toBeGreaterThan(0);
  });

  it("handles missing bid/ask gracefully", () => {
    const input: InputSnapshot = {
      ...polymarketFixture,
      bestBid: undefined,
      bestAsk: undefined,
    };
    const snap = buildVenueSnapshot(input);
    expect(snap.mid).toBeUndefined();
    expect(snap.spreadBps).toBeUndefined();
  });

  it("preserves depth data", () => {
    const snap = buildVenueSnapshot(polymarketFixture);
    expect(snap.depth.bids.length).toBeGreaterThan(0);
    expect(snap.depth.asks.length).toBeGreaterThan(0);
    expect(snap.depth.topOfBookUsd).toBe(500);
  });
});

// ============================================================================
// normalize — title normalization and canonical keys
// ============================================================================

describe("normalizeTitle", () => {
  it("lowercases and trims whitespace", () => {
    expect(normalizeTitle("  HELLO  WORLD  ")).toBe("hello world");
  });

  it("removes special characters except hyphens and colons", () => {
    expect(normalizeTitle("Token > $1?")).toBe("token  1");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

describe("canonicalEventKey", () => {
  it("produces deterministic hash for same inputs", () => {
    const key1 = canonicalEventKey({ title: "Hello", outcomes: ["YES"] });
    const key2 = canonicalEventKey({ title: "Hello", outcomes: ["YES"] });
    expect(key1).toBe(key2);
  });

  it("produces different hash for different titles", () => {
    const key1 = canonicalEventKey({ title: "Hello", outcomes: ["YES"] });
    const key2 = canonicalEventKey({ title: "World", outcomes: ["YES"] });
    expect(key1).not.toBe(key2);
  });

  it("normalizes title before hashing", () => {
    const key1 = canonicalEventKey({ title: "Hello World", outcomes: ["YES"] });
    const key2 = canonicalEventKey({ title: "  hello  world  ", outcomes: ["YES"] });
    expect(key1).toBe(key2);
  });

  it("sorts outcomes for determinism", () => {
    const key1 = canonicalEventKey({ title: "X", outcomes: ["a", "b"] });
    const key2 = canonicalEventKey({ title: "X", outcomes: ["b", "a"] });
    expect(key1).toBe(key2);
  });
});

// ============================================================================
// score — math helpers
// ============================================================================

describe("computeMid", () => {
  it("returns average of bid and ask", () => {
    expect(computeMid(0.4, 0.6)).toBe(0.5);
  });

  it("returns undefined when bid is missing", () => {
    expect(computeMid(undefined, 0.6)).toBeUndefined();
  });

  it("returns undefined when ask is missing", () => {
    expect(computeMid(0.4, undefined)).toBeUndefined();
  });

  it("returns undefined for inverted bid/ask", () => {
    expect(computeMid(0.6, 0.4)).toBeUndefined();
  });
});

describe("computeSpreadBps", () => {
  it("computes spread in basis points", () => {
    expect(computeSpreadBps(0.40, 0.60)).toBeCloseTo(4000, 0);
  });

  it("returns undefined for missing values", () => {
    expect(computeSpreadBps(undefined, 0.5)).toBeUndefined();
    expect(computeSpreadBps(0.5, undefined)).toBeUndefined();
  });

  it("returns undefined for zero bid/ask", () => {
    expect(computeSpreadBps(0, 0.5)).toBeUndefined();
    expect(computeSpreadBps(0.5, 0)).toBeUndefined();
  });

  it("returns undefined for inverted bid/ask", () => {
    expect(computeSpreadBps(0.6, 0.4)).toBeUndefined();
  });
});

describe("computeEdgeBpsGross", () => {
  it("computes absolute difference in basis points", () => {
    expect(computeEdgeBpsGross(0.50, 0.55)).toBeCloseTo(500, 0);
  });

  it("returns same value regardless of order", () => {
    expect(computeEdgeBpsGross(0.50, 0.55)).toBe(computeEdgeBpsGross(0.55, 0.50));
  });

  it("returns 0 for equal mids", () => {
    expect(computeEdgeBpsGross(0.50, 0.50)).toBe(0);
  });
});

// ============================================================================
// hedge — recipe selection
// ============================================================================

describe("pickHedgeRecipe", () => {
  it("returns hold_base when not starknet native", () => {
    expect(pickHedgeRecipe({
      isStarknetNative: false,
      canAssessLiquidity: true,
      isIntermittent: false,
    })).toBe("hold_base");
  });

  it("returns hold_base when cannot assess liquidity", () => {
    expect(pickHedgeRecipe({
      isStarknetNative: true,
      canAssessLiquidity: false,
      isIntermittent: false,
    })).toBe("hold_base");
  });

  it("returns re7_park for intermittent starknet native with liquidity", () => {
    expect(pickHedgeRecipe({
      isStarknetNative: true,
      canAssessLiquidity: true,
      isIntermittent: true,
    })).toBe("re7_park");
  });

  it("returns ekubo_spot_swap for non-intermittent starknet native with liquidity", () => {
    expect(pickHedgeRecipe({
      isStarknetNative: true,
      canAssessLiquidity: true,
      isIntermittent: false,
    })).toBe("ekubo_spot_swap");
  });
});

describe("hedgeRecipeToString", () => {
  it("returns non-empty string for all recipe types", () => {
    expect(hedgeRecipeToString("ekubo_spot_swap")).toBeTruthy();
    expect(hedgeRecipeToString("re7_park")).toBeTruthy();
    expect(hedgeRecipeToString("hold_base")).toBeTruthy();
  });

  it("mentions Starknet for starknet-native recipes", () => {
    expect(hedgeRecipeToString("ekubo_spot_swap").toLowerCase()).toContain("starknet");
    expect(hedgeRecipeToString("re7_park").toLowerCase()).toContain("starknet");
  });
});
