/**
 * Agent Spawner — Registry for human-created agents.
 *
 * Allows users to spawn custom forecasting agents with configurable
 * personas, budgets, and data source preferences.
 */

import { AGENT_PERSONAS, type AgentPersona } from "./agent-personas";

export interface AgentBudget {
  totalBudget: bigint;
  spent: bigint;
  maxBetSize: bigint;
}

export interface SpawnedAgent {
  id: string;
  name: string;
  persona: AgentPersona;
  budget: AgentBudget;
  createdAt: number;
  status: "running" | "paused" | "stopped";
  stats: {
    predictions: number;
    bets: number;
    pnl: bigint;
  };
}

export interface SpawnAgentConfig {
  name: string;
  personaId?: string;
  customSystemPrompt?: string;
  budgetStrk?: number;
  maxBetStrk?: number;
  preferredSources?: string[];
}

class AgentSpawnerRegistry {
  private agents = new Map<string, SpawnedAgent>();

  spawn(config: SpawnAgentConfig): SpawnedAgent {
    const id = `spawned_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Resolve persona: use existing or create custom
    let persona: AgentPersona;
    if (config.personaId) {
      const existing = AGENT_PERSONAS.find((p) => p.id === config.personaId);
      if (existing) {
        persona = {
          ...existing,
          id,
          name: config.name,
          preferredSources: config.preferredSources ?? existing.preferredSources,
        };
      } else {
        persona = this.createCustomPersona(id, config);
      }
    } else {
      persona = this.createCustomPersona(id, config);
    }

    const budgetWei = BigInt(Math.floor((config.budgetStrk ?? 1000) * 1e18));
    const maxBetWei = BigInt(Math.floor((config.maxBetStrk ?? 100) * 1e18));

    const agent: SpawnedAgent = {
      id,
      name: config.name,
      persona,
      budget: {
        totalBudget: budgetWei,
        spent: 0n,
        maxBetSize: maxBetWei,
      },
      createdAt: Date.now(),
      status: "running",
      stats: {
        predictions: 0,
        bets: 0,
        pnl: 0n,
      },
    };

    this.agents.set(id, agent);
    return agent;
  }

  stop(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) agent.status = "stopped";
  }

  pause(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === "running") agent.status = "paused";
  }

  resume(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent && agent.status === "paused") agent.status = "running";
  }

  remove(agentId: string) {
    this.agents.delete(agentId);
  }

  list(): SpawnedAgent[] {
    return Array.from(this.agents.values());
  }

  getAgent(id: string): SpawnedAgent | null {
    return this.agents.get(id) ?? null;
  }

  private createCustomPersona(
    id: string,
    config: SpawnAgentConfig
  ): AgentPersona {
    return {
      id,
      name: config.name,
      agentType: "custom-forecaster",
      model: "claude-sonnet-4-5",
      biasFactor: 0.0,
      confidence: 0.8,
      preferredSources: config.preferredSources ?? [
        "polymarket",
        "coingecko",
        "news",
        "social",
      ],
      systemPrompt:
        config.customSystemPrompt ??
        `You are ${config.name}, a custom AI forecasting agent.

Your task is to analyze prediction market questions using real-world data and produce calibrated probability estimates.

Follow rigorous methodology:
1. Examine the research data provided carefully
2. Consider base rates and reference classes
3. Weight evidence from multiple sources
4. Be honest about uncertainty
5. Produce a specific probability estimate

End your analysis with: **My estimate: XX%**`,
    };
  }
}

/** Singleton spawner instance */
export const agentSpawner = new AgentSpawnerRegistry();

/** Serializable agent representation for API responses */
export function serializeAgent(
  agent: SpawnedAgent
): Record<string, unknown> {
  return {
    id: agent.id,
    name: agent.name,
    personaId: agent.persona.id,
    agentType: agent.persona.agentType,
    model: agent.persona.model,
    preferredSources: agent.persona.preferredSources,
    budget: {
      totalBudget: agent.budget.totalBudget.toString(),
      spent: agent.budget.spent.toString(),
      maxBetSize: agent.budget.maxBetSize.toString(),
      remainingPct:
        agent.budget.totalBudget > 0n
          ? Number(
              ((agent.budget.totalBudget - agent.budget.spent) * 10000n) /
                agent.budget.totalBudget
            ) / 100
          : 0,
    },
    createdAt: agent.createdAt,
    status: agent.status,
    stats: {
      predictions: agent.stats.predictions,
      bets: agent.stats.bets,
      pnl: agent.stats.pnl.toString(),
    },
  };
}
