"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DOC_CATEGORIES } from "@/data/docs";
import { useState } from "react";

interface DocsSidebarProps {
  onNavigate?: () => void;
}

export function DocsSidebar({ onNavigate }: DocsSidebarProps) {
  const pathname = usePathname();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => {
      // Start with all categories expanded
      return new Set(DOC_CATEGORIES.map((c) => c.slug));
    }
  );

  const toggleCategory = (slug: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const isActive = (categorySlug: string, pageSlug: string) => {
    return pathname === `/docs/${categorySlug}/${pageSlug}`;
  };

  const isCategoryActive = (categorySlug: string) => {
    return pathname.startsWith(`/docs/${categorySlug}`);
  };

  return (
    <nav className="space-y-6" aria-label="Documentation navigation">
      {DOC_CATEGORIES.map((category) => (
        <div key={category.slug}>
          <button
            onClick={() => toggleCategory(category.slug)}
            className={`flex items-center justify-between w-full text-left font-heading font-semibold text-sm uppercase tracking-wider mb-2 px-2 py-1 rounded transition-colors ${
              isCategoryActive(category.slug)
                ? "text-neo-purple"
                : "text-neo-dark/60 hover:text-neo-dark"
            }`}
            aria-expanded={expandedCategories.has(category.slug)}
          >
            <span>{category.title}</span>
            <svg
              className={`w-4 h-4 transition-transform ${
                expandedCategories.has(category.slug) ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {expandedCategories.has(category.slug) && (
            <ul className="space-y-1 pl-2 border-l-2 border-neo-dark/10">
              {category.pages.map((page) => {
                const active = isActive(category.slug, page.slug);
                return (
                  <li key={page.slug}>
                    <Link
                      href={`/docs/${category.slug}/${page.slug}`}
                      onClick={onNavigate}
                      className={`block py-1.5 px-3 text-sm rounded-r transition-colors ${
                        active
                          ? "bg-neo-yellow/30 text-neo-dark font-medium border-l-2 border-neo-yellow -ml-[2px]"
                          : "text-neo-dark/70 hover:text-neo-dark hover:bg-neo-dark/5"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      {page.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
