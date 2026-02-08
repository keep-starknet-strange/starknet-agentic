/**
 * Brier score utilities for prediction accuracy tracking.
 *
 * Brier score = (predicted_probability - actual_outcome)^2
 * Range: 0 (perfect) to 1 (worst).
 * Lower is better.
 */

const SCALE = 1e18;

/** Compute a single Brier score (off-chain). */
export function brierScore(predictedProb: number, actualOutcome: 0 | 1): number {
  return (predictedProb - actualOutcome) ** 2;
}

/** Compute average Brier score from cumulative values (matches on-chain representation). */
export function averageBrier(cumulativeScaled: bigint, count: bigint): number {
  if (count === 0n) return 0;
  return Number(cumulativeScaled) / Number(count) / SCALE;
}

/** Convert on-chain scaled probability (0..1e18) to a 0..1 float. */
export function fromScaled(scaled: bigint): number {
  return Number(scaled) / SCALE;
}

/** Convert a 0..1 float to on-chain scaled probability (0..1e18). */
export function toScaled(prob: number): bigint {
  return BigInt(Math.round(prob * SCALE));
}

/** Compute implied probability from pool sizes. */
export function impliedProbability(yesPool: bigint, noPool: bigint): number {
  const total = yesPool + noPool;
  if (total === 0n) return 0.5;
  return Number(yesPool) / Number(total);
}

/** Compute payout for a winning bet. */
export function computePayout(
  userBet: bigint,
  totalPool: bigint,
  winningPool: bigint,
  feeBps: number
): bigint {
  if (winningPool === 0n) return 0n;
  return (userBet * totalPool * BigInt(10000 - feeBps)) / (winningPool * 10000n);
}

/** Format Brier score for display. */
export function formatBrier(score: number): string {
  return score.toFixed(3);
}

/** Get accuracy tier based on Brier score. */
export function accuracyTier(avgBrier: number): {
  label: string;
  color: string;
} {
  if (avgBrier < 0.1) return { label: "Excellent", color: "text-neo-green" };
  if (avgBrier < 0.2) return { label: "Good", color: "text-neo-blue" };
  if (avgBrier < 0.3) return { label: "Fair", color: "text-neo-yellow" };
  return { label: "Poor", color: "text-neo-pink" };
}

/** Edge BPS between two probability estimates (reuses prediction-arb-scanner pattern). */
export function computeEdgeBps(probA: number, probB: number): number {
  return Math.abs(probA - probB) * 10000;
}
