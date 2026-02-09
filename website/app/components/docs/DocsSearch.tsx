"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { DocSearchResult } from "@/data/types";

export function DocsSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DocSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Track client-side mount for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Search function with API call
  const search = useCallback(async (searchQuery: string) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(
        `/api/search?q=${encodeURIComponent(searchQuery.trim())}`,
        { signal: abortControllerRef.current.signal }
      );
      const data = await response.json();
      setResults(data.results);
      setSelectedIndex(0);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Search error:", error);
        setResults([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, search]);

  // Render snippet with highlighted match
  const renderSnippet = (result: DocSearchResult) => {
    if (!result.snippet) return null;

    const { snippet, matchStart, matchEnd } = result;
    if (matchStart === undefined || matchEnd === undefined) {
      return <span>{snippet}</span>;
    }

    const before = snippet.slice(0, matchStart);
    const match = snippet.slice(matchStart, matchEnd);
    const after = snippet.slice(matchEnd);

    return (
      <span>
        {before}
        <mark className="bg-neo-yellow/60 text-neo-dark px-0.5 rounded">{match}</mark>
        {after}
      </span>
    );
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open search with Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }

      // Close with Escape
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle navigation within results
  const handleKeyNavigation = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      navigateToResult(results[selectedIndex]);
    }
  };

  const navigateToResult = (result: DocSearchResult) => {
    router.push(`/docs/${result.slug}`);
    setIsOpen(false);
    setQuery("");
    setResults([]);
  };

  const closeModal = () => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
  };

  return (
    <>
      {/* Search trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-neo-dark/60 bg-white border-2 border-neo-dark/20 rounded hover:border-neo-dark/40 transition-colors w-full md:w-64"
        aria-label="Search documentation"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="flex-1 text-left">Search docs...</span>
        <kbd className="hidden md:inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-mono bg-neo-dark/5 rounded">
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </button>

      {/* Search modal - rendered via portal to escape header stacking context */}
      {mounted &&
        isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closeModal}
              aria-hidden="true"
            />

            {/* Modal */}
            <div className="relative min-h-screen flex items-start justify-center p-4 pt-[15vh]">
              <div className="relative w-full max-w-xl bg-white border-2 border-black shadow-neo-lg rounded-lg overflow-hidden">
                {/* Search input */}
                <div className="flex items-center gap-3 p-4 border-b-2 border-neo-dark/10">
                  <svg
                    className="w-5 h-5 text-neo-dark/40"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyNavigation}
                    placeholder="Search documentation..."
                    className="flex-1 bg-transparent outline-none text-neo-dark placeholder:text-neo-dark/40"
                    autoComplete="off"
                    aria-label="Search query"
                  />
                  <kbd className="px-2 py-1 text-xs font-mono bg-neo-dark/5 rounded text-neo-dark/60">
                    ESC
                  </kbd>
                </div>

                {/* Results */}
                <div className="max-h-96 overflow-y-auto">
                  {isLoading && (
                    <div className="p-8 text-center text-neo-dark/60">
                      <p>Searching...</p>
                    </div>
                  )}

                  {!isLoading && query && query.length >= 2 && results.length === 0 && (
                    <div className="p-8 text-center text-neo-dark/60">
                      <p>No results found for &quot;{query}&quot;</p>
                    </div>
                  )}

                  {!isLoading && results.length > 0 && (
                    <ul className="py-2" role="listbox">
                      {results.map((result, index) => (
                        <li key={result.slug} role="option" aria-selected={index === selectedIndex}>
                          <button
                            onClick={() => navigateToResult(result)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`w-full flex flex-col gap-1 px-4 py-3 text-left transition-colors ${
                              index === selectedIndex
                                ? "bg-neo-yellow/20"
                                : "hover:bg-neo-dark/5"
                            }`}
                          >
                            <span className="text-xs font-medium text-neo-purple uppercase tracking-wider">
                              {result.category}
                            </span>
                            <span className="font-medium text-neo-dark">
                              {result.title}
                            </span>
                            {result.description && (
                              <span className="text-sm text-neo-dark/60 line-clamp-1">
                                {result.description}
                              </span>
                            )}
                            {result.snippet && (
                              <span className="text-sm text-neo-dark/50 line-clamp-2 mt-1">
                                {renderSnippet(result)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {!isLoading && !query && (
                    <div className="p-8 text-center text-neo-dark/60">
                      <p className="text-sm">Type to search the documentation</p>
                      <div className="mt-4 flex items-center justify-center gap-4 text-xs">
                        <span className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 bg-neo-dark/5 rounded font-mono">
                            &#8593;&#8595;
                          </kbd>
                          <span>Navigate</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 bg-neo-dark/5 rounded font-mono">
                            Enter
                          </kbd>
                          <span>Select</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <kbd className="px-1.5 py-0.5 bg-neo-dark/5 rounded font-mono">
                            ESC
                          </kbd>
                          <span>Close</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
