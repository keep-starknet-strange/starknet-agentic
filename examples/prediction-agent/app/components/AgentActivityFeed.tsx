"use client";

import { useState, useEffect, useRef } from "react";

interface AgentAction {
  id: string;
  timestamp: number;
  agentId: string;
  agentName: string;
  type: "research" | "prediction" | "bet" | "discovery" | "error";
  marketId?: number;
  question?: string;
  detail: string;
  probability?: number;
  betAmount?: string;
  betOutcome?: "YES" | "NO";
  sourcesUsed?: string[];
}

interface AgentActivityFeedProps {
  isLoopRunning: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  research: "text-neo-blue",
  prediction: "text-neo-green",
  bet: "text-neo-yellow",
  discovery: "text-neo-purple",
  error: "text-neo-pink",
};

const TYPE_ICONS: Record<string, string> = {
  research: "R",
  prediction: "P",
  bet: "$",
  discovery: "D",
  error: "!",
};

export default function AgentActivityFeed({
  isLoopRunning,
}: AgentActivityFeedProps) {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isLoopRunning) {
      // Fetch initial log when not streaming
      fetch("/api/agent-loop")
        .then((r) => r.json())
        .then((data) => {
          if (data.actions) setActions(data.actions);
        })
        .catch(() => {});
      return;
    }

    // Connect to SSE stream
    const es = new EventSource("/api/agent-loop/stream");
    eventSourceRef.current = es;

    es.onopen = () => setIsConnected(true);

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.eventType === "action" || parsed.agentId) {
          setActions((prev) => {
            const next = [...prev, parsed];
            return next.slice(-100); // Keep last 100
          });
        }
        // "status" and "ping" events are silently handled
      } catch {
        // Skip malformed messages
      }
    };

    es.onerror = () => {
      setIsConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [isLoopRunning]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [actions]);

  if (actions.length === 0 && !isLoopRunning) return null;

  return (
    <div className="border-2 border-black bg-neo-dark shadow-neo overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/10"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isLoopRunning
                  ? "bg-neo-green animate-pulse"
                  : "bg-white/20"
              }`}
            />
          </div>
          <span className="font-mono text-neo-green text-xs">
            Agent Activity Feed
          </span>
          <span className="font-mono text-white/20 text-[10px]">
            {actions.length} actions
            {isConnected && " · live"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isLoopRunning && (
            <span className="bg-neo-green/20 text-neo-green text-[10px] font-mono px-2 py-0.5 border border-neo-green/30">
              AUTONOMOUS
            </span>
          )}
          <svg
            className={`w-4 h-4 text-white/40 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
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
        </div>
      </button>

      {!isCollapsed && (
        <div
          ref={scrollRef}
          className="max-h-72 overflow-y-auto px-4 py-3 space-y-1"
        >
          {actions.length === 0 ? (
            <div className="text-white/20 font-mono text-xs text-center py-8">
              {isLoopRunning
                ? "Waiting for agent actions..."
                : "Start the autonomous loop to see agent activity"}
            </div>
          ) : (
            actions.map((action) => (
              <div
                key={action.id}
                className="flex items-start gap-2 font-mono text-[11px] leading-snug"
              >
                {/* Timestamp */}
                <span className="text-white/20 shrink-0 w-14 tabular-nums">
                  {new Date(action.timestamp).toLocaleTimeString("en-US", {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>

                {/* Type badge */}
                <span
                  className={`shrink-0 w-4 h-4 flex items-center justify-center text-[9px] font-black border ${
                    action.type === "bet"
                      ? "border-neo-yellow/50 bg-neo-yellow/10"
                      : action.type === "error"
                        ? "border-neo-pink/50 bg-neo-pink/10"
                        : "border-white/10 bg-white/5"
                  }`}
                >
                  <span className={TYPE_COLORS[action.type] ?? "text-white/40"}>
                    {TYPE_ICONS[action.type] ?? "·"}
                  </span>
                </span>

                {/* Agent name */}
                <span className="text-neo-blue shrink-0">
                  {action.agentName}
                </span>

                {/* Detail */}
                <span className={TYPE_COLORS[action.type] ?? "text-white/60"}>
                  {action.detail}
                </span>

                {/* Probability pill */}
                {action.probability !== undefined && (
                  <span className="shrink-0 bg-white/5 text-neo-green px-1.5 border border-white/10 text-[10px]">
                    {Math.round(action.probability * 100)}%
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
