"use client";

import { useEffect, useState } from "react";
import type { TableOfContentsItem } from "@/data/types";

interface DocsTableOfContentsProps {
  items: TableOfContentsItem[];
}

export function DocsTableOfContents({ items }: DocsTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  // Filter out items with empty IDs (can't navigate to them)
  const validItems = items.filter((item) => item.id && item.id.trim() !== "");

  useEffect(() => {
    if (validItems.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first visible heading
        const visibleEntries = entries.filter((entry) => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -80% 0px",
        threshold: 0,
      }
    );

    // Observe all heading elements
    validItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [validItems]);

  if (validItems.length === 0) {
    return null;
  }

  return (
    <nav className="space-y-1" aria-label="Table of contents">
      <h4 className="font-heading font-semibold text-sm uppercase tracking-wider text-neo-dark/60 mb-3">
        On this page
      </h4>
      <ul className="space-y-1 border-l-2 border-neo-dark/10">
        {validItems.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  const element = document.getElementById(item.id);
                  if (element) {
                    element.scrollIntoView({ behavior: "smooth" });
                    // Update URL hash without scrolling
                    window.history.pushState(null, "", `#${item.id}`);
                    setActiveId(item.id);
                  }
                }}
                className={`block py-1 text-sm transition-colors ${
                  item.level === 2 ? "pl-3" : "pl-6"
                } ${
                  isActive
                    ? "text-neo-purple font-medium border-l-2 border-neo-purple -ml-[2px]"
                    : "text-neo-dark/60 hover:text-neo-dark"
                }`}
                aria-current={isActive ? "location" : undefined}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Helper function to extract headings from HTML content
export function extractHeadings(content: string): TableOfContentsItem[] {
  const headingRegex = /<h([23])[^>]*id="([^"]*)"[^>]*>([^<]*)<\/h[23]>/g;
  const items: TableOfContentsItem[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    items.push({
      level: parseInt(match[1], 10),
      id: match[2],
      title: match[3].trim(),
    });
  }

  return items;
}

// Alternative: Extract headings from DOM (for use in useEffect)
export function extractHeadingsFromDOM(): TableOfContentsItem[] {
  const headings = document.querySelectorAll("article h2[id], article h3[id]");
  return Array.from(headings).map((heading) => ({
    id: heading.id,
    title: heading.textContent || "",
    level: parseInt(heading.tagName[1], 10),
  }));
}
