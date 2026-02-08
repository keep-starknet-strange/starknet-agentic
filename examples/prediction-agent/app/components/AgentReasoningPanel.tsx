"use client";

import { useState, useRef, useEffect } from "react";

interface AgentReasoningPanelProps {
  marketId: number | null;
  question: string;
}

export default function AgentReasoningPanel({
  marketId,
  question,
}: AgentReasoningPanelProps) {
  const [reasoning, setReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [probability, setProbability] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [reasoning]);

  async function startAnalysis() {
    if (marketId === null) return;

    setReasoning("");
    setProbability(null);
    setTxHash(null);
    setError(null);
    setIsStreaming(true);
    setIsCollapsed(false);

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
  }

  // Auto-start when marketId changes
  useEffect(() => {
    if (marketId !== null) {
      startAnalysis();
    }
  }, [marketId]);

  if (marketId === null && !reasoning) return null;

  return (
    <div className="border-2 border-black bg-neo-dark text-white shadow-neo">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-neo-green font-mono text-sm">
            {isStreaming ? ">" : "$"}
          </span>
          <h3 className="font-heading font-bold text-sm">
            Agent Reasoning
            {question && (
              <span className="font-normal text-gray-400 ml-2">
                — {question.length > 50 ? question.slice(0, 50) + "..." : question}
              </span>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {probability !== null && (
            <span className="bg-neo-green text-black px-2 py-0.5 text-xs font-bold border border-black">
              {Math.round(probability * 100)}%
            </span>
          )}
          <span className="text-gray-400 text-xs">
            {isCollapsed ? "expand" : "collapse"}
          </span>
        </div>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border-t border-gray-700">
          <div
            ref={scrollRef}
            className="p-4 font-mono text-sm leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap"
          >
            {reasoning || (
              <span className="text-gray-500">
                Waiting for analysis...
              </span>
            )}
            {isStreaming && <span className="cursor-blink" />}
          </div>

          {/* Result Bar */}
          {(probability !== null || error) && (
            <div className="border-t border-gray-700 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {probability !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">Estimate:</span>
                    <span className="font-bold text-neo-green text-lg">
                      {Math.round(probability * 100)}%
                    </span>
                  </div>
                )}
                {txHash && (
                  <span className="text-xs text-gray-500 font-mono">
                    tx: {txHash.slice(0, 10)}...
                  </span>
                )}
                {error && (
                  <span className="text-xs text-neo-pink">{error}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
