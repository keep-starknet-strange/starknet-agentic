/**
 * Performance Tracking
 * Track agent performance across games and strategies
 */

import type { PerformanceRecord, AgentStats } from './types';
import { getAgent } from './registry';

const PERFORMANCE_HISTORY = new Map<string, PerformanceRecord[]>();
type PerformanceInput = Omit<PerformanceRecord, 'timestamp'> & { timestamp?: number };

/**
 * Track a game result
 */
export async function trackPerformance(record: PerformanceInput): Promise<void> {
  const { agentId, game, result, roi } = record;
  
  // Validate agent exists
  const agent = await getAgent(agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }
  
  const performance: PerformanceRecord = {
    ...record,
    timestamp: record.timestamp ?? Date.now()
  };
  
  // Store performance record
  await storePerformance(performance);
  
  console.log(`[Tracking] ${agent.name}: ${result} on ${game} (ROI: ${roi}x)`);
}

/**
 * Get agent statistics
 */
export async function getAgentStats(agentId: string): Promise<AgentStats> {
  const performances = await getPerformanceHistory(agentId);
  
  if (performances.length === 0) {
    return {
      agentId,
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
  const strategies: Record<string, { games: number; wins: number; avgRoi: number }> = {};
  
  for (const p of performances) {
    gamesByType[p.game] = (gamesByType[p.game] || 0) + 1;
    
    if (!strategies[p.strategy]) {
      strategies[p.strategy] = { games: 0, wins: 0, avgRoi: 0 };
    }
    strategies[p.strategy].games++;
    if (p.result === 'win') strategies[p.strategy].wins++;
    strategies[p.strategy].avgRoi = 
      (strategies[p.strategy].avgRoi * (strategies[p.strategy].games - 1) + p.roi) / 
      strategies[p.strategy].games;
  }
  
  return {
    agentId,
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
  const stats = await getAgentStats(agentId);
  
  return Object.entries(stats.strategies)
    .map(([strategy, data]) => ({
      strategy,
      games: data.games,
      avgRoi: data.avgRoi,
      winRate: data.wins / data.games
    }))
    .sort((a, b) => b.avgRoi - a.avgRoi)
    .slice(0, limit);
}

// Helper functions

async function storePerformance(record: PerformanceRecord): Promise<void> {
  const history = PERFORMANCE_HISTORY.get(record.agentId) ?? [];
  history.push(record);
  PERFORMANCE_HISTORY.set(record.agentId, history);
  console.log(`[Tracking] Stored: ${record.agentId} - ${record.game}/${record.strategy}`);
}

async function getPerformanceHistory(agentId: string): Promise<PerformanceRecord[]> {
  return [...(PERFORMANCE_HISTORY.get(agentId) ?? [])];
}

export function __resetTrackingForTests(): void {
  PERFORMANCE_HISTORY.clear();
}
