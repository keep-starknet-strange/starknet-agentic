/**
 * Unified Data Sources — Aggregates real-world data for agent research.
 *
 * Each source fetches external data and falls back to demo data
 * when API keys are missing or requests fail.
 */

export interface DataPoint {
  label: string;
  value: string | number;
  url?: string;
  confidence?: number;
}

export interface DataSourceResult {
  source: string; // "polymarket" | "coingecko" | "news" | "social"
  query: string;
  timestamp: number;
  data: DataPoint[];
  summary: string;
}

export type DataSourceName = "polymarket" | "coingecko" | "news" | "social" | "espn";

import { fetchPolymarketData } from "./polymarket";
import { fetchCryptoPrices } from "./crypto-prices";
import { fetchNewsData } from "./news-search";
import { fetchSocialTrends } from "./social-trends";
import { fetchEspnScores } from "./espn-live";

const SOURCE_FETCHERS: Record<
  DataSourceName,
  (question: string) => Promise<DataSourceResult>
> = {
  polymarket: fetchPolymarketData,
  coingecko: fetchCryptoPrices,
  news: fetchNewsData,
  social: fetchSocialTrends,
  espn: fetchEspnScores,
};

const ALL_SOURCES: DataSourceName[] = [
  "polymarket",
  "coingecko",
  "news",
  "social",
  "espn",
];

/**
 * Gather research from multiple data sources in parallel.
 * Returns results from all requested sources (defaults to all).
 */
export async function gatherResearch(
  question: string,
  sources?: DataSourceName[]
): Promise<DataSourceResult[]> {
  const selectedSources = sources ?? ALL_SOURCES;

  const results = await Promise.allSettled(
    selectedSources.map((source) => {
      const fetcher = SOURCE_FETCHERS[source];
      return fetcher(question);
    })
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<DataSourceResult> =>
        r.status === "fulfilled"
    )
    .map((r) => r.value);
}

/**
 * Build a concise research brief from data source results for injection into Claude prompts.
 */
export function buildResearchBrief(results: DataSourceResult[]): string {
  if (results.length === 0) return "";

  const sections = results.map((r) => {
    const points = r.data
      .slice(0, 5)
      .map((d) => `  - ${d.label}: ${d.value}`)
      .join("\n");
    return `### ${r.source.toUpperCase()} Data\n${r.summary}\n${points}`;
  });

  return `## Real-World Research Data (gathered ${new Date().toISOString()})\n\n${sections.join("\n\n")}`;
}
