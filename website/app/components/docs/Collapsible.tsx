"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Collapsible({ title, children, defaultOpen = false }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="my-4 border-2 border-neo-dark/20 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 text-left bg-neo-dark/5 hover:bg-neo-dark/10 transition-colors flex items-center justify-between gap-4"
        aria-expanded={isOpen}
      >
        <span className="font-heading font-semibold text-neo-dark">{title}</span>
        <svg
          className={`w-5 h-5 text-neo-dark/60 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-neo-dark/10">
          <div className="text-neo-dark/80 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// FAQ-specific wrapper for better semantics
interface FAQItemProps {
  question: string;
  children: ReactNode;
}

export function FAQItem({ question, children }: FAQItemProps) {
  return <Collapsible title={question}>{children}</Collapsible>;
}
