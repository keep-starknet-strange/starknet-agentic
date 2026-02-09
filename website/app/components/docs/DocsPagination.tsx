import Link from "next/link";
import type { DocPage } from "@/data/types";

interface DocsPaginationProps {
  prev: (DocPage & { categorySlug: string }) | null;
  next: (DocPage & { categorySlug: string }) | null;
}

export function DocsPagination({ prev, next }: DocsPaginationProps) {
  if (!prev && !next) {
    return null;
  }

  return (
    <nav
      className="flex flex-col sm:flex-row gap-4 mt-12 pt-8 border-t-2 border-neo-dark/10"
      aria-label="Documentation pagination"
    >
      {prev ? (
        <Link
          href={`/docs/${prev.categorySlug}/${prev.slug}`}
          className="group flex-1 flex flex-col gap-1 p-4 border-2 border-neo-dark/20 rounded hover:border-neo-dark hover:shadow-neo transition-all"
        >
          <span className="flex items-center gap-2 text-sm text-neo-dark/60 group-hover:text-neo-purple transition-colors">
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Previous
          </span>
          <span className="font-heading font-semibold text-neo-dark group-hover:text-neo-purple transition-colors">
            {prev.title}
          </span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}

      {next ? (
        <Link
          href={`/docs/${next.categorySlug}/${next.slug}`}
          className="group flex-1 flex flex-col gap-1 p-4 border-2 border-neo-dark/20 rounded text-right hover:border-neo-dark hover:shadow-neo transition-all"
        >
          <span className="flex items-center justify-end gap-2 text-sm text-neo-dark/60 group-hover:text-neo-purple transition-colors">
            Next
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </span>
          <span className="font-heading font-semibold text-neo-dark group-hover:text-neo-purple transition-colors">
            {next.title}
          </span>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </nav>
  );
}
