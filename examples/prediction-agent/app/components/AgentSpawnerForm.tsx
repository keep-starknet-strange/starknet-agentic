"use client";

import { useState } from "react";
import { AGENT_PERSONAS } from "@/lib/agent-personas";

interface AgentSpawnerFormProps {
  onClose: () => void;
  onSpawned?: () => void;
}

const DATA_SOURCES = [
  { id: "polymarket", label: "Polymarket", desc: "Prediction market odds" },
  { id: "coingecko", label: "CoinGecko", desc: "Crypto prices & trends" },
  { id: "news", label: "News", desc: "Headlines & articles" },
  { id: "social", label: "Social", desc: "Trending topics & sentiment" },
];

export default function AgentSpawnerForm({
  onClose,
  onSpawned,
}: AgentSpawnerFormProps) {
  const [name, setName] = useState("");
  const [personaId, setPersonaId] = useState("alpha");
  const [budgetStrk, setBudgetStrk] = useState("1000");
  const [maxBetStrk, setMaxBetStrk] = useState("100");
  const [selectedSources, setSelectedSources] = useState<string[]>([
    "polymarket",
    "coingecko",
    "news",
    "social",
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim() || name.length < 2) {
      setError("Agent name must be at least 2 characters");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          personaId,
          budgetStrk: parseFloat(budgetStrk) || 1000,
          maxBetStrk: parseFloat(maxBetStrk) || 100,
          preferredSources: selectedSources,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to spawn agent");
        return;
      }

      setSuccess(true);
      onSpawned?.();
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="neo-card border-2 border-black bg-white shadow-neo-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-black bg-neo-purple">
        <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">
          Deploy Agent
        </span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center border border-white/30 text-white/60 hover:bg-white/10 text-xs"
        >
          X
        </button>
      </div>

      <div className="p-4 space-y-4">
        {success ? (
          <div className="py-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 bg-neo-green border-2 border-black flex items-center justify-center">
              <span className="text-xl text-white font-black">OK</span>
            </div>
            <p className="font-heading font-bold">
              Agent &ldquo;{name}&rdquo; deployed!
            </p>
            <p className="text-xs text-gray-500 mt-1">
              It will start researching and betting in the next cycle.
            </p>
          </div>
        ) : (
          <>
            {/* Name */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                Agent Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Superforecaster"
                className="w-full border-2 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:border-neo-purple"
              />
            </div>

            {/* Persona */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                Base Persona
              </label>
              <select
                value={personaId}
                onChange={(e) => setPersonaId(e.target.value)}
                className="w-full border-2 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:border-neo-purple bg-white"
              >
                {AGENT_PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.agentType})
                  </option>
                ))}
                <option value="custom">Custom (default settings)</option>
              </select>
            </div>

            {/* Budget */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                  Budget (STRK)
                </label>
                <input
                  type="number"
                  value={budgetStrk}
                  onChange={(e) => setBudgetStrk(e.target.value)}
                  className="w-full border-2 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:border-neo-purple"
                />
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
                  Max Bet (STRK)
                </label>
                <input
                  type="number"
                  value={maxBetStrk}
                  onChange={(e) => setMaxBetStrk(e.target.value)}
                  className="w-full border-2 border-black px-3 py-2 font-mono text-sm focus:outline-none focus:border-neo-purple"
                />
              </div>
            </div>

            {/* Data Sources */}
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-2">
                Data Sources
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DATA_SOURCES.map((source) => {
                  const isSelected = selectedSources.includes(source.id);
                  return (
                    <button
                      key={source.id}
                      onClick={() => toggleSource(source.id)}
                      className={`flex items-center gap-2 px-3 py-2 border-2 text-left transition-colors ${
                        isSelected
                          ? "border-neo-purple bg-neo-purple/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span
                        className={`w-3 h-3 border-2 flex items-center justify-center text-[8px] ${
                          isSelected
                            ? "border-neo-purple bg-neo-purple text-white"
                            : "border-gray-300"
                        }`}
                      >
                        {isSelected ? "V" : ""}
                      </span>
                      <div>
                        <span className="font-heading font-bold text-xs block">
                          {source.label}
                        </span>
                        <span className="text-[9px] text-gray-400">
                          {source.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="bg-neo-pink/10 border border-neo-pink/30 px-3 py-2 text-xs text-neo-pink font-mono">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`w-full neo-btn-primary py-3 font-bold ${
                submitting ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {submitting ? "Deploying..." : "Deploy Agent"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
