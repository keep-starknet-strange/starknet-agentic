"use client";

import { useState, useEffect } from "react";
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
  const [spawnedName, setSpawnedName] = useState("");

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

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

      setSpawnedName(name);
      setSuccess(true);
      onSpawned?.();
      setTimeout(() => onClose(), 1800);
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setSubmitting(false);
    }
  };

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
        <div className="flex items-center justify-between px-5 py-3.5 border-b-2 border-black bg-neo-purple">
          <span className="font-heading font-bold text-sm text-white uppercase tracking-wider">
            Deploy Agent
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border-2 border-white/30 text-white hover:bg-white/10 text-xs font-mono transition-colors"
          >
            ESC
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {success ? (
            <div className="py-10 text-center">
              <div className="w-14 h-14 mx-auto mb-4 bg-neo-green border-2 border-black flex items-center justify-center shadow-neo-sm">
                <span className="text-2xl text-white font-black">OK</span>
              </div>
              <p className="font-heading font-bold text-lg">
                Agent &ldquo;{spawnedName}&rdquo; deployed!
              </p>
              <p className="text-xs text-gray-500 mt-1.5 font-mono">
                It will appear in the leaderboard and start in the next cycle.
              </p>
            </div>
          ) : (
            <>
              {/* Name */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="My Superforecaster"
                  autoFocus
                  className="w-full border-2 border-black px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-neo-purple transition-colors"
                />
              </div>

              {/* Persona */}
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                  Base Persona
                </label>
                <select
                  value={personaId}
                  onChange={(e) => setPersonaId(e.target.value)}
                  className="w-full border-2 border-black px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-neo-purple bg-white transition-colors"
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
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                    Budget (STRK)
                  </label>
                  <input
                    type="number"
                    value={budgetStrk}
                    onChange={(e) => setBudgetStrk(e.target.value)}
                    className="w-full border-2 border-black px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-neo-purple transition-colors"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1.5">
                    Max Bet (STRK)
                  </label>
                  <input
                    type="number"
                    value={maxBetStrk}
                    onChange={(e) => setMaxBetStrk(e.target.value)}
                    className="w-full border-2 border-black px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-neo-purple transition-colors"
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
                        className={`flex items-center gap-2 px-3 py-2.5 border-2 text-left transition-all ${
                          isSelected
                            ? "border-neo-purple bg-neo-purple/5 shadow-neo-sm"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 border-2 flex items-center justify-center text-[9px] font-bold shrink-0 ${
                            isSelected
                              ? "border-neo-purple bg-neo-purple text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {isSelected ? "\u2713" : ""}
                        </span>
                        <div className="min-w-0">
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
                <div className="bg-neo-pink/10 border-2 border-neo-pink/30 px-3 py-2.5 text-xs text-neo-pink font-mono">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full neo-btn-primary py-3 font-bold text-sm ${
                  submitting ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {submitting ? "Deploying..." : "Deploy Agent"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
