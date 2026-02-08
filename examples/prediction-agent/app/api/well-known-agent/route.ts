/**
 * OASF Agent Manifest — /.well-known/agent.json
 *
 * Open Agent Service Framework manifest for indexing by
 * Daydreams, xgate.run, and other agent discovery services.
 */

export async function GET() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3001";

  const manifest = {
    schema_version: "1.0",
    name: "BitSage Prediction Oracle",
    description:
      "On-chain prediction market agent ensemble on Starknet Sepolia. 5 AI personas with distinct methodologies forecast Super Bowl LX and crypto markets, execute real STRK bets, and track accuracy via Brier scores.",
    url: baseUrl,
    version: "1.0.0",
    author: {
      name: "BitSage Network / keep-starknet-strange",
      url: "https://github.com/keep-starknet-strange/starknet-agentic",
    },
    protocols: [
      {
        name: "A2A",
        version: "1.0",
        endpoint: `${baseUrl}/.well-known/agent-card.json`,
      },
      {
        name: "MCP",
        version: "1.0",
        description: "Starknet MCP server with 9 tools",
      },
      {
        name: "x402",
        description: "Starknet payment signing for HTTP 402 flows",
      },
      {
        name: "ERC-8004",
        description:
          "On-chain agent identity, reputation, and validation registries",
      },
    ],
    agents: [
      {
        id: "alpha",
        name: "AlphaForecaster",
        type: "superforecaster",
        model: "claude-sonnet-4.5",
        description:
          "Calibrated superforecaster using Good Judgment Project methodology",
      },
      {
        id: "beta",
        name: "BetaAnalyst",
        type: "quant-forecaster",
        model: "claude-sonnet-4.5",
        description:
          "Quantitative analyst focused on on-chain metrics and technicals",
      },
      {
        id: "gamma",
        name: "GammaTrader",
        type: "market-maker",
        model: "gpt-4o",
        description:
          "Market-making agent analyzing liquidity, flow, and cross-venue data",
      },
      {
        id: "delta",
        name: "DeltaScout",
        type: "data-analyst",
        model: "claude-haiku-4.5",
        description:
          "Data-driven agent prioritizing primary sources and developer activity",
      },
      {
        id: "epsilon",
        name: "EpsilonOracle",
        type: "news-analyst",
        model: "gemini-pro",
        description:
          "News and sentiment analyst tracking narrative shifts and institutional signals",
      },
    ],
    dataSources: [
      "polymarket",
      "coingecko",
      "brave-news",
      "social-trends",
      "espn-live",
    ],
    endpoints: {
      predict: `${baseUrl}/api/predict`,
      multiPredict: `${baseUrl}/api/multi-predict`,
      markets: `${baseUrl}/api/markets`,
      dataSources: `${baseUrl}/api/data-sources`,
      agentLoop: `${baseUrl}/api/agent-loop`,
      agentCard: `${baseUrl}/.well-known/agent-card.json`,
    },
    blockchain: {
      network: "starknet-sepolia",
      factoryAddress: process.env.MARKET_FACTORY_ADDRESS ?? "0x0",
      trackerAddress: process.env.ACCURACY_TRACKER_ADDRESS ?? "0x0",
      collateralToken: {
        symbol: "STRK",
        address:
          "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
      },
    },
    features: [
      "multi-agent-debate",
      "reputation-weighted-consensus",
      "real-time-espn-data",
      "on-chain-brier-scores",
      "autonomous-betting",
      "sse-streaming",
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
