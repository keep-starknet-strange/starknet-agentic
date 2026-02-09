import type { Metadata } from "next";
import Link from "next/link";
import { DOC_CATEGORIES } from "@/data/docs";

export const metadata: Metadata = {
  title: "Documentation | Starknet Agentic",
  description:
    "Documentation for Starknet Agentic - The infrastructure layer for AI agents on Starknet.",
};

const CATEGORY_ICONS: Record<string, string> = {
  "getting-started": "rocket",
  "guides": "book",
  "api-reference": "code",
  "contracts": "cube",
};

const CATEGORY_COLORS: Record<string, string> = {
  "getting-started": "bg-neo-yellow",
  "guides": "bg-neo-purple",
  "api-reference": "bg-neo-blue",
  "contracts": "bg-neo-green",
};

function CategoryIcon({ category }: { category: string }) {
  const icon = CATEGORY_ICONS[category] || "document";

  switch (icon) {
    case "rocket":
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "book":
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "code":
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      );
    case "cube":
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      );
    default:
      return (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
  }
}

export default function DocsPage() {
  return (
    <div className="px-6 md:px-8 lg:px-12 py-12 md:py-16">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-neo-dark mb-4">
            Documentation
          </h1>
          <p className="text-xl text-neo-dark/70 max-w-2xl">
            Learn how to build AI agents on Starknet with our comprehensive guides,
            API references, and smart contract documentation.
          </p>
        </div>

        {/* Quick start card */}
        <div className="neo-card p-6 md:p-8 mb-12 bg-neo-yellow/10">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="w-12 h-12 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-heading font-bold text-neo-dark mb-1">
                Quick Start
              </h2>
              <p className="text-neo-dark/70">
                New to Starknet Agentic? Start here to get your first AI agent running on Starknet.
              </p>
            </div>
            <Link
              href="/docs/getting-started/quick-start"
              className="neo-btn-primary text-sm py-2 px-4 whitespace-nowrap"
            >
              Get Started
            </Link>
          </div>
        </div>

        {/* Categories grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {DOC_CATEGORIES.map((category) => (
            <div
              key={category.slug}
              className="neo-card-hover p-6"
            >
              <div className="flex items-start gap-4 mb-4">
                <div
                  className={`w-10 h-10 ${CATEGORY_COLORS[category.slug] || "bg-neo-dark/10"} border-2 border-black shadow-neo-sm flex items-center justify-center shrink-0`}
                >
                  <CategoryIcon category={category.slug} />
                </div>
                <div>
                  <h2 className="text-lg font-heading font-bold text-neo-dark">
                    {category.title}
                  </h2>
                  <p className="text-sm text-neo-dark/60">
                    {category.pages.length} {category.pages.length === 1 ? "page" : "pages"}
                  </p>
                </div>
              </div>
              <ul className="space-y-2">
                {category.pages.slice(0, 4).map((page) => (
                  <li key={page.slug}>
                    <Link
                      href={`/docs/${category.slug}/${page.slug}`}
                      className="group flex items-center gap-2 text-sm text-neo-dark/70 hover:text-neo-purple transition-colors"
                    >
                      <svg
                        className="w-4 h-4 text-neo-dark/30 group-hover:text-neo-purple transition-colors"
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
                      {page.title}
                    </Link>
                  </li>
                ))}
              </ul>
              {category.pages.length > 4 && (
                <Link
                  href={`/docs/${category.slug}/${category.pages[0].slug}`}
                  className="inline-block mt-4 text-sm font-medium text-neo-purple hover:text-neo-purple/80 transition-colors"
                >
                  View all {category.pages.length} pages &rarr;
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Additional resources */}
        <div className="mt-12 pt-8 border-t-2 border-neo-dark/10">
          <h2 className="text-lg font-heading font-bold text-neo-dark mb-4">
            Additional Resources
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="https://github.com/keep-starknet-strange/starknet-agentic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border-2 border-neo-dark/20 rounded hover:border-neo-dark hover:shadow-neo transition-all group"
            >
              <svg className="w-5 h-5 text-neo-dark/60 group-hover:text-neo-dark transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
              <span className="font-medium text-neo-dark/80 group-hover:text-neo-dark transition-colors">GitHub</span>
            </a>
            <a
              href="https://discord.gg/starknet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border-2 border-neo-dark/20 rounded hover:border-neo-dark hover:shadow-neo transition-all group"
            >
              <svg className="w-5 h-5 text-neo-dark/60 group-hover:text-neo-dark transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
              <span className="font-medium text-neo-dark/80 group-hover:text-neo-dark transition-colors">Discord</span>
            </a>
            <a
              href="https://x.com/Starknet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border-2 border-neo-dark/20 rounded hover:border-neo-dark hover:shadow-neo transition-all group"
            >
              <svg className="w-5 h-5 text-neo-dark/60 group-hover:text-neo-dark transition-colors" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="font-medium text-neo-dark/80 group-hover:text-neo-dark transition-colors">Twitter</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
