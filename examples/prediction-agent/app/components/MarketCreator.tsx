"use client";

import { useState } from "react";

interface MarketCreatorProps {
  onClose: () => void;
}

export default function MarketCreator({ onClose }: MarketCreatorProps) {
  const [question, setQuestion] = useState("");
  const [days, setDays] = useState("30");
  const [feeBps, setFeeBps] = useState("200");

  return (
    <div className="neo-card overflow-hidden animate-enter">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-neo-purple border-b-2 border-black">
        <h3 className="font-heading font-bold text-sm text-white">
          New Prediction Market
        </h3>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center border-2 border-black bg-white hover:bg-neo-pink hover:text-white transition-colors text-xs font-bold"
        >
          x
        </button>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
            Question
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will ETH hit $10k by December 2026?"
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
  );
}
