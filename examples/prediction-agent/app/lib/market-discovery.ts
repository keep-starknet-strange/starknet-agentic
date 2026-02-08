/**
 * Market Discovery — Auto-discovers interesting markets from real-world events.
 *
 * Generates suggested prediction market questions from trending topics
 * across crypto, politics, sports, tech, and entertainment.
 */

export interface SuggestedMarket {
  question: string;
  category: "crypto" | "politics" | "sports" | "tech" | "entertainment";
  suggestedResolutionDays: number;
  sourceUrl?: string;
  estimatedProbability?: number;
  reasoning?: string;
}

const MARKET_TEMPLATES: SuggestedMarket[] = [
  // Crypto
  {
    question: "Will ETH surpass $5,000 by June 2026?",
    category: "crypto",
    suggestedResolutionDays: 120,
    estimatedProbability: 0.35,
    reasoning: "ETH has shown steady growth but $5k requires significant catalyst.",
  },
  {
    question: "Will STRK reach $2 by Q3 2026?",
    category: "crypto",
    suggestedResolutionDays: 180,
    estimatedProbability: 0.28,
    reasoning: "Dependent on Starknet ecosystem growth and L2 adoption trends.",
  },
  {
    question: "Will Bitcoin hold above $90,000 through February 2026?",
    category: "crypto",
    suggestedResolutionDays: 21,
    estimatedProbability: 0.72,
    reasoning: "Strong institutional support and ETF inflows provide price floor.",
  },
  {
    question: "Will total DeFi TVL exceed $250B by mid-2026?",
    category: "crypto",
    suggestedResolutionDays: 150,
    estimatedProbability: 0.45,
    reasoning: "RWA tokenization driving growth but regulatory uncertainty remains.",
  },
  {
    question: "Will Solana process over 10,000 TPS sustained for a full day?",
    category: "crypto",
    suggestedResolutionDays: 90,
    estimatedProbability: 0.3,
    reasoning: "Technical capability exists but sustained load at this level is challenging.",
  },
  // Politics
  {
    question: "Will the next US spending bill pass by March 2026?",
    category: "politics",
    suggestedResolutionDays: 30,
    estimatedProbability: 0.55,
    reasoning: "Bipartisan pressure exists but partisan divisions may cause delays.",
  },
  {
    question: "Will any G7 country launch a retail CBDC in 2026?",
    category: "politics",
    suggestedResolutionDays: 300,
    estimatedProbability: 0.2,
    reasoning: "ECB digital euro is closest but timeline remains uncertain.",
  },
  {
    question: "Will US crypto regulation framework pass into law by end of 2026?",
    category: "politics",
    suggestedResolutionDays: 300,
    estimatedProbability: 0.4,
    reasoning: "Multiple bills in progress but comprehensive framework faces hurdles.",
  },
  // Sports
  {
    question: "Will Kansas City win Super Bowl LXI?",
    category: "sports",
    suggestedResolutionDays: 14,
    estimatedProbability: 0.18,
    reasoning: "Strong contender but competitive field makes any single team unlikely.",
  },
  {
    question: "Will any NBA team finish the 2025-26 season with 70+ wins?",
    category: "sports",
    suggestedResolutionDays: 120,
    estimatedProbability: 0.08,
    reasoning: "Historically extremely rare — only achieved once in NBA history.",
  },
  // Tech
  {
    question: "Will Apple announce a foldable device in 2026?",
    category: "tech",
    suggestedResolutionDays: 300,
    estimatedProbability: 0.35,
    reasoning: "Multiple supply chain leaks suggest development but timing uncertain.",
  },
  {
    question: "Will OpenAI or Google release a model scoring >90% on ARC-AGI?",
    category: "tech",
    suggestedResolutionDays: 180,
    estimatedProbability: 0.25,
    reasoning: "Rapid progress in AI capabilities but ARC-AGI remains challenging.",
  },
  {
    question: "Will global AI chip market exceed $200B in 2026?",
    category: "tech",
    suggestedResolutionDays: 300,
    estimatedProbability: 0.6,
    reasoning: "Strong demand trajectory from both training and inference workloads.",
  },
  // Entertainment
  {
    question: "Will the next Marvel movie gross $1B opening weekend globally?",
    category: "entertainment",
    suggestedResolutionDays: 180,
    estimatedProbability: 0.15,
    reasoning: "Only a few films have achieved this — requires massive franchise appeal.",
  },
  {
    question: "Will a streaming service surpass 300M global subscribers in 2026?",
    category: "entertainment",
    suggestedResolutionDays: 300,
    estimatedProbability: 0.4,
    reasoning: "Netflix is closest but growth is slowing in mature markets.",
  },
];

/**
 * Discover suggested markets. Returns a rotating set based on time.
 * In the future, this could pull from Polymarket trending + news events.
 */
export async function discoverMarkets(
  category?: string,
  limit?: number
): Promise<SuggestedMarket[]> {
  let markets = [...MARKET_TEMPLATES];

  if (category) {
    markets = markets.filter((m) => m.category === category);
  }

  // Rotate based on day to keep things fresh
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const rotated = [
    ...markets.slice(dayIndex % markets.length),
    ...markets.slice(0, dayIndex % markets.length),
  ];

  return rotated.slice(0, limit ?? 8);
}

/**
 * Get all available categories.
 */
export function getCategories(): string[] {
  return ["crypto", "politics", "sports", "tech", "entertainment"];
}
