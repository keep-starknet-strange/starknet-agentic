/**
 * Autonomous Agent Loop — Core engine for continuous agent operation.
 *
 * Runs a periodic cycle where agents research, forecast, and bet on markets.
 * Maintains an action log and emits events for connected UI clients.
 */

import { getMarkets, DEMO_QUESTIONS, type MarketState } from "./market-reader";
import {
  researchAndForecast,
  type MarketContext,
} from "./research-agent";
import {
  AGENT_PERSONAS,
  simulatePersonaForecast,
  type AgentPersona,
} from "./agent-personas";
import { type SpawnedAgent, agentSpawner } from "./agent-spawner";

export interface AgentAction {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  type: "research" | "prediction" | "bet" | "discovery" | "error";
  marketId?: number;
  question?: string;
  detail: string;
  probability?: number;
  betAmount?: string;
  betOutcome?: "YES" | "NO";
  sourcesUsed?: string[];
}

export interface LoopStatus {
  isRunning: boolean;
  tickCount: number;
  lastTickAt: number | null;
  nextTickAt: number | null;
  activeAgentCount: number;
  intervalMs: number;
}

type LoopListener = (action: AgentAction) => void;

const MAX_ACTION_LOG = 200;

class AgentLoop {
  private isRunning = false;
  private intervalId?: ReturnType<typeof setInterval>;
  private actionLog: AgentAction[] = [];
  private tickCount = 0;
  private lastTickAt: number | null = null;
  private intervalMs = 300_000; // 5 min default
  private listeners = new Set<LoopListener>();
  private actionCounter = 0;
  private analyzedMarkets = new Map<string, Set<number>>(); // agentId -> marketIds recently analyzed

