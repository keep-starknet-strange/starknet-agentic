"use client";

import { useState } from "react";
import { computePayout } from "@/lib/accuracy";

interface BetFormProps {
  marketId: number;
  question: string;
  yesPool: string;
  noPool: string;
  totalPool: string;
  feeBps: number;
  impliedProbYes: number;
  onClose: () => void;
}

export default function BetForm({
  marketId,
  question,
  yesPool,
  noPool,
  totalPool,
  feeBps,
  impliedProbYes,
  onClose,
}: BetFormProps) {
  const [outcome, setOutcome] = useState<0 | 1>(1);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    status: string;
    txHash?: string;
    error?: string;
  } | null>(null);

  const amountBigInt = (() => {
    try {
      return BigInt(Math.floor(parseFloat(amount || "0") * 1e18));
    } catch {
      return 0n;
    }
  })();

  // Compute estimated payout
  const winningPool = outcome === 1 ? BigInt(yesPool) : BigInt(noPool);
  const newWinningPool = winningPool + amountBigInt;
  const newTotalPool = BigInt(totalPool) + amountBigInt;

  const estPayout =
    amountBigInt > 0n && newWinningPool > 0n
      ? computePayout(amountBigInt, newTotalPool, newWinningPool, feeBps)
      : 0n;

  const estMultiple =
    amountBigInt > 0n ? Number(estPayout) / Number(amountBigInt) : 0;

  // New implied prob after bet
  const newImpliedYes =
    outcome === 1
      ? Number(BigInt(yesPool) + amountBigInt) / Number(newTotalPool)
      : Number(BigInt(yesPool)) / Number(newTotalPool);

  async function handleSubmit() {
    if (amountBigInt <= 0n) return;
    setLoading(true);
    setResult(null);

    try {
      const resp = await fetch("/api/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketId,
          outcome,
          amount: amountBigInt.toString(),
        }),
      });
      const data = await resp.json();
      setResult(data);
    } catch (err: any) {
      setResult({ status: "error", error: err.message });
    }
    setLoading(false);
  }

  return (
    <div className="border-2 border-black bg-white shadow-neo-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold">Place a Bet</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-black text-lg font-bold"
        >
          x
        </button>
      </div>

      <p className="text-sm text-gray-600 mb-4 line-clamp-2">{question}</p>

      {/* Outcome Selector */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setOutcome(1)}
          className={`flex-1 py-2 border-2 border-black font-bold text-sm transition-all ${
            outcome === 1
              ? "bg-neo-green text-black shadow-neo-sm"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          YES
        </button>
        <button
          onClick={() => setOutcome(0)}
          className={`flex-1 py-2 border-2 border-black font-bold text-sm transition-all ${
            outcome === 0
              ? "bg-neo-pink text-black shadow-neo-sm"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          NO
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-1">
          Amount (STRK)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full border-2 border-black p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-neo-blue"
        />
      </div>

      {/* Payout Preview */}
      {amountBigInt > 0n && (
        <div className="bg-gray-50 border border-gray-200 p-3 mb-4 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Est. payout:</span>
            <span className="font-mono font-bold">
              {(Number(estPayout) / 1e18).toFixed(2)} STRK
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Multiplier:</span>
            <span className="font-mono">
              {estMultiple.toFixed(2)}x
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">New implied YES:</span>
            <span className="font-mono">
              {(newImpliedYes * 100).toFixed(1)}%
              <span className="text-xs text-gray-400 ml-1">
                (was {(impliedProbYes * 100).toFixed(1)}%)
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || amountBigInt <= 0n}
        className="w-full bg-neo-yellow text-black font-bold py-3 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Placing bet..." : "Place Bet"}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`mt-3 p-2 border text-sm ${
            result.status === "success"
              ? "border-neo-green bg-green-50 text-green-800"
              : "border-neo-pink bg-red-50 text-red-800"
          }`}
        >
          {result.status === "success" ? (
            <span>
              Bet placed!{" "}
              {result.txHash && (
                <span className="font-mono text-xs">
                  tx: {result.txHash.slice(0, 16)}...
                </span>
              )}
            </span>
          ) : (
            <span>{result.error}</span>
          )}
        </div>
      )}
    </div>
  );
}
