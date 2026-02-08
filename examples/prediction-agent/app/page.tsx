"use client";

import { useState, useEffect } from "react";
import MarketCard from "./components/MarketCard";
import AgentLeaderboard from "./components/AgentLeaderboard";
import AgentReasoningPanel from "./components/AgentReasoningPanel";
import BetForm from "./components/BetForm";
import TradeLog from "./components/TradeLog";
import AgentIdentityCard from "./components/AgentIdentityCard";
import MarketCreator from "./components/MarketCreator";

interface Market {
  id: number;
  question: string;
  address: string;
  impliedProbYes: number;
  impliedProbNo: number;
  totalPool: string;
  yesPool: string;
  noPool: string;
  status: number;
  resolutionTime: number;
  feeBps: number;
  collateralToken: string;
}

interface LeaderboardEntry {
  agent: string;
  avgBrier: number;
  predictionCount: number;
  rank: number;
}

interface AgentPrediction {
  agent: string;
  marketId: number;
  predictedProb: number;
  brierScore: number;
  predictionCount: number;
}

export default function Dashboard() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [predictions, setPredictions] = useState<Record<number, AgentPrediction[]>>({});
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
  const [analyzeMarketId, setAnalyzeMarketId] = useState<number | null>(null);
  const [betMarketId, setBetMarketId] = useState<number | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [marketsRes, leaderboardRes] = await Promise.all([
          fetch("/api/markets"),
          fetch("/api/leaderboard"),
        ]);

        const marketsData = await marketsRes.json();
        const leaderboardData = await leaderboardRes.json();

        setMarkets(marketsData.markets ?? []);
        setLeaderboard(leaderboardData.leaderboard ?? []);

        // Load predictions for each market
        const predsMap: Record<number, AgentPrediction[]> = {};
        for (const market of marketsData.markets ?? []) {
          try {
            const res = await fetch(`/api/markets/${market.id}`);
            const data = await res.json();
            predsMap[market.id] = data.predictions ?? [];
          } catch {
            predsMap[market.id] = [];
          }
        }
        setPredictions(predsMap);
      } catch (err) {
        console.error("Failed to load data:", err);
      }
      setLoading(false);
    }

    loadData();
  }, []);

  const analyzeMarket = markets.find((m) => m.id === analyzeMarketId);
  const betMarket = markets.find((m) => m.id === betMarketId);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b-2 border-black bg-white">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-2xl tracking-tight">
              Agentic Predictions
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              AI superforecasters as market makers on Starknet
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full bg-neo-green animate-pulse" />
              <span className="text-gray-500">Sepolia</span>
            </div>
            <button
              onClick={() => setShowCreator(!showCreator)}
              className="bg-neo-purple text-white font-bold py-2 px-4 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all text-sm"
            >
              + Create
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Market Creator Modal */}
        {showCreator && (
          <div className="mb-6">
            <MarketCreator onClose={() => setShowCreator(false)} />
          </div>
        )}

        {/* Main Grid */}
        <div className="flex gap-6">
          {/* Left: Markets */}
          <div className="flex-1 space-y-4">
            {loading ? (
              <div className="border-2 border-black bg-white p-12 text-center shadow-neo">
                <p className="font-mono text-gray-400 animate-pulse">
                  Loading markets...
                </p>
              </div>
            ) : markets.length === 0 ? (
              <div className="border-2 border-black bg-white p-12 text-center shadow-neo">
                <p className="font-heading font-bold text-lg mb-2">
                  No markets yet
                </p>
                <p className="text-sm text-gray-500">
                  Deploy contracts and create your first prediction market.
                </p>
              </div>
            ) : (
              markets.map((market) => {
                const marketPreds = predictions[market.id] ?? [];
                const agentConsensus =
                  marketPreds.length > 0
                    ? marketPreds.reduce((sum, p) => sum + p.predictedProb, 0) /
                      marketPreds.length
                    : undefined;

                return (
                  <MarketCard
                    key={market.id}
                    id={market.id}
                    question={market.question}
                    impliedProbYes={market.impliedProbYes}
                    impliedProbNo={market.impliedProbNo}
                    totalPool={market.totalPool}
                    status={market.status}
                    resolutionTime={market.resolutionTime}
                    agentConsensus={agentConsensus}
                    predictions={marketPreds}
                    onAnalyze={(id) => setAnalyzeMarketId(id)}
                    onBet={(id) => setBetMarketId(id)}
                  />
                );
              })
            )}
          </div>

          {/* Right: Leaderboard + Agent Card + Bet Form */}
          <div className="w-80 shrink-0 space-y-4">
            <AgentLeaderboard
              entries={leaderboard}
              onSelectAgent={(agent) => {
                const entry = leaderboard.find((e) => e.agent === agent);
                setSelectedAgent(entry ?? null);
              }}
            />

            {selectedAgent && (
              <AgentIdentityCard
                agent={selectedAgent.agent}
                avgBrier={selectedAgent.avgBrier}
                predictionCount={selectedAgent.predictionCount}
                rank={selectedAgent.rank}
              />
            )}

            {betMarket && (
              <BetForm
                marketId={betMarket.id}
                question={
                  betMarket.question
                }
                yesPool={betMarket.yesPool}
                noPool={betMarket.noPool}
                totalPool={betMarket.totalPool}
                feeBps={betMarket.feeBps}
                impliedProbYes={betMarket.impliedProbYes}
                onClose={() => setBetMarketId(null)}
              />
            )}
          </div>
        </div>

        {/* Agent Reasoning Panel (full width) */}
        <div className="mt-6">
          <AgentReasoningPanel
            marketId={analyzeMarketId}
            question={
              analyzeMarket?.question ?? ""
            }
          />
        </div>

        {/* Trade Log */}
        <div className="mt-6">
          <TradeLog />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-black bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between text-xs text-gray-500">
          <span>
            Built with{" "}
            <span className="font-bold text-black">starknet-agentic</span>
            {" "}| ERC-8004 + Agent Account + MCP
          </span>
          <span className="font-mono">Starknet Sepolia</span>
        </div>
      </footer>
    </div>
  );
}
