"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface AgentResult {
  agentId: string;
  agentName: string;
  agentType: string;
  model: string;
  reasoning: string;
  probability: number | null;
  isComplete: boolean;
}

interface ConsensusResult {
  weightedProbability: number;
  simpleProbability: number;
  agentCount: number;
  agents: {
    id: string;
    name: string;
    probability: number;
    brierScore: number;
    weight: number;
  }[];
}

interface AgentReasoningPanelProps {
  marketId: number | null;
  question: string;
}

export default function AgentReasoningPanel({
  marketId,
  question,
}: AgentReasoningPanelProps) {
  const [mode, setMode] = useState<"single" | "multi">("single");
  const [reasoning, setReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [probability, setProbability] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [charCount, setCharCount] = useState(0);

  // Multi-agent state
  const [agentResults, setAgentResults] = useState<Map<string, AgentResult>>(
    new Map()
  );
  const [activeAgentTab, setActiveAgentTab] = useState<string | null>(null);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoning, agentResults, activeAgentTab]);

  const startSingleAnalysis = useCallback(async () => {
    if (marketId === null) return;

    setReasoning("");
    setProbability(null);
    setTxHash(null);
    setError(null);
    setIsStreaming(true);
    setIsCollapsed(false);
    setCharCount(0);

    try {
      const response = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let totalChars = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") {
            setIsStreaming(false);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "text") {
              totalChars += parsed.content.length;
              setCharCount(totalChars);
              setReasoning((prev) => prev + parsed.content);
            } else if (parsed.type === "result") {
              setProbability(parsed.probability);
              if (parsed.txHash) setTxHash(parsed.txHash);
              if (parsed.txError) setError(parsed.txError);
            } else if (parsed.type === "error") {
              setError(parsed.message);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
    setIsStreaming(false);
  }, [marketId]);

  const startMultiAnalysis = useCallback(async () => {
    if (marketId === null) return;

    setAgentResults(new Map());
    setConsensus(null);
    setActiveAgentTab(null);
    setCurrentAgentId(null);
    setError(null);
    setIsStreaming(true);
    setIsCollapsed(false);

    try {
      const response = await fetch("/api/multi-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") {
            setIsStreaming(false);
            return;
          }
          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "agent_start") {
              setCurrentAgentId(parsed.agentId);
              if (!activeAgentTab) setActiveAgentTab(parsed.agentId);
              setAgentResults((prev) => {
                const next = new Map(prev);
                next.set(parsed.agentId, {
                  agentId: parsed.agentId,
                  agentName: parsed.agentName,
                  agentType: parsed.agentType,
                  model: parsed.model,
                  reasoning: "",
                  probability: null,
                  isComplete: false,
                });
                return next;
              });
            } else if (parsed.type === "text" && parsed.agentId) {
              setAgentResults((prev) => {
                const next = new Map(prev);
                const agent = next.get(parsed.agentId);
                if (agent) {
                  next.set(parsed.agentId, {
                    ...agent,
                    reasoning: agent.reasoning + parsed.content,
                  });
                }
                return next;
              });
            } else if (parsed.type === "agent_complete") {
              setAgentResults((prev) => {
                const next = new Map(prev);
                const agent = next.get(parsed.agentId);
                if (agent) {
                  next.set(parsed.agentId, {
                    ...agent,
                    probability: parsed.probability,
                    isComplete: true,
                  });
                }
                return next;
              });
            } else if (parsed.type === "consensus") {
              setConsensus(parsed);
            } else if (parsed.type === "error") {
              setError(parsed.message);
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
    setIsStreaming(false);
  }, [marketId, activeAgentTab]);

  const startAnalysis = useCallback(() => {
    if (mode === "single") {
      startSingleAnalysis();
    } else {
      startMultiAnalysis();
    }
  }, [mode, startSingleAnalysis, startMultiAnalysis]);

  useEffect(() => {
    if (marketId !== null) {
      startAnalysis();
    }
  }, [marketId, startAnalysis]);

  if (marketId === null && !reasoning && agentResults.size === 0) return null;

  const activeAgent = activeAgentTab
    ? agentResults.get(activeAgentTab)
    : null;

  return (
    <div className="border-2 border-black bg-neo-dark shadow-neo-lg overflow-hidden scanlines">
      {/* Terminal Header Bar */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.03] transition-colors border-b border-white/10"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-neo-pink border border-neo-pink/50" />
            <span className="w-2.5 h-2.5 rounded-full bg-neo-yellow border border-neo-yellow/50" />
            <span
              className={`w-2.5 h-2.5 rounded-full border ${
                isStreaming
                  ? "bg-neo-green border-neo-green/50 animate-pulse"
                  : "bg-neo-green/40 border-neo-green/30"
              }`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-neo-green text-xs">
              {isStreaming
                ? mode === "multi"
                  ? `agents running (${agentResults.size})`
                  : "streaming"
                : consensus
                  ? "consensus reached"
                  : probability !== null
                    ? "complete"
                    : "idle"}
            </span>
            {question && (
              <span className="font-mono text-white/30 text-xs hidden sm:inline">
                — {question.length > 50 ? question.slice(0, 50) + "..." : question}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {consensus && (
            <span className="bg-neo-yellow text-neo-dark px-2.5 py-0.5 text-xs font-black border border-black font-mono">
              {Math.round(consensus.weightedProbability * 100)}%
            </span>
          )}
          {!consensus && probability !== null && (
            <span className="bg-neo-green text-neo-dark px-2.5 py-0.5 text-xs font-black border border-black font-mono">
              {Math.round(probability * 100)}%
            </span>
          )}
          <svg
            className={`w-4 h-4 text-white/40 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {!isCollapsed && (
        <>
          {/* Mode Selector + Agent Tabs */}
          <div className="border-b border-white/10 px-4 py-1.5 flex items-center gap-3">
            {/* Mode toggle */}
            <div className="flex items-center border border-white/20">
              <button
                onClick={() => setMode("single")}
                className={`px-2 py-0.5 text-[10px] font-mono transition-colors ${
                  mode === "single"
                    ? "bg-neo-green/20 text-neo-green"
                    : "text-white/30 hover:text-white/50"
                }`}
              >
                Single
              </button>
              <button
                onClick={() => setMode("multi")}
                className={`px-2 py-0.5 text-[10px] font-mono transition-colors ${
                  mode === "multi"
                    ? "bg-neo-purple/20 text-neo-purple"
                    : "text-white/30 hover:text-white/50"
                }`}
              >
                Multi
              </button>
            </div>

            {/* Agent tabs (multi mode) */}
            {mode === "multi" && agentResults.size > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto">
                {Array.from(agentResults.values()).map((agent) => (
                  <button
                    key={agent.agentId}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAgentTab(agent.agentId);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono transition-colors whitespace-nowrap ${
                      activeAgentTab === agent.agentId
                        ? "bg-white/10 text-white"
                        : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        agent.isComplete
                          ? "bg-neo-green"
                          : currentAgentId === agent.agentId
                            ? "bg-neo-yellow animate-pulse"
                            : "bg-white/20"
                      }`}
                    />
                    {agent.agentName}
                    {agent.probability !== null && (
                      <span className="text-neo-green">
                        {Math.round(agent.probability * 100)}%
                      </span>
                    )}
                  </button>
                ))}
                {consensus && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveAgentTab("consensus");
                    }}
                    className={`flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono transition-colors ${
                      activeAgentTab === "consensus"
                        ? "bg-neo-yellow/20 text-neo-yellow"
                        : "text-white/30 hover:text-white/50"
                    }`}
                  >
                    Consensus
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Terminal Body */}
          <div
            ref={scrollRef}
            className="px-5 py-4 font-mono text-[13px] leading-relaxed text-neo-green/90 max-h-96 overflow-y-auto whitespace-pre-wrap terminal-glow"
          >
            {/* Prompt line */}
            <div className="text-white/30 mb-3 text-xs">
              <span className="text-neo-blue">agent@starknet</span>
              <span className="text-white/20">:</span>
              <span className="text-neo-purple">~/forecast</span>
              <span className="text-white/20">$ </span>
              <span className="text-white/60">
                {mode === "multi"
                  ? `multi-analyze --market ${marketId} --agents 5`
                  : `analyze --market ${marketId}`}
              </span>
            </div>

            {mode === "single" ? (
              <>
                {reasoning ? (
                  <div className="text-white/85">{reasoning}</div>
                ) : (
                  <span className="text-white/20">Initializing forecasting engine...</span>
                )}
              </>
            ) : activeAgentTab === "consensus" && consensus ? (
              <div className="text-white/85 space-y-3">
                <div className="text-neo-yellow font-bold">
                  === REPUTATION-WEIGHTED CONSENSUS ===
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-white/40">Weighted avg: </span>
                    <span className="text-neo-yellow font-bold text-lg">
                      {Math.round(consensus.weightedProbability * 100)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-white/40">Simple avg: </span>
                    <span className="text-white/70 font-bold text-lg">
                      {Math.round(consensus.simpleProbability * 100)}%
                    </span>
                  </div>
                </div>
                <div className="border-t border-white/10 pt-2 mt-2">
                  <div className="text-white/40 text-xs mb-2">
                    Agent contributions (by inverse Brier weight):
                  </div>
                  {consensus.agents.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 py-0.5">
                      <span className="text-white/60 w-32 truncate">
                        {a.name}
                      </span>
                      <span className="text-neo-green w-12 text-right">
                        {Math.round(a.probability * 100)}%
                      </span>
                      <span className="text-white/30 w-14 text-right">
                        B:{a.brierScore.toFixed(3)}
                      </span>
                      <div className="flex-1 h-1.5 bg-white/10 overflow-hidden">
                        <div
                          className="h-full bg-neo-green/60"
                          style={{ width: `${a.weight * 100}%` }}
                        />
                      </div>
                      <span className="text-white/30 w-10 text-right text-[10px]">
                        {(a.weight * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : activeAgent ? (
              <>
                <div className="text-white/40 text-xs mb-2">
                  [{activeAgent.agentName}] {activeAgent.agentType} ·{" "}
                  {activeAgent.model}
                </div>
                {activeAgent.reasoning ? (
                  <div className="text-white/85">{activeAgent.reasoning}</div>
                ) : (
                  <span className="text-white/20">
                    Waiting for {activeAgent.agentName} to start...
                  </span>
                )}
              </>
            ) : (
              <span className="text-white/20">
                Initializing multi-agent forecasting engine...
              </span>
            )}
            {isStreaming && <span className="cursor-blink" />}
          </div>

          {/* Status Bar */}
          <div className="border-t border-white/10 px-4 py-2 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-4">
              {mode === "single" && probability !== null && (
                <div className="flex items-center gap-2">
                  <span className="text-white/30 text-[10px] font-mono uppercase tracking-wider">
                    Estimate
                  </span>
                  <span className="font-mono font-black text-neo-green text-lg leading-none">
                    {Math.round(probability * 100)}%
                  </span>
                </div>
              )}
              {mode === "multi" && consensus && (
                <div className="flex items-center gap-2">
                  <span className="text-white/30 text-[10px] font-mono uppercase tracking-wider">
                    Consensus
                  </span>
                  <span className="font-mono font-black text-neo-yellow text-lg leading-none">
                    {Math.round(consensus.weightedProbability * 100)}%
                  </span>
                  <span className="text-white/20 text-[10px] font-mono">
                    ({consensus.agentCount} agents)
                  </span>
                </div>
              )}
              {txHash && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-neo-green" />
                  <span className="text-[10px] text-white/40 font-mono">
                    {txHash.slice(0, 12)}...
                  </span>
                </div>
              )}
              {error && (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-neo-pink" />
                  <span className="text-[10px] text-neo-pink font-mono">
                    {error}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-white/20">
              <span>{mode === "multi" ? "multi-agent" : "claude-sonnet-4.5"}</span>
              <span>|</span>
              <span>ERC-8004</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
