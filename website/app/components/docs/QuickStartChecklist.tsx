"use client";

import { useState, useEffect } from "react";

interface ChecklistItem {
  id: string;
  label: string;
  description?: string;
}

interface QuickStartChecklistProps {
  items: ChecklistItem[];
  storageKey?: string;
}

export function QuickStartChecklist({
  items,
  storageKey = "starknet-agentic-quickstart",
}: QuickStartChecklistProps) {
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setCheckedItems(new Set(JSON.parse(saved)));
      } catch {
        // Invalid saved data, ignore
      }
    }
  }, [storageKey]);

  function toggleItem(id: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }

  function resetChecklist() {
    setCheckedItems(new Set());
    localStorage.removeItem(storageKey);
  }

  const progress = (checkedItems.size / items.length) * 100;
  const allComplete = checkedItems.size === items.length;

  if (!mounted) {
    return (
      <div className="neo-card p-6 bg-neo-yellow/5">
        <div className="animate-pulse">
          <div className="h-4 bg-neo-dark/10 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="h-6 bg-neo-dark/10 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neo-card p-6 bg-neo-yellow/5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold text-neo-dark flex items-center gap-2">
          <svg className="w-5 h-5 text-neo-yellow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          Quick Start Checklist
        </h3>
        {checkedItems.size > 0 && (
          <button
            onClick={resetChecklist}
            className="text-sm text-neo-dark/50 hover:text-neo-dark transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-neo-dark/60">
            {checkedItems.size} of {items.length} complete
          </span>
          <span className="font-medium text-neo-dark">{Math.round(progress)}%</span>
        </div>
        <div className="h-2 bg-neo-dark/10 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${
              allComplete ? "bg-neo-green" : "bg-neo-purple"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Checklist items */}
      <ul className="space-y-2">
        {items.map((item) => {
          const isChecked = checkedItems.has(item.id);
          return (
            <li key={item.id}>
              <button
                onClick={() => toggleItem(item.id)}
                className={`w-full text-left p-3 rounded border-2 transition-all flex items-start gap-3 ${
                  isChecked
                    ? "bg-neo-green/10 border-neo-green/50"
                    : "bg-white border-neo-dark/20 hover:border-neo-dark/40"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isChecked
                      ? "bg-neo-green border-neo-green text-white"
                      : "border-neo-dark/30"
                  }`}
                >
                  {isChecked && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <span
                    className={`font-medium ${
                      isChecked ? "text-neo-dark/70 line-through" : "text-neo-dark"
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.description && (
                    <p className={`text-sm mt-0.5 ${isChecked ? "text-neo-dark/40" : "text-neo-dark/60"}`}>
                      {item.description}
                    </p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Completion message */}
      {allComplete && (
        <div className="mt-4 p-3 bg-neo-green/20 rounded border-2 border-neo-green/50 text-center">
          <span className="font-heading font-bold text-neo-dark">
            All done! You&apos;re ready to build.
          </span>
        </div>
      )}
    </div>
  );
}
