"use client";

interface Trade {
  time: string;
  market: string;
  user: string;
  outcome: "YES" | "NO";
  amount: string;
}

const DEMO_TRADES: Trade[] = [
  { time: "2m ago", market: "ETH $5k", user: "0xAlpha", outcome: "YES", amount: "500 STRK" },
  { time: "5m ago", market: "STRK $2", user: "0xBeta", outcome: "NO", amount: "200 STRK" },
  { time: "12m ago", market: "100 TPS", user: "0xA11CE", outcome: "YES", amount: "1,000 STRK" },
  { time: "18m ago", market: "ETH $5k", user: "0xGamma", outcome: "YES", amount: "750 STRK" },
  { time: "25m ago", market: "STRK $2", user: "0xDelta", outcome: "YES", amount: "300 STRK" },
  { time: "31m ago", market: "100 TPS", user: "0xB0B", outcome: "NO", amount: "150 STRK" },
];

export default function TradeLog() {
  return (
    <div className="border-2 border-black bg-white shadow-neo overflow-hidden">
      <div className="bg-gray-100 px-4 py-2 border-b-2 border-black">
        <h3 className="font-heading font-bold text-sm">Recent Bets</h3>
      </div>
      <div className="divide-y divide-gray-100">
        {DEMO_TRADES.map((trade, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-gray-50 transition-colors"
          >
            <span className="text-gray-400 w-14 shrink-0">{trade.time}</span>
            <span className="font-medium w-20 truncate">{trade.market}</span>
            <span className="font-mono text-gray-500 w-16 truncate">
              {trade.user}
            </span>
            <span
              className={`font-bold w-8 ${
                trade.outcome === "YES" ? "text-neo-green" : "text-neo-pink"
              }`}
            >
              {trade.outcome}
            </span>
            <span className="font-mono text-right flex-1">{trade.amount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
