import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { findDocPage, getAdjacentPages } from "@/data/docs";
import { DocsPagination } from "@/components/docs";
import { DocsContentWrapper } from "./DocsContentWrapper";
import { getDocBySlug, docExists } from "@/lib/mdx";
import { mdxComponents } from "@/lib/mdx-components";

interface DocPageProps {
  params: Promise<{
    category: string;
    slug: string;
  }>;
}

export async function generateMetadata({ params }: DocPageProps): Promise<Metadata> {
  const { category, slug } = await params;
  const result = findDocPage(category, slug);

  if (!result) {
    return {
      title: "Not Found | Starknet Agentic Docs",
    };
  }

  return {
    title: `${result.page.title} | Starknet Agentic Docs`,
    description: result.page.description,
  };
}

export default async function DocPage({ params }: DocPageProps) {
  const { category, slug } = await params;
  const result = findDocPage(category, slug);

  if (!result) {
    notFound();
  }

  const { page, category: docCategory } = result;
  const { prev, next } = getAdjacentPages(category, slug);

  // Try to load MDX content
  const hasContent = docExists(category, slug);
  const doc = hasContent ? getDocBySlug(category, slug) : null;

  return (
    <DocsContentWrapper>
      <div className="px-6 md:px-8 lg:px-12 py-12 md:py-16">
        <div className="max-w-3xl">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 text-sm" aria-label="Breadcrumb">
            <a
              href="/docs"
              className="text-neo-dark/60 hover:text-neo-dark transition-colors"
            >
              Docs
            </a>
            <span className="text-neo-dark/40" aria-hidden="true">/</span>
            <span className="text-neo-purple font-medium">{docCategory.title}</span>
          </nav>

          {/* Content */}
          {doc ? (
            <article className="prose prose-neo max-w-none">
              <MDXRemote
                source={doc.content}
                components={mdxComponents}
                options={{
                  mdxOptions: {
                    remarkPlugins: [remarkGfm],
                  },
                }}
              />
            </article>
          ) : (
            <>
              {/* Page header for placeholder */}
              <header className="mb-8">
                <h1 className="text-3xl md:text-4xl font-heading font-bold text-neo-dark mb-3">
                  {page.title}
                </h1>
                {page.description && (
                  <p className="text-lg text-neo-dark/70">{page.description}</p>
                )}
              </header>

              {/* Placeholder */}
              <article className="prose prose-neo max-w-none">
                <div className="neo-card p-8 bg-neo-yellow/5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center shrink-0">
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
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-heading font-bold text-neo-dark mb-2">
                        Documentation Coming Soon
                      </h2>
                      <p className="text-neo-dark/70 mb-4">
                        This documentation page is currently being written. In the meantime, you can:
                      </p>
                      <ul className="space-y-2 text-neo-dark/70">
                        <li className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-neo-purple"
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
                          Check out the{" "}
                          <a
                            href="https://github.com/keep-starknet-strange/starknet-agentic"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neo-purple hover:text-neo-purple/80 underline underline-offset-2"
                          >
                            GitHub repository
                          </a>
                        </li>
                        <li className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-neo-purple"
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
                          Read the inline code documentation
                        </li>
                        <li className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-neo-purple"
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
                          Join the community on Discord
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </article>
            </>
          )}

          {/* Pagination */}
          <DocsPagination prev={prev} next={next} />
        </div>
      </div>
    </DocsContentWrapper>
  );
}
