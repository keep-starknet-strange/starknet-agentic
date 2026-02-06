"use client";

import { useState } from "react";
import { DocsSidebar } from "./DocsSidebar";

export function DocsMobileSidebar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsOpen(true)}
        className="lg:hidden flex items-center gap-2 px-3 py-2 text-sm font-medium text-neo-dark border-2 border-neo-dark/20 rounded hover:border-neo-dark/40 transition-colors"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
        <span>Menu</span>
      </button>

      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />

          {/* Sidebar panel */}
          <div className="fixed inset-y-0 left-0 w-72 bg-cream border-r-2 border-black shadow-neo-lg overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b-2 border-neo-dark/10">
              <span className="font-heading font-bold">Documentation</span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 text-neo-dark/60 hover:text-neo-dark transition-colors"
                aria-label="Close navigation menu"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <DocsSidebar onNavigate={() => setIsOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
