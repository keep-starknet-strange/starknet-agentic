import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import {
  QuickStartChecklist,
  Callout,
  Collapsible,
  FAQItem,
  Steps,
  Step,
} from "@/components/docs";

// Custom heading component with auto-generated IDs for TOC
function createHeading(level: 1 | 2 | 3 | 4 | 5 | 6) {
  const Tag = `h${level}` as const;

  return function Heading({ children }: { children: React.ReactNode }) {
    const text = typeof children === "string" ? children : "";
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    return (
      <Tag id={id} className="scroll-mt-20">
        {children}
      </Tag>
    );
  };
}

// Custom link component
function CustomLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (!href) return <span {...props}>{children}</span>;

  // External links
  if (href.startsWith("http")) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-neo-purple hover:text-neo-purple/80 underline underline-offset-2"
        {...props}
      >
        {children}
      </a>
    );
  }

  // Internal links
  return (
    <Link
      href={href}
      className="text-neo-purple hover:text-neo-purple/80 underline underline-offset-2"
      {...props}
    >
      {children}
    </Link>
  );
}

// Custom code block component for fenced code blocks
async function CustomCode({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { children?: string }) {
  // Check if this is a code block (has language class)
  const match = /language-(\w+)/.exec(className || "");

  if (match) {
    const language = match[1];
    const code = typeof children === "string" ? children : "";

    return <CodeBlock code={code} language={language} />;
  }

  // Inline code
  return (
    <code
      className="px-1.5 py-0.5 bg-neo-dark/10 rounded text-sm font-mono text-neo-dark"
      {...props}
    >
      {children}
    </code>
  );
}

// Custom pre element (wrapper for code blocks)
function CustomPre({ children }: { children: React.ReactNode }) {
  // Just pass through - the code element handles everything
  return <>{children}</>;
}

// Custom table components
function CustomTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse border-2 border-neo-dark/20 rounded-lg overflow-hidden">
        {children}
      </table>
    </div>
  );
}

function CustomTh({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-heading font-bold bg-neo-dark/5 border-b-2 border-neo-dark/20">
      {children}
    </th>
  );
}

function CustomTd({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3 border-b border-neo-dark/10">{children}</td>
  );
}

// Custom blockquote
function CustomBlockquote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-4 pl-4 border-l-4 border-neo-purple/50 text-neo-dark/70 italic">
      {children}
    </blockquote>
  );
}

// Custom horizontal rule
function CustomHr() {
  return <hr className="my-8 border-t-2 border-neo-dark/10" />;
}

// Custom list components
function CustomUl({ children }: { children: React.ReactNode }) {
  return <ul className="my-4 pl-6 list-disc space-y-2">{children}</ul>;
}

function CustomOl({ children }: { children: React.ReactNode }) {
  return <ol className="my-4 pl-6 list-decimal space-y-2">{children}</ol>;
}

function CustomLi({ children }: { children: React.ReactNode }) {
  return <li className="text-neo-dark/80">{children}</li>;
}

export const mdxComponents: MDXComponents = {
  // Headings
  h1: createHeading(1),
  h2: createHeading(2),
  h3: createHeading(3),
  h4: createHeading(4),
  h5: createHeading(5),
  h6: createHeading(6),

  // Links
  a: CustomLink,

  // Code
  code: CustomCode as MDXComponents["code"],
  pre: CustomPre,

  // Tables
  table: CustomTable,
  th: CustomTh,
  td: CustomTd,

  // Other elements
  blockquote: CustomBlockquote,
  hr: CustomHr,
  ul: CustomUl,
  ol: CustomOl,
  li: CustomLi,

  // Custom components
  QuickStartChecklist,
  Callout,
  Collapsible,
  FAQItem,
  Steps,
  Step,
  CodeBlock,
};

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...mdxComponents,
    ...components,
  };
}
