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
    <div className="border-2 border-black bg-white shadow-neo-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold">Create Market</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-black text-lg font-bold"
        >
          x
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Question</label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Will ETH hit $10k by December 2026?"
            className="w-full border-2 border-black p-2 text-sm focus:outline-none focus:ring-2 focus:ring-neo-blue"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">
              Resolution (days)
            </label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full border-2 border-black p-2 font-mono text-sm focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Fee (bps)
            </label>
            <input
              type="number"
              value={feeBps}
              onChange={(e) => setFeeBps(e.target.value)}
              max="1000"
              className="w-full border-2 border-black p-2 font-mono text-sm focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-0.5">
              {parseInt(feeBps || "0") / 100}% fee
            </p>
          </div>
        </div>

        <button
          disabled={!question.trim()}
          className="w-full bg-neo-purple text-white font-bold py-3 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create Market (Requires Deployment)
        </button>

        <p className="text-xs text-gray-400 text-center">
          Deploy contracts to Sepolia first. See .env.example for configuration.
        </p>
      </div>
    </div>
  );
}
