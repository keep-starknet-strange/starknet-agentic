/**
 * A2A Agent Card — /.well-known/agent-card.json
 *
 * Follows the Google Agent-to-Agent (A2A) protocol specification.
 * Enables Daydreams and other agent frameworks to discover this agent.
 */

export async function GET() {
  const card = {
    name: "BitSage Prediction Oracle",
    description:
      "Multi-agent prediction market forecaster on Starknet. 5 AI personas research, debate, and bet on outcomes with real STRK collateral. Reputation-weighted consensus via on-chain Brier scores.",
    url: process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3001",
    version: "1.0.0",
    provider: {
      organization: "BitSage Network",
      url: "https://github.com/keep-starknet-strange/starknet-agentic",
    },
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    authentication: {
      schemes: ["none"],
    },
    skills: [
      {
        id: "predict",
        name: "Single Agent Forecast",
        description:
          "Run a single superforecaster agent on a prediction market question. Returns calibrated probability with reasoning.",
        inputModes: ["application/json"],
        outputModes: ["text/event-stream"],
      },
      {
        id: "multi-predict",
        name: "Multi-Agent Forecast with Debate",
        description:
          "Run 5 AI personas (AlphaForecaster, BetaAnalyst, GammaTrader, DeltaScout, EpsilonOracle) through independent analysis, debate round, and reputation-weighted consensus.",
        inputModes: ["application/json"],
        outputModes: ["text/event-stream"],
      },
      {
        id: "markets",
        name: "List Markets",
        description:
          "Get all active prediction markets from the on-chain Starknet factory contract.",
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
      {
        id: "espn-live",
        name: "ESPN Live Scores",
        description:
          "Fetch real-time NFL scores and game data from ESPN's public API.",
        inputModes: ["application/json"],
        outputModes: ["application/json"],
      },
    ],
    starknetIdentity: {
      network: "sepolia",
      factoryAddress: process.env.MARKET_FACTORY_ADDRESS ?? "0x0",
      trackerAddress: process.env.ACCURACY_TRACKER_ADDRESS ?? "0x0",
      collateralToken: "STRK",
      standard: "ERC-8004",
    },
    supportsX402: true,
    protocols: ["A2A", "MCP", "ERC-8004"],
  };

  return new Response(JSON.stringify(card, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
