"use client";

import { useEffect, useState } from "react";
import { DocsTableOfContents, extractHeadingsFromDOM } from "@/components/docs";
import type { TableOfContentsItem } from "@/data/types";

interface DocsContentWrapperProps {
  children: React.ReactNode;
}

export function DocsContentWrapper({ children }: DocsContentWrapperProps) {
  const [tocItems, setTocItems] = useState<TableOfContentsItem[]>([]);

  useEffect(() => {
    // Extract headings after content is rendered
    const headings = extractHeadingsFromDOM();
    setTocItems(headings);
  }, []);

  return (
    <div className="flex">
      {/* Main content */}
      <div className="flex-1 min-w-0">{children}</div>

      {/* Table of contents - desktop only */}
      {tocItems.length > 0 && (
        <aside className="hidden xl:block w-56 shrink-0 pl-8 pr-4">
          <div className="sticky top-24">
            <DocsTableOfContents items={tocItems} />
          </div>
        </aside>
      )}
    </div>
  );
}
