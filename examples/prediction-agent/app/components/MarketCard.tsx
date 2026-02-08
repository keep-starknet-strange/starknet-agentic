"use client";

import { useState } from "react";

interface AgentPrediction {
  agent: string;
  predictedProb: number;
  brierScore: number;
  predictionCount: number;
}

interface MarketCardProps {
  id: number;
  question: string;
  impliedProbYes: number;
  impliedProbNo: number;
  totalPool: string;
  status: number;
  resolutionTime: number;
  agentConsensus?: number;
  predictions?: AgentPrediction[];
  onAnalyze: (marketId: number) => void;
  onBet: (marketId: number) => void;
}

export default function MarketCard({
  id,
  question,
  impliedProbYes,
  impliedProbNo,
  totalPool,
  status,
  resolutionTime,
  agentConsensus,
  predictions = [],
  onAnalyze,
  onBet,
}: MarketCardProps) {
  const [showPredictions, setShowPredictions] = useState(false);

  const yesPercent = Math.round(impliedProbYes * 100);
  const noPercent = Math.round(impliedProbNo * 100);
  const consensusPercent = agentConsensus
    ? Math.round(agentConsensus * 100)
    : null;

  const daysLeft = Math.max(
    0,
    Math.floor((resolutionTime - Date.now() / 1000) / 86400)
  );

  const poolDisplay =
    BigInt(totalPool) > 10n ** 18n
      ? `${(Number(BigInt(totalPool)) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })} STRK`
      : `${totalPool} wei`;

  const statusLabel = ["OPEN", "CLOSED", "RESOLVED"][status] ?? "UNKNOWN";
  const statusColor =
    status === 0
      ? "bg-neo-green"
      : status === 2
        ? "bg-neo-purple"
        : "bg-neo-orange";

  return (
    <div className="neo-card border-2 border-black bg-white p-5 shadow-neo">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <h3 className="font-heading font-semibold text-lg leading-tight flex-1">
          {question}
        </h3>
        <span
          className={`${statusColor} text-black text-xs font-bold px-2 py-1 border border-black`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Probability Bars */}
      <div className="space-y-2 mb-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium">Market Odds</span>
            <span className="font-mono text-sm">{yesPercent}% YES</span>
          </div>
          <div className="h-3 bg-gray-100 border border-black overflow-hidden">
            <div
              className="prob-bar h-full bg-neo-green"
              style={{ width: `${yesPercent}%` }}
            />
          </div>
        </div>

        {consensusPercent !== null && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">
                Agent Consensus{" "}
                <span className="text-xs text-gray-500">
                  ({predictions.length} agents)
                </span>
              </span>
              <span className="font-mono text-sm">
                {consensusPercent}% YES
              </span>
            </div>
            <div className="h-3 bg-gray-100 border border-black overflow-hidden">
              <div
                className="prob-bar h-full bg-neo-blue"
                style={{ width: `${consensusPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-gray-600 mb-4">
        <span>Pool: {poolDisplay}</span>
        <span>{daysLeft}d left</span>
        {predictions.length > 0 && (
          <span>{predictions.length} predictions</span>
        )}
      </div>

      {/* Agent Predictions Expansion */}
      {predictions.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowPredictions(!showPredictions)}
            className="text-sm font-medium text-neo-blue hover:underline"
          >
            {showPredictions ? "Hide" : "See"} Predictions
          </button>

          {showPredictions && (
            <div className="mt-2 border border-black bg-gray-50 p-3 space-y-2">
              {predictions.map((p) => (
                <div
                  key={p.agent}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-mono text-xs">
                    {p.agent.slice(0, 10)}...
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">
                      {Math.round(p.predictedProb * 100)}%
                    </span>
                    <span className="text-xs text-gray-500">
                      Brier: {p.brierScore.toFixed(3)}
                    </span>
                    <span className="text-xs text-gray-400">
                      ({p.predictionCount} preds)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {status === 0 && (
        <div className="flex gap-2">
          <button
            onClick={() => onAnalyze(id)}
            className="flex-1 bg-neo-blue text-white font-bold py-2 px-4 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all text-sm"
          >
            Analyze
          </button>
          <button
            onClick={() => onBet(id)}
            className="flex-1 bg-neo-yellow text-black font-bold py-2 px-4 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all text-sm"
          >
            Bet
          </button>
        </div>
      )}
    </div>
  );
}
