"use client";

import { useState, useEffect } from "react";

interface MarketCreatorProps {
  onClose: () => void;
}

export default function MarketCreator({ onClose }: MarketCreatorProps) {
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState("30");
  const [feeBps, setFeeBps] = useState("200");

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 neo-card border-2 border-black bg-white shadow-neo-lg animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neo-purple border-b-2 border-black">
          <h3 className="font-heading font-bold text-sm text-white uppercase tracking-wider">
            New Prediction Market
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border-2 border-white/30 text-white hover:bg-white/10 text-xs font-mono transition-colors"
          >
            ESC
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Will ETH hit $10k by December 2026?"
              autoFocus
              className="neo-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Duration (days)
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="neo-input w-full"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                Fee (basis pts)
              </label>
              <input
                type="number"
                value={feeBps}
                onChange={(e) => setFeeBps(e.target.value)}
                max="1000"
                className="neo-input w-full"
              />
              <p className="text-[10px] text-gray-400 mt-1 font-mono">
                = {(parseInt(feeBps || "0") / 100).toFixed(1)}% fee
              </p>
            </div>
          </div>

          <button
            disabled={!question.trim()}
            className="neo-btn-dark w-full text-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Deploy Market Contract
          </button>

          <p className="text-[10px] text-gray-400 text-center font-mono leading-relaxed">
            Requires deployed contracts on Sepolia.
            <br />
            See .env.example for configuration.
          </p>
        </div>
      </div>
    </div>
  );
}
