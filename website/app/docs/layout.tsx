import Link from "next/link";
import { DocsSidebar, DocsSearch, DocsMobileSidebar } from "@/components/docs";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream">
      {/* Docs Navbar */}
      <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur-sm border-b-2 border-black">
        <div className="flex items-center justify-between h-16 px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center font-heading font-black text-sm group-hover:rotate-12 transition-transform">
                S
              </div>
              <span className="font-heading font-bold text-lg hidden sm:block">
                Starknet Agentic
              </span>
            </Link>
            <span className="text-neo-dark/40">/</span>
            <Link
              href="/docs"
              className="font-heading font-medium text-neo-dark/70 hover:text-neo-dark transition-colors"
            >
              Docs
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {/* Desktop search (md and up) */}
            <div className="hidden md:block">
              <DocsSearch />
            </div>

            {/* Medium screen sidebar toggle (md to lg) - slide panel */}
            <div className="hidden md:block lg:hidden">
              <DocsMobileSidebar mode="slide" iconOnly />
            </div>

            {/* Small screen menu button (below md) - fullscreen modal */}
            <div className="md:hidden">
              <DocsMobileSidebar mode="fullscreen" iconOnly />
            </div>

            <a
              href="https://github.com/keep-starknet-strange/starknet-agentic"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-neo-dark/60 hover:text-neo-dark transition-colors"
              aria-label="GitHub repository"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </a>
          </div>
        </div>

        {/* Mobile search only (below md) */}
        <div className="md:hidden px-4 pb-3">
          <DocsSearch />
        </div>
      </header>

      <div className="max-w-8xl mx-auto flex">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-64 xl:w-72 shrink-0 border-r-2 border-neo-dark/10">
          <div className="sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-6">
            <DocsSidebar />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
