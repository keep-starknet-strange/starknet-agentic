import { z } from "zod";

export type VenueId = "polymarket" | "limitless" | "raize";

export const PriceLevelSchema = z.object({
  price: z.number().min(0).max(1),
  sizeUsd: z.number().nonnegative(),
});
export type PriceLevel = z.infer<typeof PriceLevelSchema>;

export const VenueBookSnapshotSchema = z.object({
  venue: z.enum(["polymarket", "limitless", "raize"]),
  marketId: z.string(),
  url: z.string().url().optional(),
  bestBid: z.number().min(0).max(1).optional(),
  bestAsk: z.number().min(0).max(1).optional(),
  mid: z.number().min(0).max(1).optional(),
  spreadBps: z.number().nonnegative().optional(),
  depth: z.object({
    bids: z.array(PriceLevelSchema).default([]),
    asks: z.array(PriceLevelSchema).default([]),
    topOfBookUsd: z.number().nonnegative().optional(),
  }),
  timestampMs: z.number().int().nonnegative(),
});
export type VenueBookSnapshot = z.infer<typeof VenueBookSnapshotSchema>;

export const MatchConfidenceSchema = z.object({
  score: z.number().min(0).max(1),
  whyMatched: z.array(z.string()).min(1),
});
export type MatchConfidence = z.infer<typeof MatchConfidenceSchema>;

export const OpportunitySchema = z.object({
  canonicalEventKey: z.string(),
  eventTitle: z.string(),
  eventEndTimeMs: z.number().int().nonnegative().optional(),
  outcomeKey: z.string(),
  starknetNative: z.boolean(),
  venueMarketIds: z.record(z.string(), z.string()),
  snapshots: z.array(VenueBookSnapshotSchema).min(2),
  impliedProbDelta: z.number(),
  edgeBpsGross: z.number(),
  feeModel: z.record(z.string(), z.string()).default({}),
  settlementModel: z.record(z.string(), z.string()).default({}),
  resolutionRulesRaw: z.record(z.string(), z.string()).default({}),
  matchConfidence: MatchConfidenceSchema,
  recipe: z.string(),
  starknetHedgeRecipe: z.string(),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export const HedgeRecipeSchema = z.enum([
  "ekubo_spot_swap",
  "re7_park",
  "hold_base",
]);
export type HedgeRecipe = z.infer<typeof HedgeRecipeSchema>;
