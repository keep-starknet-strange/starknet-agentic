/**
 * Research Agent — Enriches forecasting with real-world data.
 *
 * Gathers data from multiple sources before invoking Claude for analysis,
 * producing a research-backed forecast rather than a pure LLM prediction.
 */

import {
  gatherResearch,
  buildResearchBrief,
  type DataSourceResult,
  type DataSourceName,
} from "./data-sources/index";
import { forecastMarket, type ForecastResult } from "./agent-forecaster";
import type { AgentPersona } from "./agent-personas";

export interface ResearchEvent {
  type:
    | "research_start"
    | "research_complete"
    | "forecast_text"
    | "forecast_complete";
  sources?: DataSourceName[];
  results?: DataSourceResult[];
  content?: string;
  probability?: number;
  reasoning?: string;
}

export interface MarketContext {
  currentMarketProb?: number;
  totalPool?: string;
  agentPredictions?: { agent: string; prob: number; brier: number }[];
  timeUntilResolution?: string;
}

/**
 * Research and forecast pipeline for a single agent persona.
 * Yields events as research progresses through data gathering and analysis.
 */
export async function* researchAndForecast(
  persona: AgentPersona,
  question: string,
  marketContext: MarketContext
): AsyncGenerator<ResearchEvent, ForecastResult> {
  const sources = persona.preferredSources ?? [
    "polymarket",
    "coingecko",
    "news",
    "social",
  ];

  // 1. Signal research start
  yield {
    type: "research_start",
    sources: sources as DataSourceName[],
  };

  // 2. Gather data from relevant sources
  const results = await gatherResearch(
    question,
    sources as DataSourceName[]
  );

  yield {
    type: "research_complete",
    results,
  };

  // 3. Build research brief
  const brief = buildResearchBrief(results);

  // 4. Run forecast with enriched context
  const generator = forecastMarket(question, {
    ...marketContext,
    researchBrief: brief,
  });

  let fullText = "";
  let result: ForecastResult | undefined;

  while (true) {
    const { value, done } = await generator.next();
    if (done) {
      result = value;
      break;
    }
    fullText += value;
    yield { type: "forecast_text", content: value };
  }

  const finalResult = result ?? { reasoning: fullText, probability: 0.5 };

  yield {
    type: "forecast_complete",
    probability: finalResult.probability,
    reasoning: finalResult.reasoning,
  };

  return finalResult;
}

/**
 * Quick research-only call (no forecast) — used by the data-sources API endpoint.
 */
export async function quickResearch(
  question: string,
  sources?: DataSourceName[]
): Promise<DataSourceResult[]> {
  return gatherResearch(question, sources);
}
