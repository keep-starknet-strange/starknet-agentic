/**
 * Performance Tracking
 * Track agent performance across games and strategies
 */

import type { PerformanceRecord, AgentStats } from './types';
import { getAgent } from './registry';

type PerformanceInput = Omit<PerformanceRecord, 'timestamp'> & { timestamp?: number };
type TrackingState = { history: Map<string, PerformanceRecord[]> };

/**
 * Gets or initializes the global tracking state.
 * Uses globalThis to persist state across module reloads in tests.
 * @returns The tracking state containing performance history
 */
function getTrackingState(): TrackingState {
  const globalState = globalThis as typeof globalThis & {
    __strategyMarketplaceTrackingState?: TrackingState;
  };
  if (!globalState.__strategyMarketplaceTrackingState) {
    globalState.__strategyMarketplaceTrackingState = {
      history: new Map<string, PerformanceRecord[]>()
    };
  }
  return globalState.__strategyMarketplaceTrackingState;
}

/**
 * Track a game result
 */
export async function trackPerformance(record: PerformanceInput): Promise<void> {
  const validatedRecord = validatePerformanceInput(record);
  const { agentId, game, result, roi } = validatedRecord;
  
  // Validate agent exists
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  
  const performance: PerformanceRecord = {
    ...validatedRecord,
    timestamp: validatedRecord.timestamp ?? Date.now()
  };
  
  // Store performance record
  await storePerformance(performance);
  
  console.log(`[Tracking] ${agent.name}: ${result} on ${game} (ROI: ${roi}x)`);
}

/**
 * Get agent statistics
 */
export async function getAgentStats(agentId: string): Promise<AgentStats> {
  const normalizedAgentId = requireNonEmptyString(agentId, 'agentId');
  const performances = await getPerformanceHistory(normalizedAgentId);
  
  if (performances.length === 0) {
    return {
      agentId: normalizedAgentId,
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalRoi: 0,
      avgRoi: 0,
      gamesByType: {},
      strategies: {}
    };
  }
  
  const wins = performances.filter(p => p.result === 'win').length;
  const losses = performances.filter(p => p.result === 'loss').length;
  const draws = performances.filter(p => p.result === 'draw').length;
  const totalRoi = performances.reduce((sum, p) => sum + p.roi, 0);
  
  const gamesByType: Record<string, number> = {};
  const strategyStats: Record<string, { games: number; wins: number; totalRoi: number }> = {};
  
  for (const p of performances) {
    gamesByType[p.game] = (gamesByType[p.game] || 0) + 1;
    
    if (!strategyStats[p.strategy]) {
      strategyStats[p.strategy] = { games: 0, wins: 0, totalRoi: 0 };
    }
    strategyStats[p.strategy].games++;
    strategyStats[p.strategy].totalRoi += p.roi;
    if (p.result === 'win') strategyStats[p.strategy].wins++;
  }

  const strategies: Record<string, { games: number; wins: number; avgRoi: number }> = {};
  for (const [strategy, data] of Object.entries(strategyStats)) {
    strategies[strategy] = {
      games: data.games,
      wins: data.wins,
      avgRoi: data.totalRoi / data.games
    };
  }
  
  return {
    agentId: normalizedAgentId,
    totalGames: performances.length,
    wins,
    losses,
    draws,
    totalRoi,
    avgRoi: totalRoi / performances.length,
    gamesByType,
    strategies
  };
}

/**
 * Get win rate for an agent
 */
export async function getWinRate(agentId: string): Promise<number> {
  const stats = await getAgentStats(agentId);
  if (stats.totalGames === 0) return 0;
  return stats.wins / stats.totalGames;
}

/**
 * Get top strategies by performance
 */
export async function getTopStrategies(agentId: string, limit = 5): Promise<Array<{
  strategy: string;
  games: number;
  avgRoi: number;
  winRate: number;
}>> {
  const normalizedAgentId = requireNonEmptyString(agentId, 'agentId');
  const normalizedLimit = Math.trunc(requireFiniteNumber(limit, 'limit'));
  if (normalizedLimit <= 0) {
    throw new Error('Invalid limit: expected a positive integer');
  }

  const stats = await getAgentStats(normalizedAgentId);
  
  return Object.entries(stats.strategies)
    .map(([strategy, data]) => ({
      strategy,
      games: data.games,
      avgRoi: data.avgRoi,
      winRate: data.games > 0 ? data.wins / data.games : 0
    }))
    .sort((a, b) => b.avgRoi - a.avgRoi)
    .slice(0, normalizedLimit);
}

// Helper functions

/**
 * Stores a performance record in the tracking history.
 * Appends to existing history for the agent.
 * @param record - The performance record to store
 * @returns Promise that resolves when storage is complete
 */
async function storePerformance(record: PerformanceRecord): Promise<void> {
  const historyStore = getTrackingState().history;
  const history = historyStore.get(record.agentId) ?? [];
  history.push(record);
  historyStore.set(record.agentId, history);
  console.log(`[Tracking] Stored: ${record.agentId} - ${record.game}/${record.strategy}`);
}

/**
 * Retrieves performance history for a specific agent.
 * @param agentId - The agent ID to get history for
 * @returns Promise resolving to array of performance records
 */
async function getPerformanceHistory(agentId: string): Promise<PerformanceRecord[]> {
  const normalizedAgentId = requireNonEmptyString(agentId, 'agentId');
  return [...(getTrackingState().history.get(normalizedAgentId) ?? [])];
}

/**
 * Resets the tracking state for testing purposes.
 * Clears all stored performance history.
 * @internal Only for use in test environments
 */
export function __resetTrackingForTests(): void {
  getTrackingState().history.clear();
}

/**
 * Validates that a string is non-empty after trimming whitespace.
 * @param value - The string to validate
 * @param field - The field name for error messages
 * @returns The trimmed string
 * @throws Error if the string is empty after trimming
 */
function requireNonEmptyString(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return normalized;
}

/**
 * Validates that a number is finite.
 * @param value - The number to validate
 * @param field - The field name for error messages
 * @returns The validated number
 * @throws Error if the number is not finite (NaN or Infinity)
 */
function requireFiniteNumber(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${field}: expected a finite number`);
  }
  return value;
}

/**
 * Validates and normalizes performance input data.
 * Ensures all required fields are present and valid.
 * @param record - The performance input to validate
 * @returns Validated performance input
 * @throws Error if any field fails validation
 */
function validatePerformanceInput(record: PerformanceInput): PerformanceInput {
  const duration = requireFiniteNumber(record.duration, 'duration');
  if (duration < 0) {
    throw new Error('Invalid duration: expected a non-negative number');
  }

  const roi = requireFiniteNumber(record.roi, 'roi');
  const agentId = requireNonEmptyString(record.agentId, 'agentId');
  const game = requireNonEmptyString(record.game, 'game');
  const strategy = requireNonEmptyString(record.strategy, 'strategy');

  if (record.timestamp !== undefined) {
    const timestamp = requireFiniteNumber(record.timestamp, 'timestamp');
    if (timestamp < 0) {
      throw new Error('Invalid timestamp: expected a non-negative number');
    }
  }

  return {
    ...record,
    agentId,
    game,
    strategy,
    roi,
    duration
  };
}
