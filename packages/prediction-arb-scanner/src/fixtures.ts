// Minimal fixtures used for deterministic tests.

export const polymarketFixture = {
  venue: "polymarket",
  marketId: "poly-123",
  url: "https://polymarket.com/market/example",
  eventTitle: "STRK Token Price above $1 by 2026-12-31?",
  endTimeMs: 1798675200000,
  outcomeKey: "YES",
  bestBid: 0.42,
  bestAsk: 0.44,
  depth: { bids: [{ price: 0.42, sizeUsd: 250 }], asks: [{ price: 0.44, sizeUsd: 250 }], topOfBookUsd: 500 },
  timestampMs: 1770100000000,
} as const;

export const raizeFixture = {
  venue: "raize",
  marketId: "raize-789",
  url: "https://raize.club/",
  eventTitle: "STRK token price above $1 by 2026-12-31",
  endTimeMs: 1798675200000,
  outcomeKey: "YES",
  bestBid: 0.49,
  bestAsk: 0.51,
  depth: { bids: [{ price: 0.49, sizeUsd: 150 }], asks: [{ price: 0.51, sizeUsd: 150 }], topOfBookUsd: 300 },
  timestampMs: 1770100000000,
} as const;

export const limitlessFixture = {
  venue: "limitless",
  marketId: "lim-456",
  url: "https://limitless.exchange/",
  eventTitle: "STRK price > $1 on 2026-12-31",
  endTimeMs: 1798675200000,
  outcomeKey: "YES",
  bestBid: 0.47,
  bestAsk: 0.48,
  depth: { bids: [{ price: 0.47, sizeUsd: 200 }], asks: [{ price: 0.48, sizeUsd: 200 }], topOfBookUsd: 400 },
  timestampMs: 1770100000000,
} as const;
