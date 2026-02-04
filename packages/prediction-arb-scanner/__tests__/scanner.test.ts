import { describe, it, expect } from "vitest";
import { scanArbs } from "../src/index.js";
import { polymarketFixture, raizeFixture, limitlessFixture } from "../src/fixtures.js";

describe("prediction-arb-scanner MVP0", () => {
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

    // Liquidity sanity: must have a depth proxy
    const hasTopOfBook = opp.snapshots.every((s) => (s.depth.topOfBookUsd ?? 0) > 0);
    expect(hasTopOfBook).toBe(true);

    // Hedge recipe present and Starknet-specific
    expect(opp.starknetHedgeRecipe.toLowerCase()).toContain("starknet");
    expect(opp.starknetHedgeRecipe.length).toBeGreaterThan(20);
  });
});
