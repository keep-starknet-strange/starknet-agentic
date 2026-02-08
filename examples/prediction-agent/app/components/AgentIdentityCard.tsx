"use client";

import { accuracyTier, formatBrier } from "@/lib/accuracy";

interface AgentIdentityCardProps {
  agent: string;
  avgBrier: number;
  predictionCount: number;
  rank: number;
}

export default function AgentIdentityCard({
  agent,
  avgBrier,
  predictionCount,
  rank,
}: AgentIdentityCardProps) {
  const tier = accuracyTier(avgBrier);
  const winRate = Math.max(0, Math.round((1 - avgBrier) * 100));

  return (
    <div className="border-2 border-black bg-white shadow-neo p-4">
      <div className="flex items-center gap-3 mb-3">
        {/* Avatar */}
        <div className="w-10 h-10 bg-neo-purple border-2 border-black flex items-center justify-center text-white font-bold text-lg">
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono font-bold text-sm truncate">{agent}</p>
          <p className="text-xs text-gray-500">ERC-8004 Agent Identity</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-gray-50 border border-gray-200">
          <p className={`font-mono font-bold text-lg ${tier.color}`}>
            {formatBrier(avgBrier)}
          </p>
          <p className="text-xs text-gray-500">Brier</p>
        </div>
        <div className="text-center p-2 bg-gray-50 border border-gray-200">
          <p className="font-mono font-bold text-lg">{predictionCount}</p>
          <p className="text-xs text-gray-500">Predictions</p>
        </div>
        <div className="text-center p-2 bg-gray-50 border border-gray-200">
          <p className="font-mono font-bold text-lg">{winRate}%</p>
          <p className="text-xs text-gray-500">Accuracy</p>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span
          className={`inline-block px-2 py-0.5 text-xs font-bold border border-black ${
            tier.label === "Excellent"
              ? "bg-neo-green"
              : tier.label === "Good"
                ? "bg-neo-blue text-white"
                : tier.label === "Fair"
                  ? "bg-neo-yellow"
                  : "bg-neo-pink"
          }`}
        >
          {tier.label}
        </span>
      </div>
    </div>
  );
}
