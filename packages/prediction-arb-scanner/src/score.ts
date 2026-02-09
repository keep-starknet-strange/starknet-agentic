export function computeSpreadBps(bestBid?: number, bestAsk?: number): number | undefined {
  if (bestBid == null || bestAsk == null) return undefined;
  if (bestBid <= 0 || bestAsk <= 0) return undefined;
  if (bestBid > bestAsk) return undefined;
  const mid = (bestBid + bestAsk) / 2;
  if (mid === 0) return undefined;
  return ((bestAsk - bestBid) / mid) * 10000;
}

export function computeMid(bestBid?: number, bestAsk?: number): number | undefined {
  if (bestBid == null || bestAsk == null) return undefined;
  if (bestBid > bestAsk) return undefined;
  return (bestBid + bestAsk) / 2;
}

export function computeEdgeBpsGross(aMid: number, bMid: number): number {
  return Math.abs(aMid - bMid) * 10000;
}
