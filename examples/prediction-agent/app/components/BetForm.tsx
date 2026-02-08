"use client";

import { useState, useEffect } from "react";
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

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const amountBigInt = (() => {
    try {
      return BigInt(Math.floor(parseFloat(amount || "0") * 1e18));
    } catch {
      return 0n;
    }
  })();

  const winningPool = outcome === 1 ? BigInt(yesPool) : BigInt(noPool);
  const newWinningPool = winningPool + amountBigInt;
  const newTotalPool = BigInt(totalPool) + amountBigInt;

  const estPayout =
    amountBigInt > 0n && newWinningPool > 0n
      ? computePayout(amountBigInt, newTotalPool, newWinningPool, feeBps)
      : 0n;

  const estMultiple =
    amountBigInt > 0n ? Number(estPayout) / Number(amountBigInt) : 0;

  const newImpliedYes =
    newTotalPool > 0n
      ? Number(
          outcome === 1
            ? BigInt(yesPool) + amountBigInt
            : BigInt(yesPool)
        ) / Number(newTotalPool)
      : impliedProbYes;

  const probShift = Math.round((newImpliedYes - impliedProbYes) * 100);

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

  const presets = ["10", "50", "100", "500"];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 neo-card border-2 border-black bg-white shadow-neo-lg animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neo-yellow border-b-2 border-black">
          <h3 className="font-heading font-bold text-sm uppercase tracking-wider">
            Place Bet
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border-2 border-black/30 hover:bg-black/10 text-xs font-mono transition-colors"
          >
            ESC
          </button>
        </div>

        <div className="p-5">
          <p className="text-xs text-gray-500 mb-4 line-clamp-2 leading-relaxed">
            {question}
          </p>

          {/* Outcome Toggle */}
          <div className="flex border-2 border-black mb-4">
            <button
              onClick={() => setOutcome(1)}
              className={`flex-1 py-2.5 font-heading font-bold text-sm transition-all ${
                outcome === 1
                  ? "bg-neo-green text-neo-dark shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.15)]"
                  : "bg-white text-gray-400 hover:text-gray-600"
              }`}
            >
              YES
            </button>
            <div className="w-0.5 bg-black" />
            <button
              onClick={() => setOutcome(0)}
              className={`flex-1 py-2.5 font-heading font-bold text-sm transition-all ${
                outcome === 0
                  ? "bg-neo-pink text-neo-dark shadow-[inset_0_-3px_0_0_rgba(0,0,0,0.15)]"
                  : "bg-white text-gray-400 hover:text-gray-600"
              }`}
            >
              NO
            </button>
          </div>

          {/* Amount */}
          <div className="mb-3">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
              Amount (STRK)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="neo-input w-full"
            />
            <div className="flex gap-1.5 mt-2">
              {presets.map((p) => (
                <button
                  key={p}
                  onClick={() => setAmount(p)}
                  className={`flex-1 py-1 border border-black text-[10px] font-bold transition-all ${
                    amount === p
                      ? "bg-neo-dark text-white"
                      : "bg-gray-50 hover:bg-gray-100"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Payout Preview */}
          {amountBigInt > 0n && (
            <div className="border-2 border-dashed border-gray-300 p-3 mb-4 space-y-1.5 bg-gray-50/50">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Potential payout</span>
                <span className="font-mono font-bold">
                  {(Number(estPayout) / 1e18).toFixed(2)} STRK
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Multiplier</span>
                <span className="font-mono font-bold text-neo-green">
                  {estMultiple.toFixed(2)}x
                </span>
              </div>
              {probShift !== 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Price impact</span>
                  <span
                    className={`font-mono font-bold ${
                      probShift > 0 ? "text-neo-green" : "text-neo-pink"
                    }`}
                  >
                    {probShift > 0 ? "+" : ""}
                    {probShift}pt
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || amountBigInt <= 0n}
            className={`neo-btn w-full text-sm ${
              outcome === 1
                ? "bg-neo-green text-neo-dark"
                : "bg-neo-pink text-neo-dark"
            } disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0`}
          >
            {loading
              ? "Executing..."
              : `Bet ${outcome === 1 ? "YES" : "NO"}${amount ? ` \u2014 ${amount} STRK` : ""}`}
          </button>

          {/* Result */}
          {result && (
            <div
              className={`mt-3 p-2.5 border-2 text-xs font-mono ${
                result.status === "success"
                  ? "border-neo-green bg-neo-green/10"
                  : "border-neo-pink bg-neo-pink/10"
              }`}
            >
              {result.status === "success" ? (
                <>
                  <span className="font-bold">Bet placed</span>
                  {result.txHash && (
                    <span className="block text-[10px] text-gray-500 mt-0.5">
                      {result.txHash}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-neo-pink">{result.error}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
