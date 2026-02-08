"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { DocsSidebar } from "./DocsSidebar";

interface DocsMobileSidebarProps {
  /** "slide" = slide-in panel from left, "fullscreen" = centered fullscreen modal */
  mode?: "slide" | "fullscreen";
  /** Hide the label text (icon only) */
  iconOnly?: boolean;
}

export function DocsMobileSidebar({ mode = "slide", iconOnly = false }: DocsMobileSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const buttonContent = (
    <>
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
      {!iconOnly && <span>Menu</span>}
    </>
  );

  const slidePanel = (
    <div className="fixed inset-0 z-50">
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
  );

  const fullscreenModal = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative w-full max-w-md bg-cream border-2 border-black shadow-neo-lg rounded-lg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b-2 border-neo-dark/10">
            <span className="font-heading font-bold text-lg">Documentation</span>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-neo-dark/60 hover:text-neo-dark transition-colors"
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

          {/* Navigation content */}
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <DocsSidebar onNavigate={() => setIsOpen(false)} />
          </div>

          {/* Footer hint */}
          <div className="p-3 border-t-2 border-neo-dark/10 bg-neo-dark/5 text-center">
            <span className="text-xs text-neo-dark/60">Tap outside to close</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Menu button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neo-dark border-2 border-neo-dark/20 rounded hover:border-neo-dark/40 transition-colors"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
      >
        {buttonContent}
      </button>

      {/* Render overlay via portal */}
      {mounted && isOpen && createPortal(
        mode === "fullscreen" ? fullscreenModal : slidePanel,
        document.body
      )}
    </>
  );
}
