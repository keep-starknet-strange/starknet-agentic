/**
 * Social Trends Data Source — Detects social sentiment signals.
 *
 * Provides trending scores and related topic detection.
 * Uses keyword analysis and category-based sentiment estimation.
 */

import type { DataSourceResult, DataPoint } from "./index";

export async function fetchSocialTrends(
  question: string
): Promise<DataSourceResult> {
  const keywords = question
    .replace(/[?!.,'"]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4);

  // Generate social signals from keyword analysis
  const sentiment = analyzeSentiment(question);
  const trendScore = computeTrendScore(question);
  const relatedTopics = getRelatedTopics(question);

  const data: DataPoint[] = [
    {
      label: "Trending Score",
      value: `${trendScore}/100`,
      confidence: trendScore / 100,
    },
    {
      label: "Sentiment",
      value: sentiment.label,
      confidence: sentiment.score,
    },
    {
      label: "Discussion Volume",
      value: sentiment.volume,
    },
    ...relatedTopics.map((topic) => ({
      label: `Related: ${topic.name}`,
      value: `Interest: ${topic.score}/100`,
    })),
  ];

  const summary = `Social signal: ${sentiment.label} sentiment (${trendScore}/100 trending). Keywords: ${keywords.join(", ")}. ${relatedTopics.length} related topics detected.`;

  return {
    source: "social",
    query: keywords.join(", "),
    timestamp: Date.now(),
    data,
    summary,
  };
}

interface SentimentResult {
  label: string;
  score: number;
  volume: string;
}

function analyzeSentiment(question: string): SentimentResult {
  const q = question.toLowerCase();

  const bullishWords = [
    "surpass", "hit", "reach", "above", "exceed", "win", "pass",
    "succeed", "launch", "grow", "rise", "record", "breakthrough",
  ];
  const bearishWords = [
    "below", "fail", "crash", "fall", "decline", "lose",
    "drop", "collapse", "ban", "restrict",
  ];

  const bullCount = bullishWords.filter((w) => q.includes(w)).length;
  const bearCount = bearishWords.filter((w) => q.includes(w)).length;

  const net = bullCount - bearCount;
  if (net > 1) return { label: "Strongly Bullish", score: 0.8, volume: "High" };
  if (net > 0) return { label: "Mildly Bullish", score: 0.6, volume: "Moderate" };
  if (net < -1) return { label: "Strongly Bearish", score: 0.2, volume: "High" };
  if (net < 0) return { label: "Mildly Bearish", score: 0.4, volume: "Moderate" };
  return { label: "Neutral", score: 0.5, volume: "Normal" };
}

function computeTrendScore(question: string): number {
  const q = question.toLowerCase();

  let score = 40; // Base score

  // High-interest topics boost trending
  if (/eth|btc|bitcoin|ethereum/i.test(q)) score += 25;
  if (/ai|artificial intelligence/i.test(q)) score += 20;
  if (/super bowl|election|president/i.test(q)) score += 30;
  if (/apple|google|openai/i.test(q)) score += 15;
  if (/strk|starknet/i.test(q)) score += 10;

  // Time-sensitive questions trend higher
  if (/this month|this week|today/i.test(q)) score += 15;
  if (/2026/i.test(q)) score += 5;

  // Add deterministic pseudo-random variation
  const hash = simpleHash(question);
  score += (hash % 15) - 7;

  return Math.max(10, Math.min(95, score));
}

function getRelatedTopics(
  question: string
): { name: string; score: number }[] {
  const q = question.toLowerCase();
  const topics: { name: string; score: number }[] = [];

  if (/eth|ethereum/i.test(q)) {
    topics.push({ name: "Ethereum L2s", score: 72 });
    topics.push({ name: "ETF Inflows", score: 65 });
  }
  if (/btc|bitcoin/i.test(q)) {
    topics.push({ name: "Bitcoin Halving Effects", score: 58 });
    topics.push({ name: "Institutional Adoption", score: 70 });
  }
  if (/strk|starknet/i.test(q)) {
    topics.push({ name: "ZK Rollup Performance", score: 55 });
    topics.push({ name: "Cairo Ecosystem", score: 48 });
  }
  if (/super bowl|nfl/i.test(q)) {
    topics.push({ name: "Sports Betting Markets", score: 82 });
    topics.push({ name: "Championship Odds", score: 76 });
  }
  if (/apple|phone|foldable/i.test(q)) {
    topics.push({ name: "Consumer Electronics", score: 60 });
    topics.push({ name: "Mobile Innovation", score: 55 });
  }

  if (topics.length === 0) {
    topics.push({ name: "General Interest", score: 45 });
    topics.push({ name: "Market Sentiment", score: 50 });
  }

  return topics;
}

function simpleHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
