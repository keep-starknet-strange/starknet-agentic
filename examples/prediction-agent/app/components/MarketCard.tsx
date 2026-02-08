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
  totalPool,
  status,
  resolutionTime,
  agentConsensus,
  predictions = [],
  onAnalyze,
  onBet,
}: MarketCardProps) {
  const [expanded, setExpanded] = useState(false);

  const yesPercent = Math.round(impliedProbYes * 100);
  const noPercent = 100 - yesPercent;
  const consensusPercent = agentConsensus
    ? Math.round(agentConsensus * 100)
    : null;

  const daysLeft = Math.max(
    0,
    Math.floor((resolutionTime - Date.now() / 1000) / 86400)
  );

  const poolDisplay =
    BigInt(totalPool) > 10n ** 18n
      ? `${(Number(BigInt(totalPool)) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : `${totalPool}`;

  const statusLabel = ["LIVE", "CLOSED", "RESOLVED"][status] ?? "???";
  const statusColor =
    status === 0
      ? "bg-neo-green text-neo-dark"
      : status === 2
        ? "bg-neo-purple text-white"
        : "bg-neo-orange text-neo-dark";

  const edge =
    consensusPercent !== null
      ? Math.abs(yesPercent - consensusPercent)
      : 0;

  return (
    <div className="neo-card-hover group">
      {/* Top stripe */}
      <div className="h-1 bg-neo-dark" />

      <div className="p-5">
        {/* Header Row */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={`neo-badge text-[10px] py-0.5 px-2 ${statusColor}`}
              >
                {statusLabel}
              </span>
              <span className="font-mono text-[10px] text-gray-400 tracking-wider uppercase">
                #{id}
              </span>
            </div>
            <h3 className="font-heading font-bold text-[17px] leading-snug text-balance">
              {question}
            </h3>
          </div>

          {/* Big YES number */}
          <div className="text-right shrink-0 -mt-0.5">
            <div className="font-mono font-bold text-3xl tracking-tighter leading-none">
              {yesPercent}
              <span className="text-lg text-gray-400">%</span>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mt-0.5">
              Yes
            </div>
          </div>
        </div>

        {/* Dual Probability Bar */}
        <div className="mb-4">
          <div className="flex h-5 border-2 border-black overflow-hidden">
            <div
              className="prob-bar bg-neo-green flex items-center justify-center transition-all"
              style={{ width: `${yesPercent}%` }}
            >
              {yesPercent > 15 && (
                <span className="text-[10px] font-bold text-neo-dark/70">
                  YES {yesPercent}%
                </span>
              )}
            </div>
            <div
              className="bg-neo-pink/80 flex items-center justify-center flex-1"
            >
              {noPercent > 15 && (
                <span className="text-[10px] font-bold text-neo-dark/70">
                  NO {noPercent}%
                </span>
              )}
            </div>
          </div>

          {/* Agent Consensus line */}
          {consensusPercent !== null && (
            <div className="relative h-4 mt-1">
              <div className="absolute top-0 h-full w-full">
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-neo-blue"
                  style={{ left: `${consensusPercent}%` }}
                />
                <div
                  className="absolute -top-0.5 w-2.5 h-2.5 bg-neo-blue border-2 border-black -translate-x-1/2 rotate-45"
                  style={{ left: `${consensusPercent}%` }}
                />
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                <div className="w-2 h-2 bg-neo-blue border border-black rotate-45 shrink-0" />
                <span className="text-[10px] text-gray-500 font-medium">
                  Agent consensus: <span className="font-mono font-bold text-neo-blue">{consensusPercent}%</span>
                  {edge > 5 && (
                    <span className="ml-1 text-neo-orange font-bold">
                      ({edge}pt edge)
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-1.5 mb-4">
          <span className="neo-badge bg-gray-50 text-[10px] py-0.5 px-2 shadow-none border-gray-300">
            {poolDisplay} STRK
          </span>
          <span className="neo-badge bg-gray-50 text-[10px] py-0.5 px-2 shadow-none border-gray-300">
            {daysLeft}d left
          </span>
          {predictions.length > 0 && (
            <span className="neo-badge bg-neo-blue/10 text-neo-blue text-[10px] py-0.5 px-2 shadow-none border-neo-blue/30">
              {predictions.length} agents
            </span>
          )}
        </div>

        {/* Agent Predictions Drawer */}
        {predictions.length > 0 && (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-xs font-bold text-neo-dark/50 hover:text-neo-dark transition-colors mb-3"
            >
              <svg
                className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                  clipRule="evenodd"
                />
              </svg>
              Agent forecasts
            </button>

            {expanded && (
              <div className="border-2 border-black bg-cream/50 -mx-5 px-5 py-3 mb-4">
                <div className="space-y-2">
                  {predictions.map((p, i) => {
                    const prob = Math.round(p.predictedProb * 100);
                    return (
                      <div
                        key={p.agent}
                        className="flex items-center gap-3 animate-enter"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <span className="font-mono text-[11px] text-gray-500 w-20 truncate">
                          {p.agent.slice(0, 8)}..
                        </span>
                        <div className="flex-1 h-2 bg-gray-200 border border-black/20 overflow-hidden">
                          <div
                            className="h-full bg-neo-blue/70"
                            style={{ width: `${prob}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-xs w-10 text-right">
                          {prob}%
                        </span>
                        <span
                          className={`font-mono text-[10px] w-12 text-right ${
                            p.brierScore < 0.15
                              ? "text-neo-green"
                              : p.brierScore < 0.25
                                ? "text-neo-orange"
                                : "text-neo-pink"
                          }`}
                        >
                          {p.brierScore.toFixed(3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Actions */}
        {status === 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => onAnalyze(id)}
              className="neo-btn-dark flex-1 text-sm py-2.5 gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
              Analyze
            </button>
            <button
              onClick={() => onBet(id)}
              className="neo-btn-primary flex-1 text-sm py-2.5"
            >
              Place Bet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
