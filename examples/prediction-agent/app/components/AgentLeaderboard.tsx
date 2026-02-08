"use client";

interface LeaderboardEntry {
  agent: string;
  avgBrier: number;
  predictionCount: number;
  rank: number;
}

interface AgentLeaderboardProps {
  entries: LeaderboardEntry[];
  onSelectAgent?: (agent: string) => void;
}

function brierColor(score: number): string {
  if (score < 0.1) return "text-neo-green";
  if (score < 0.2) return "text-neo-blue";
  if (score < 0.3) return "text-neo-orange";
  return "text-neo-pink";
}

function rankBadge(rank: number): string {
  if (rank === 1) return "bg-neo-yellow";
  if (rank === 2) return "bg-gray-300";
  if (rank === 3) return "bg-neo-orange";
  return "bg-gray-100";
}

export default function AgentLeaderboard({
  entries,
  onSelectAgent,
}: AgentLeaderboardProps) {
  return (
    <div className="border-2 border-black bg-white shadow-neo">
      <div className="bg-neo-dark text-white px-4 py-3 border-b-2 border-black">
        <h2 className="font-heading font-bold text-lg">Agent Leaderboard</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Ranked by Brier score (lower = better)
        </p>
      </div>

      <div className="divide-y divide-gray-200">
        {entries.map((entry) => (
          <button
            key={entry.agent}
            onClick={() => onSelectAgent?.(entry.agent)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          >
            {/* Rank */}
            <span
              className={`${rankBadge(entry.rank)} w-7 h-7 flex items-center justify-center text-sm font-bold border border-black`}
            >
              {entry.rank}
            </span>

            {/* Agent info */}
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm font-medium truncate">
                {entry.agent.length > 12
                  ? `${entry.agent.slice(0, 6)}...${entry.agent.slice(-4)}`
                  : entry.agent}
              </p>
              <p className="text-xs text-gray-500">
                {entry.predictionCount} predictions
              </p>
            </div>

            {/* Brier score */}
            <span className={`font-mono font-bold text-lg ${brierColor(entry.avgBrier)}`}>
              {entry.avgBrier.toFixed(3)}
            </span>
          </button>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="px-4 py-8 text-center text-gray-400 text-sm">
          No agents have made predictions yet
        </div>
      )}
    </div>
  );
}
