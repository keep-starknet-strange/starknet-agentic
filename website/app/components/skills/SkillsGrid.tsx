"use client";

import { useState, useMemo } from "react";
import { SKILLS, getAllKeywords, filterSkills } from "@/data/skills";
import { SkillCard } from "./SkillCard";

export function SkillsGrid() {
  const [query, setQuery] = useState("");
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);

  const allKeywords = useMemo(() => getAllKeywords(), []);

  const filteredSkills = useMemo(() => {
    let results = filterSkills(query);

    if (selectedKeyword) {
      results = results.filter((skill) =>
        skill.keywords.includes(selectedKeyword)
      );
    }

    return results;
  }, [query, selectedKeyword]);

  const handleKeywordClick = (keyword: string) => {
    if (selectedKeyword === keyword) {
      setSelectedKeyword(null);
    } else {
      setSelectedKeyword(keyword);
      setQuery("");
    }
  };

  const clearFilters = () => {
    setQuery("");
    setSelectedKeyword(null);
  };

  return (
    <div className="space-y-6">
      {/* Search and Filter Controls */}
      <div className="space-y-4">
        {/* Search Input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neo-dark/40"
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
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedKeyword(null);
            }}
            placeholder="Search skills by name, description, or keyword..."
            className="w-full pl-10 pr-4 py-3 border-2 border-neo-dark/20 rounded-lg focus:border-neo-purple focus:outline-none transition-colors"
            aria-label="Search skills"
          />
          {(query || selectedKeyword) && (
            <button
              onClick={clearFilters}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neo-dark/40 hover:text-neo-dark transition-colors"
              aria-label="Clear filters"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Keyword Filters */}
        <div className="flex flex-wrap gap-2">
          {allKeywords.slice(0, 12).map((keyword) => (
            <button
              key={keyword}
              onClick={() => handleKeywordClick(keyword)}
              className={`px-3 py-1.5 text-sm border-2 rounded transition-colors ${
                selectedKeyword === keyword
                  ? "border-neo-purple bg-neo-purple text-white"
                  : "border-neo-dark/20 hover:border-neo-purple/50 text-neo-dark/70"
              }`}
            >
              {keyword}
            </button>
          ))}
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-neo-dark/60">
        <span>
          {filteredSkills.length} skill{filteredSkills.length !== 1 ? "s" : ""}{" "}
          {query || selectedKeyword ? "found" : "available"}
        </span>
        {selectedKeyword && (
          <span className="flex items-center gap-2">
            Filtered by:{" "}
            <span className="px-2 py-0.5 bg-neo-purple/10 text-neo-purple rounded text-xs font-medium">
              {selectedKeyword}
            </span>
          </span>
        )}
      </div>

      {/* Skills Grid */}
      {filteredSkills.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSkills.map((skill) => (
            <SkillCard key={skill.slug} skill={skill} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-neo-dark/60 mb-4">
            No skills found matching &quot;{query || selectedKeyword}&quot;
          </p>
          <button
            onClick={clearFilters}
            className="text-neo-purple hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
