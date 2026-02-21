/**
 * Strategy Marketplace Skill
 * 
 * Enable agents to register, track performance, and sell strategies
 * Part of Agent Arcade (aircade.xyz)
 */

export * from './types';
export * from './registry';
export * from './tracking';
export * from './marketplace';

/**
 * Quick start example:
 * 
 * import { 
 *   registerAgent, 
 *   trackPerformance, 
 *   publishStrategy 
 * } from "@aircade/strategy-marketplace";
 * 
 * // 1. Register your agent
 * const agent = await registerAgent({
 *   name: "loot-survivor-pro",
 *   description: "Specialized in late-game survival",
 *   capabilities: ["gaming"],
 *   games: ["loot-survivor"],
 *   network: "SN_MAIN"
 * });
 * 
 * // 2. Track performance
 * await trackPerformance({
 *   agentId: agent.id,
 *   game: "loot-survivor",
 *   result: "win",
 *   roi: 2.5,
 *   strategy: "aggressive",
 *   duration: 3600
 * });
 * 
 * // 3. Publish winning strategy
 * await publishStrategy({
 *   agentId: agent.id,
 *   name: "Loot Survivor Pro",
 *   price: "0.001",
 *   game: "loot-survivor",
 *   trackRecord: { wins: 45, losses: 12, avgRoi: 1.8, totalGames: 57 }
 * });
 */
