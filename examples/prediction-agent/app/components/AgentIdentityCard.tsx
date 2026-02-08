"use client";

import { accuracyTier, formatBrier } from "@/lib/accuracy";

interface AgentIdentityCardProps {
  agent: string;
  avgBrier: number;
  predictionCount: number;
  rank: number;
  identity?: {
    name: string;
    agentType: string;
    model: string;
    reputationScore: number;
    feedbackCount: number;
  } | null;
}

export default function AgentIdentityCard({
  agent,
  avgBrier,
  predictionCount,
  rank,
  identity,
}: AgentIdentityCardProps) {
  const tier = accuracyTier(avgBrier);
  const accuracy = Math.max(0, Math.round((1 - avgBrier) * 100));

  const accentColor =
    tier.label === "Excellent"
      ? "neo-green"
      : tier.label === "Good"
        ? "neo-blue"
        : tier.label === "Fair"
          ? "neo-orange"
          : "neo-pink";

  return (
    <div className="neo-card overflow-hidden animate-enter">
      {/* Accent stripe */}
      <div className={`h-1.5 bg-${accentColor}`} />

      <div className="p-4">
        {/* Agent Header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className={`w-10 h-10 bg-${accentColor} border-2 border-black flex items-center justify-center text-neo-dark font-black text-lg shrink-0`}
          >
            {rank}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs font-bold truncate">
              {identity?.name ?? agent}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-mono text-gray-400">
                ERC-8004
              </span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span className={`text-[10px] font-bold ${tier.color}`}>
                {tier.label}
              </span>
            </div>
            {identity && (
              <p className="text-[9px] text-gray-400 mt-0.5">
                {identity.agentType} · {identity.model}
              </p>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className={`grid ${identity ? "grid-cols-4" : "grid-cols-3"} gap-px bg-black border-2 border-black`}>
          <div className="bg-white p-2.5 text-center">
            <p className={`font-mono font-black text-base leading-none ${tier.color}`}>
              {formatBrier(avgBrier)}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-1">
              Brier
            </p>
          </div>
          <div className="bg-white p-2.5 text-center">
            <p className="font-mono font-black text-base leading-none">
              {predictionCount}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-1">
              Preds
            </p>
          </div>
          <div className="bg-white p-2.5 text-center">
            <p className="font-mono font-black text-base leading-none">
              {accuracy}%
            </p>
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-1">
              Acc
            </p>
          </div>
          {identity && (
            <div className="bg-white p-2.5 text-center">
              <p className="font-mono font-black text-base leading-none text-neo-purple">
                {identity.reputationScore}
              </p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mt-1">
                Rep
              </p>
            </div>
          )}
        </div>

        {/* Accuracy Bar */}
        <div className="mt-3">
          <div className="h-2 border border-black bg-gray-100 overflow-hidden">
            <div
              className={`h-full bg-${accentColor} prob-bar`}
              style={{ width: `${accuracy}%` }}
            />
          </div>
        </div>

        {/* Agent Address */}
        <div className="mt-3 flex items-center justify-between">
          <span className="font-mono text-[9px] text-gray-400 truncate max-w-[140px]">
            {agent}
          </span>
          {identity && (
            <span className="neo-badge text-[8px] py-0 px-1.5 bg-neo-purple/10 text-neo-purple border-neo-purple/30">
              {identity.feedbackCount} reviews
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
