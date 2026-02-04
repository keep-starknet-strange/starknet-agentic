import { canonicalEventKey } from "./normalize.js";
import { computeMid, computeSpreadBps, computeEdgeBpsGross } from "./score.js";
import { hedgeRecipeToString, pickHedgeRecipe } from "./hedge.js";
import {
  OpportunitySchema,
  type Opportunity,
  type VenueBookSnapshot,
} from "./types.js";

export type InputSnapshot = {
  venue: "polymarket" | "limitless" | "raize";
  marketId: string;
  url?: string;
  eventTitle: string;
  endTimeMs?: number;
  outcomeKey: string;
  bestBid?: number;
  bestAsk?: number;
  depth: { bids: { price: number; sizeUsd: number }[]; asks: { price: number; sizeUsd: number }[]; topOfBookUsd?: number };
  timestampMs: number;
};

export function buildVenueSnapshot(input: InputSnapshot): VenueBookSnapshot {
  const mid = computeMid(input.bestBid, input.bestAsk);
  const spreadBps = computeSpreadBps(input.bestBid, input.bestAsk);
  return {
    venue: input.venue,
    marketId: input.marketId,
    url: input.url,
    bestBid: input.bestBid,
    bestAsk: input.bestAsk,
    mid,
    spreadBps,
    depth: {
      bids: input.depth.bids,
      asks: input.depth.asks,
      topOfBookUsd: input.depth.topOfBookUsd,
    },
    timestampMs: input.timestampMs,
  };
}

export function scanArbs(params: {
  snapshots: InputSnapshot[];
  minEdgeBps?: number;
}): Opportunity[] {
  const minEdgeBps = params.minEdgeBps ?? 25;

  // MVP0: simplistic grouping by canonicalEventKey computed from title/end/outcomes.
  // The matching moat comes later; for MVP0 we still expose whyMatched + score.
  const grouped = new Map<string, InputSnapshot[]>();
  for (const s of params.snapshots) {
    const key = canonicalEventKey({ title: s.eventTitle, endTimeMs: s.endTimeMs, outcomes: [s.outcomeKey] });
    const arr = grouped.get(key) ?? [];
    arr.push(s);
    grouped.set(key, arr);
  }

  const out: Opportunity[] = [];
  for (const [key, snaps] of grouped.entries()) {
    if (snaps.length < 2) continue;

    const venueMarketIds: Record<string, string> = {};
    const snapshots = snaps.map((s) => {
      venueMarketIds[s.venue] = s.marketId;
      return buildVenueSnapshot(s);
    });

    // pick best available mids
    const mids = snapshots
      .map((s) => ({ venue: s.venue, mid: s.mid }))
      .filter(
        (x): x is { venue: InputSnapshot["venue"]; mid: number } => x.mid != null,
      );
    if (mids.length < 2) continue;

    // Compare first two venues for MVP0; later we do full pairwise.
    const aMid = mids[0]!.mid;
    const bMid = mids[1]!.mid;
    const aVenue = mids[0]!.venue;
    const bVenue = mids[1]!.venue;

    const impliedProbDelta = aMid - bMid;
    const edgeBpsGross = computeEdgeBpsGross(aMid, bMid);
    if (edgeBpsGross < minEdgeBps) continue;

    const starknetNative = snaps.some((s) => s.venue === "raize");
    const hedge = pickHedgeRecipe({
      isStarknetNative: starknetNative,
      canAssessLiquidity: snaps.every((s) => (s.depth?.topOfBookUsd ?? 0) > 0),
      isIntermittent: true,
    });

    const recipe = `Opportunity: ${snaps[0].eventTitle}\n` +
      `Compare ${aVenue} vs ${bVenue} on outcome ${snaps[0].outcomeKey}. ` +
      `Edge (gross): ${edgeBpsGross.toFixed(0)} bps. ` +
      `Manual: buy the cheaper implied probability venue, hedge on the higher implied probability venue if supported.`;

    const opp: Opportunity = {
      canonicalEventKey: key,
      eventTitle: snaps[0].eventTitle,
      eventEndTimeMs: snaps[0].endTimeMs,
      outcomeKey: snaps[0].outcomeKey,
      starknetNative,
      venueMarketIds,
      snapshots,
      impliedProbDelta,
      edgeBpsGross,
      feeModel: {
        polymarket: "unknown (assume taker unless otherwise specified)",
        limitless: "unknown",
        raize: "unknown",
      },
      settlementModel: {
        polymarket: "hybrid CLOB (signed orders)",
        limitless: "unknown (SDK-first)",
        raize: "Starknet-native prediction market",
      },
      resolutionRulesRaw: {},
      matchConfidence: {
        score: 0.7,
        whyMatched: [
          "normalized title similarity",
          "same end time",
          "same outcome key",
        ],
      },
      recipe,
      starknetHedgeRecipe: hedgeRecipeToString(hedge),
    };

    OpportunitySchema.parse(opp);
    out.push(opp);
  }

  return out;
}
