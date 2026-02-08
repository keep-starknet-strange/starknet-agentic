/**
 * Polymarket Data Source — Fetches prediction market odds from Polymarket.
 *
 * Uses the public Gamma API for market search.
 * Falls back to demo data with realistic Polymarket-style odds.
 */

import type { DataSourceResult, DataPoint } from "./index";

const GAMMA_API = "https://gamma-api.polymarket.com";

/**
 * Search Polymarket for markets related to the question.
 */
export async function fetchPolymarketData(
  question: string
): Promise<DataSourceResult> {
  const keywords = extractKeywords(question);

  try {
    const url = `${GAMMA_API}/markets?closed=false&limit=5&order=volume&ascending=false&_q=${encodeURIComponent(keywords)}`;

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) throw new Error(`Polymarket API ${response.status}`);

    const markets = await response.json();

    if (Array.isArray(markets) && markets.length > 0) {
      const data: DataPoint[] = markets.slice(0, 5).map((m: any) => ({
        label: m.question ?? m.title ?? "Unknown market",
        value: `YES ${formatOdds(m.outcomePrices)} | Vol: $${formatNumber(m.volume)}`,
        url: m.slug
          ? `https://polymarket.com/event/${m.slug}`
          : undefined,
        confidence: parseOdds(m.outcomePrices),
      }));

      const topMarket = markets[0];
      const topOdds = parseOdds(topMarket.outcomePrices);
      const summary = `Found ${markets.length} related market(s). Top match: "${topMarket.question ?? topMarket.title}" at ${Math.round(topOdds * 100)}% YES with $${formatNumber(topMarket.volume)} volume.`;

      return {
        source: "polymarket",
        query: keywords,
        timestamp: Date.now(),
        data,
        summary,
      };
    }
  } catch {
    // Fall through to demo data
  }

  return getDemoPolymarketData(question, keywords);
}

function extractKeywords(question: string): string {
  const stopWords = new Set([
    "will", "the", "a", "an", "by", "be", "is", "are", "was", "were",
    "to", "of", "in", "for", "on", "at", "this", "that", "it", "its",
    "above", "below", "reach", "hit", "surpass", "exceed",
  ]);
  return question
    .replace(/[?!.,]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()))
    .slice(0, 5)
    .join(" ");
}

function formatOdds(outcomePrices: any): string {
  if (!outcomePrices) return "N/A";
  try {
    const prices =
      typeof outcomePrices === "string"
        ? JSON.parse(outcomePrices)
        : outcomePrices;
    if (Array.isArray(prices) && prices.length >= 1) {
      return `${Math.round(parseFloat(prices[0]) * 100)}%`;
    }
  } catch {
    // ignore
  }
  return "N/A";
}

function parseOdds(outcomePrices: any): number {
  try {
    const prices =
      typeof outcomePrices === "string"
        ? JSON.parse(outcomePrices)
        : outcomePrices;
    if (Array.isArray(prices) && prices.length >= 1) {
      return parseFloat(prices[0]);
    }
  } catch {
    // ignore
  }
  return 0.5;
}

function formatNumber(n: any): string {
  const num = parseFloat(n);
  if (isNaN(num)) return "0";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toFixed(0);
}

function getDemoPolymarketData(
  question: string,
  keywords: string
): DataSourceResult {
  const seed = hashString(question);
  const prob = 0.3 + (seed % 40) / 100;
  const vol = 50000 + (seed % 500) * 1000;

  return {
    source: "polymarket",
    query: keywords,
    timestamp: Date.now(),
    data: [
      {
        label: question.replace("?", ""),
        value: `YES ${Math.round(prob * 100)}% | Vol: $${formatNumber(vol)}`,
        confidence: prob,
      },
      {
        label: "Related: Crypto market direction Q2 2026",
        value: `YES 58% | Vol: $${formatNumber(vol * 0.6)}`,
        confidence: 0.58,
      },
      {
        label: "Related: DeFi TVL growth 2026",
        value: `YES 45% | Vol: $${formatNumber(vol * 0.4)}`,
        confidence: 0.45,
      },
    ],
    summary: `[Demo] Simulated Polymarket data: primary market at ${Math.round(prob * 100)}% YES with $${formatNumber(vol)} volume. 2 related markets found.`,
  };
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
