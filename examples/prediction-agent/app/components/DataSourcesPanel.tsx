"use client";

import { useState, useEffect } from "react";

interface DataPoint {
  label: string;
  value: string | number;
  url?: string;
  confidence?: number;
}

interface DataSourceResult {
  source: string;
  query: string;
  timestamp: number;
  data: DataPoint[];
  summary: string;
}

interface DataSourcesPanelProps {
  question: string;
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  polymarket: { label: "Polymarket", color: "text-neo-purple", icon: "PM" },
  coingecko: { label: "CoinGecko", color: "text-neo-yellow", icon: "CG" },
  news: { label: "News", color: "text-neo-blue", icon: "NW" },
  social: { label: "Social", color: "text-neo-pink", icon: "SC" },
};

export default function DataSourcesPanel({ question }: DataSourcesPanelProps) {
  const [results, setResults] = useState<DataSourceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (!question) return;

    setLoading(true);
    fetch(`/api/data-sources?question=${encodeURIComponent(question)}`)
      .then((r) => r.json())
      .then((data) => {
        setResults(data.results ?? []);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [question]);

  if (!question) return null;

  return (
    <div className="border-2 border-black bg-white shadow-neo overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-black/10"
      >
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold text-xs uppercase tracking-wider">
            Research Data
          </span>
          {loading && (
            <span className="w-2 h-2 bg-neo-blue rounded-full animate-pulse" />
          )}
          {!loading && results.length > 0 && (
            <span className="text-[10px] font-mono text-gray-400">
              {results.length} sources
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="py-6 text-center">
              <span className="font-mono text-xs text-gray-400">
                Gathering research data...
              </span>
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center">
              <span className="font-mono text-xs text-gray-400">
                No data available
              </span>
            </div>
          ) : (
            results.map((result) => {
              const config = SOURCE_CONFIG[result.source] ?? {
                label: result.source,
                color: "text-gray-600",
                icon: "??",
              };
              const isExpanded = expandedSource === result.source;

              return (
                <div
                  key={result.source}
                  className="border border-black/10 bg-cream"
                >
                  <button
                    onClick={() =>
                      setExpandedSource(isExpanded ? null : result.source)
                    }
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-black/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 flex items-center justify-center border border-black/10 text-[9px] font-black ${config.color}`}
                      >
                        {config.icon}
                      </span>
                      <span className="font-heading font-bold text-xs">
                        {config.label}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400">
                        {result.data.length} points
                      </span>
                    </div>
                    <svg
                      className={`w-3 h-3 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2">
                      {/* Summary */}
                      <p className="font-mono text-[11px] text-gray-500 leading-snug">
                        {result.summary}
                      </p>

                      {/* Data points */}
                      <div className="space-y-1">
                        {result.data.map((point, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-[11px]"
                          >
                            <span className="text-gray-400 shrink-0 font-mono">
                              {point.label}:
                            </span>
                            <span className="font-mono font-bold text-gray-700">
                              {String(point.value)}
                            </span>
                            {point.confidence !== undefined && (
                              <div className="shrink-0 w-12 h-1.5 bg-gray-200 mt-1.5">
                                <div
                                  className={`h-full ${config.color.replace("text-", "bg-")}`}
                                  style={{
                                    width: `${Math.min(100, point.confidence * 100)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
