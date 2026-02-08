/**
 * News Search Data Source — Fetches news headlines related to the question.
 *
 * Uses Brave Search API when BRAVE_SEARCH_API_KEY is set.
 * Falls back to category-appropriate simulated headlines.
 */

import type { DataSourceResult, DataPoint } from "./index";

const BRAVE_API = "https://api.search.brave.com/res/v1/news/search";

export async function fetchNewsData(
  question: string
): Promise<DataSourceResult> {
  const keywords = extractNewsKeywords(question);
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (apiKey) {
    try {
      const url = `${BRAVE_API}?q=${encodeURIComponent(keywords)}&count=5&freshness=pw`;

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": apiKey,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) throw new Error(`Brave API ${response.status}`);

      const result = await response.json();
      const articles = result.results ?? [];

      if (articles.length > 0) {
        const data: DataPoint[] = articles.slice(0, 5).map((a: any) => ({
          label: a.title ?? "Untitled",
          value: a.description?.slice(0, 120) ?? "No description",
          url: a.url,
        }));

        return {
          source: "news",
          query: keywords,
          timestamp: Date.now(),
          data,
          summary: `Found ${articles.length} recent news articles. Top: "${articles[0].title}".`,
        };
      }
    } catch {
      // Fall through to demo data
    }
  }

  return getDemoNewsData(question, keywords);
}

function extractNewsKeywords(question: string): string {
  return question
    .replace(/[?!.,"']/g, "")
    .replace(/^will\s+/i, "")
    .replace(/\b(by|before|after|this|next)\s+(month|year|quarter|week)\b/gi, "")
    .trim();
}

type Category = "crypto" | "politics" | "sports" | "tech" | "general";

function detectCategory(question: string): Category {
  const q = question.toLowerCase();
  if (/\b(eth|btc|strk|crypto|defi|blockchain|bitcoin|ethereum|starknet|token|nft)\b/.test(q)) return "crypto";
  if (/\b(president|election|congress|senate|vote|bill|law|regulation|government|policy)\b/.test(q)) return "politics";
  if (/\b(super bowl|championship|nba|nfl|world cup|soccer|football|basketball|baseball|win|game)\b/.test(q)) return "sports";
  if (/\b(apple|google|microsoft|ai|launch|release|phone|chip|software)\b/.test(q)) return "tech";
  return "general";
}

function getDemoNewsData(
  question: string,
  keywords: string
): DataSourceResult {
  const category = detectCategory(question);
  const templates = NEWS_TEMPLATES[category];

  const data: DataPoint[] = templates.slice(0, 5).map((t) => ({
    label: t.title,
    value: t.snippet,
    url: t.url,
  }));

  return {
    source: "news",
    query: keywords,
    timestamp: Date.now(),
    data,
    summary: `[Demo] ${templates.length} simulated ${category} headlines. Category detected from question keywords.`,
  };
}

const NEWS_TEMPLATES: Record<
  Category,
  { title: string; snippet: string; url?: string }[]
> = {
  crypto: [
    {
      title: "Ethereum ETF inflows hit record $1.2B in single week",
      snippet: "Institutional demand for Ethereum exposure continues to surge as spot ETF products see unprecedented capital inflows.",
    },
    {
      title: "Starknet announces major protocol upgrade targeting 500 TPS",
      snippet: "The Layer 2 network plans to roll out its next-gen sequencer and data availability improvements in Q2 2026.",
    },
    {
      title: "Federal Reserve holds rates steady, crypto markets rally",
      snippet: "Bitcoin and Ethereum prices jumped 3-5% following the Fed's decision to maintain current interest rate levels.",
    },
    {
      title: "DeFi TVL crosses $200B as institutional adoption accelerates",
      snippet: "Total value locked across decentralized protocols reaches new all-time highs driven by RWA tokenization.",
    },
    {
      title: "SEC approves framework for tokenized securities trading",
      snippet: "New regulatory clarity expected to unlock billions in institutional capital for blockchain-based financial products.",
    },
  ],
  politics: [
    {
      title: "Congress debates new federal spending package",
      snippet: "Bipartisan negotiations continue on a $1.5T infrastructure and technology investment bill.",
    },
    {
      title: "White House announces AI executive order updates",
      snippet: "New guidelines for AI deployment in government agencies aim to balance innovation with safety.",
    },
    {
      title: "Senate committee advances crypto regulation bill",
      snippet: "The proposed legislation would create clearer frameworks for digital asset classification.",
    },
    {
      title: "Global leaders meet at G20 summit on digital currency policy",
      snippet: "Discussions focus on cross-border CBDC standards and stablecoin regulation harmonization.",
    },
    {
      title: "State-level blockchain voting pilot programs expand",
      snippet: "Three additional states announce plans to test blockchain-based voting for local elections.",
    },
  ],
  sports: [
    {
      title: "NFL playoff picture takes shape as season enters final weeks",
      snippet: "Top contenders solidify their positions while several wild card races remain hotly contested.",
    },
    {
      title: "Super Bowl LXI host city preparations underway",
      snippet: "Organizers report record sponsorship deals and ticket demand for the upcoming championship.",
    },
    {
      title: "NBA season sees surge in international viewership",
      snippet: "League reports 25% increase in global streaming numbers compared to previous season.",
    },
    {
      title: "Sports betting industry revenues hit quarterly record",
      snippet: "Online sportsbooks report combined revenue of $8.2B as more states legalize mobile wagering.",
    },
    {
      title: "Major League Baseball announces AI-assisted umpiring expansion",
      snippet: "Automated ball-strike system to be implemented across all 30 stadiums next season.",
    },
  ],
  tech: [
    {
      title: "Apple rumored to unveil next-gen hardware at spring event",
      snippet: "Industry analysts expect announcements around new form factors and enhanced AI integration.",
    },
    {
      title: "AI chip demand drives semiconductor stocks to new highs",
      snippet: "NVIDIA, AMD, and Intel all report strong quarterly earnings fueled by data center GPU sales.",
    },
    {
      title: "OpenAI and Google race to deploy next-generation AI models",
      snippet: "Both companies plan major model releases in the coming months with significant capability improvements.",
    },
    {
      title: "Cloud computing market exceeds $700B annual revenue",
      snippet: "Enterprise AI workloads drive unprecedented growth across all major cloud providers.",
    },
    {
      title: "Global smartphone shipments show first growth in two years",
      snippet: "AI-powered features and foldable designs are credited with reviving consumer upgrade demand.",
    },
  ],
  general: [
    {
      title: "Global economic outlook shows mixed signals for 2026",
      snippet: "IMF projects moderate growth with diverging trajectories across developed and emerging markets.",
    },
    {
      title: "Climate tech investment reaches $150B globally",
      snippet: "Venture capital and public markets show strong appetite for clean energy and carbon capture solutions.",
    },
    {
      title: "Remote work trends stabilize as hybrid becomes the norm",
      snippet: "Recent surveys show 60% of knowledge workers now follow hybrid schedules.",
    },
    {
      title: "Consumer confidence index rises for third consecutive month",
      snippet: "Improving employment data and easing inflation contribute to growing economic optimism.",
    },
    {
      title: "Supply chain resilience improves as companies diversify sourcing",
      snippet: "Post-pandemic investments in logistics and multi-region manufacturing are paying dividends.",
    },
  ],
};