  start(intervalMs?: number) {
    if (this.isRunning) return;
    this.isRunning = true;
    if (intervalMs) this.intervalMs = intervalMs;

    // Run first tick immediately
    this.tick();

    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  getStatus(): LoopStatus {
    const spawned = agentSpawner.list().filter((a) => a.status === "running");
    return {
      isRunning: this.isRunning,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
      nextTickAt: this.isRunning
        ? (this.lastTickAt ?? Date.now()) + this.intervalMs
        : null,
      activeAgentCount: AGENT_PERSONAS.length + spawned.length,
      intervalMs: this.intervalMs,
    };
  }

  getActionLog(limit?: number): AgentAction[] {
    const n = limit ?? 50;
    return this.actionLog.slice(-n);
  }

  subscribe(listener: LoopListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(action: AgentAction) {
    this.actionLog.push(action);
    if (this.actionLog.length > MAX_ACTION_LOG) {
      this.actionLog = this.actionLog.slice(-MAX_ACTION_LOG);
    }
    for (const listener of this.listeners) {
      try {
        listener(action);
      } catch {
        // Don't let listener errors break the loop
      }
    }
  }

  private createAction(
    partial: Omit<AgentAction, "id" | "timestamp">
  ): AgentAction {
    return {
      ...partial,
      id: `action_${++this.actionCounter}_${Date.now()}`,
      timestamp: Date.now(),
    };
  }

  private async tick() {
    this.tickCount++;
    this.lastTickAt = Date.now();

    let markets: MarketState[];
    try {
      markets = await getMarkets();
    } catch {
      this.emit(
        this.createAction({
          agentId: "system",
          agentName: "System",
          type: "error",
          detail: "Failed to fetch markets",
        })
      );
      return;
    }

    const openMarkets = markets.filter((m) => m.status === 0);
    if (openMarkets.length === 0) return;

    // Run built-in personas
    for (const persona of AGENT_PERSONAS) {
      await this.runAgentOnMarkets(persona, openMarkets);
    }

    // Run spawned agents
    const spawnedAgents = agentSpawner.list().filter((a) => a.status === "running");
    for (const spawned of spawnedAgents) {
      await this.runAgentOnMarkets(spawned.persona, openMarkets, spawned);
    }
  }

  private async runAgentOnMarkets(
    persona: AgentPersona,
    markets: MarketState[],
    spawned?: SpawnedAgent
  ) {
    const agentId = spawned?.id ?? persona.id;
    const agentName = spawned?.name ?? persona.name;

    // Pick a market this agent hasn't recently analyzed
    const analyzed = this.analyzedMarkets.get(agentId) ?? new Set();
    const unanalyzed = markets.filter((m) => !analyzed.has(m.id));
    const target = unanalyzed.length > 0 ? unanalyzed[0] : markets[0];

    const question =
      DEMO_QUESTIONS[target.id] ?? `Market #${target.id}`;

    // Research phase
    this.emit(
      this.createAction({
        agentId,
        agentName,
        type: "research",
        marketId: target.id,
        question,
        detail: `Researching "${question}" using ${(persona.preferredSources ?? ["all"]).join(", ")}`,
        sourcesUsed: persona.preferredSources ?? [
          "polymarket",
          "coingecko",
          "news",
          "social",
        ],
      })
    );

    // Generate forecast
    let probability: number;
    try {
      const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

      if (hasApiKey && (persona.id === "alpha" || spawned)) {
        // Use research-backed forecast for alpha or spawned agents
        const context: MarketContext = {
          currentMarketProb: target.impliedProbYes,
          totalPool: (target.totalPool / 10n ** 18n).toString(),
          timeUntilResolution: `${Math.max(0, Math.floor((target.resolutionTime - Date.now() / 1000) / 86400))} days`,
        };

        const gen = researchAndForecast(persona, question, context);
        let result: any;
        while (true) {
          const { value, done } = await gen.next();
          if (done) {
            result = value;
            break;
          }
        }
        probability = result?.probability ?? 0.5;
      } else {
        // Simulated forecast
        const forecast = simulatePersonaForecast(
          persona,
          target.impliedProbYes,
          question
        );
        probability = forecast.probability;
      }
    } catch {
      probability = target.impliedProbYes + (Math.random() - 0.5) * 0.1;
      probability = Math.max(0.03, Math.min(0.97, probability));
    }

    // Record prediction
    this.emit(
      this.createAction({
        agentId,
        agentName,
        type: "prediction",
        marketId: target.id,
        question,
        probability,
        detail: `Predicted ${Math.round(probability * 100)}% YES on "${question}"`,
      })
    );

    // Decide whether to bet
    const confidence = Math.abs(probability - 0.5) * 2; // 0..1
    const shouldBet = confidence > 0.15;

    if (shouldBet && spawned) {
      const budget = spawned.budget;
      const remaining = budget.totalBudget - budget.spent;
      if (remaining > 0n) {
        const betFraction = confidence * 0.1;
        const betRaw =
          (BigInt(Math.floor(betFraction * 1000)) * remaining) / 1000n;
        const betSize =
          betRaw > budget.maxBetSize ? budget.maxBetSize : betRaw;

        if (betSize > 0n) {
          const outcome = probability > 0.5 ? "YES" : "NO";
          const betDisplay = `${Number(betSize / 10n ** 14n) / 10000} STRK`;

          // In demo mode just log the intent
          this.emit(
            this.createAction({
              agentId,
              agentName,
              type: "bet",
              marketId: target.id,
              question,
              probability,
              betAmount: betDisplay,
              betOutcome: outcome,
              detail: `Bet ${betDisplay} on ${outcome} for "${question}" (confidence: ${(confidence * 100).toFixed(0)}%)`,
            })
          );

          // Update spent budget
          spawned.budget.spent += betSize;
          spawned.stats.bets++;
        }
      }
    } else if (shouldBet) {
      // Built-in agent: log simulated bet
      const betDisplay = `${(confidence * 500).toFixed(0)} STRK`;
      const outcome = probability > 0.5 ? "YES" : "NO";
      this.emit(
        this.createAction({
          agentId,
          agentName,
          type: "bet",
          marketId: target.id,
          question,
          probability,
          betAmount: betDisplay,
          betOutcome: outcome,
          detail: `Bet ${betDisplay} on ${outcome} for "${question}" (confidence: ${(confidence * 100).toFixed(0)}%)`,
        })
      );
    }

    // Track which markets this agent has analyzed
    analyzed.add(target.id);
    this.analyzedMarkets.set(agentId, analyzed);

    // Update spawned agent stats
    if (spawned) {
      spawned.stats.predictions++;
    }
  }
}

/** Singleton agent loop instance */
export const agentLoop = new AgentLoop();
