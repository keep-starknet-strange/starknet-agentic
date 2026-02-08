"use client";

import { useEffect } from "react";
import AgentReasoningPanel from "./AgentReasoningPanel";
import DataSourcesPanel from "./DataSourcesPanel";

interface AnalyzeModalProps {
  marketId: number;
  question: string;
  onClose: () => void;
}

export default function AnalyzeModal({
  marketId,
  question,
  onClose,
}: AnalyzeModalProps) {
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[85vh] flex flex-col neo-card border-2 border-black bg-white shadow-neo-lg animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-neo-dark border-b-2 border-black shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-heading font-bold text-sm text-neo-green uppercase tracking-wider shrink-0">
              Analyze
            </span>
            <span className="font-mono text-xs text-white/40 truncate">
              {question}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center border-2 border-white/30 text-white hover:bg-white/10 text-xs font-mono transition-colors shrink-0 ml-3"
          >
            ESC
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Research Data */}
          <DataSourcesPanel question={question} />

          {/* Agent Reasoning */}
          <AgentReasoningPanel marketId={marketId} question={question} />
        </div>
      </div>
    </div>
  );
}
