/**
 * Agent Debate System — Round 2 deliberation between agent personas.
 *
 * After Round 1 independent forecasts, agents see each other's estimates
 * and can revise their probabilities. Partial convergence toward group mean
 * with counter-arguments for large disagreements.
 */

export interface Round1Result {
  agentId: string;
  agentName: string;
  probability: number;
  brierScore: number;
}

export interface DebateResult {
  agentId: string;
  agentName: string;
  originalProbability: number;
  revisedProbability: number;
  counterArguments: string[];
  debateReasoning: string;
}

/**
 * Build a brief summarizing Round 1 results for the debate.
 */
export function buildDebateBrief(results: Round1Result[]): string {
  const lines = results.map(
    (r) =>
      `- ${r.agentName}: ${Math.round(r.probability * 100)}% (Brier: ${r.brierScore.toFixed(3)})`
  );
  const avg =
    results.reduce((sum, r) => sum + r.probability, 0) / results.length;

  return `## Round 1 Estimates\n${lines.join("\n")}\n\nGroup average: ${Math.round(avg * 100)}%`;
}

/**
 * Simulate a debate round for a single agent.
 *
 * The agent partially converges toward the group mean, but maintains
 * persona-specific bias. Generates counter-arguments for large disagreements.
 */
export function simulateDebateRound(
  agentId: string,
  agentName: string,
  round1Prob: number,
  otherEstimates: Round1Result[],
  question: string
): DebateResult {
  const allProbs = otherEstimates.map((e) => e.probability);
  const groupMean =
    allProbs.reduce((sum, p) => sum + p, 0) / allProbs.length;

  // Convergence factor: how much to move toward group mean (0.1 - 0.3)
  const convergenceFactor = getConvergenceFactor(agentId);
  const delta = groupMean - round1Prob;
  let revisedProbability = round1Prob + delta * convergenceFactor;

  // Add small persona-specific noise
  const noise = (simpleHash(`${agentId}-${question}`) % 50 - 25) / 1000;
  revisedProbability += noise;
  revisedProbability = Math.max(0.03, Math.min(0.97, revisedProbability));

  // Generate counter-arguments for agents with >15pp disagreement
  const counterArguments: string[] = [];
  for (const other of otherEstimates) {
    if (other.agentId === agentId) continue;
    const disagreement = Math.abs(round1Prob - other.probability);
    if (disagreement > 0.15) {
      counterArguments.push(
        generateCounterArgument(agentId, agentName, round1Prob, other)
      );
    }
  }

  const revisedPct = Math.round(revisedProbability * 100);
  const originalPct = Math.round(round1Prob * 100);
  const groupPct = Math.round(groupMean * 100);
  const direction =
    revisedProbability > round1Prob ? "upward" : "downward";

  let debateReasoning = `### ${agentName} — Round 2 Revision\n\n`;
  debateReasoning += `After reviewing other agents' estimates (group avg: ${groupPct}%), `;

  if (Math.abs(revisedProbability - round1Prob) < 0.02) {
    debateReasoning += `I'm maintaining my position at ${revisedPct}%. The group is broadly aligned with my initial estimate.\n`;
  } else {
    debateReasoning += `I'm adjusting ${direction} from ${originalPct}% to **${revisedPct}%**.\n\n`;
    debateReasoning += `The group consensus suggests I may have ${
      revisedProbability > round1Prob
        ? "underweighted some bullish signals"
        : "been too optimistic on certain factors"
    }.\n`;
  }

  if (counterArguments.length > 0) {
    debateReasoning += `\n**Counter-arguments:**\n${counterArguments.map((c) => `- ${c}`).join("\n")}\n`;
  }

  debateReasoning += `\n**Revised estimate: ${revisedPct}%**`;

  return {
    agentId,
    agentName,
    originalProbability: round1Prob,
    revisedProbability,
    counterArguments,
    debateReasoning,
  };
}

/**
 * Run a full debate round for all agents.
 */
export function runDebateRound(
  round1Results: Round1Result[],
  question: string
): DebateResult[] {
  return round1Results.map((r) =>
    simulateDebateRound(
      r.agentId,
      r.agentName,
      r.probability,
      round1Results,
      question
    )
  );
}

function getConvergenceFactor(agentId: string): number {
  const factors: Record<string, number> = {
    alpha: 0.15, // Superforecaster — converges moderately
    beta: 0.10, // Quant — sticks to data, converges less
    gamma: 0.25, // Market-maker — follows consensus more
    delta: 0.20, // Data analyst — open to revision
    epsilon: 0.30, // News analyst — most influenced by group
  };
  return factors[agentId] ?? 0.15;
}

function generateCounterArgument(
  _agentId: string,
  agentName: string,
  myProb: number,
  other: Round1Result
): string {
  const diff = myProb - other.probability;
  const direction = diff > 0 ? "higher" : "lower";

  const templates = [
    `${other.agentName} estimates ${Math.round(other.probability * 100)}%, ${Math.abs(Math.round(diff * 100))}pp ${direction} than my view. Their ${other.brierScore < 0.15 ? "strong track record" : "methodology"} warrants consideration, but I believe ${direction === "higher" ? "downside risks are underweighted" : "upside catalysts are being missed"}.`,
    `I disagree with ${other.agentName}'s ${Math.round(other.probability * 100)}% estimate — my analysis of ${agentName === "AlphaForecaster" ? "base rates" : agentName === "BetaAnalyst" ? "quantitative signals" : agentName === "GammaTrader" ? "market structure" : agentName === "DeltaScout" ? "primary data" : "news flow"} suggests a ${direction === "higher" ? "more optimistic" : "more conservative"} outlook.`,
    `The ${Math.abs(Math.round(diff * 100))}pp gap between my estimate and ${other.agentName}'s reflects different weighting of ${direction === "higher" ? "risk factors vs. growth indicators" : "momentum signals vs. structural constraints"}.`,
  ];

  const idx = simpleHash(`${_agentId}-${other.agentId}`) % templates.length;
  return templates[idx];
}

function simpleHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
