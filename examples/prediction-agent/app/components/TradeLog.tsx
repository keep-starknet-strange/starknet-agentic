"use client";

interface Trade {
  time: string;
  market: string;
  user: string;
  outcome: "YES" | "NO";
  amount: string;
  isAgent: boolean;
}

const DEMO_TRADES: Trade[] = [
  { time: "2m", market: "ETH $5k", user: "0xAlpha", outcome: "YES", amount: "500", isAgent: true },
  { time: "5m", market: "STRK $2", user: "0xBeta", outcome: "NO", amount: "200", isAgent: true },
  { time: "12m", market: "100 TPS", user: "0xA11CE", outcome: "YES", amount: "1,000", isAgent: false },
  { time: "18m", market: "ETH $5k", user: "0xGamma", outcome: "YES", amount: "750", isAgent: true },
  { time: "25m", market: "STRK $2", user: "0xDelta", outcome: "YES", amount: "300", isAgent: true },
  { time: "31m", market: "100 TPS", user: "0xB0B", outcome: "NO", amount: "150", isAgent: false },
  { time: "40m", market: "ETH $5k", user: "0xEpsilon", outcome: "NO", amount: "420", isAgent: true },
  { time: "55m", market: "STRK $2", user: "0xC4FE", outcome: "YES", amount: "800", isAgent: false },
];

export default function TradeLog() {
  return (
    <div className="neo-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b-2 border-black">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-neo-green animate-pulse" />
          <h3 className="font-heading font-bold text-xs">Recent Activity</h3>
        </div>
        <span className="font-mono text-[10px] text-gray-400">
          {DEMO_TRADES.length} trades
        </span>
      </div>

      {/* Ticker-style scrolling trades */}
      <div className="overflow-hidden border-b border-gray-100">
        <div className="ticker-tape flex items-center gap-6 px-4 py-1.5 whitespace-nowrap">
          {[...DEMO_TRADES, ...DEMO_TRADES].map((trade, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className="text-gray-400 font-mono">{trade.time}</span>
              <span className="font-bold">{trade.user.slice(0, 8)}</span>
              <span
                className={`font-black ${
                  trade.outcome === "YES" ? "text-neo-green" : "text-neo-pink"
                }`}
              >
                {trade.outcome}
              </span>
              <span className="font-mono text-gray-500">{trade.amount}</span>
              <span className="text-gray-300">on</span>
              <span className="text-gray-500">{trade.market}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Trade table */}
      <div className="divide-y divide-gray-100">
        {DEMO_TRADES.slice(0, 6).map((trade, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-gray-50/50 transition-colors"
          >
            <span className="font-mono text-[10px] text-gray-300 w-8 shrink-0 tabular-nums">
              {trade.time}
            </span>
            <div className="flex items-center gap-1.5 w-24 shrink-0">
              {trade.isAgent && (
                <span className="w-3.5 h-3.5 bg-neo-purple text-white text-[7px] font-black flex items-center justify-center border border-black">
                  AI
                </span>
              )}
              <span className="font-mono text-[11px] font-medium truncate">
                {trade.user}
              </span>
            </div>
            <span className="text-gray-400 w-16 truncate">{trade.market}</span>
            <span
              className={`font-heading font-bold text-[11px] w-8 ${
                trade.outcome === "YES" ? "text-neo-green" : "text-neo-pink"
              }`}
            >
              {trade.outcome}
            </span>
            <span className="font-mono text-[11px] text-right flex-1 tabular-nums">
              {trade.amount} <span className="text-gray-400">STRK</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
