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
import { SkillsGrid, SkillCard } from "@/components/skills";

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
  const code = typeof children === "string" ? children : "";

  // Check if this is a code block (has language class)
  const match = /language-(\w+)/.exec(className || "");

  if (match) {
    const language = match[1];
    return <CodeBlock code={code} language={language} />;
  }

  // If no language but has newlines, it's a code block (like ASCII diagrams)
  if (code.includes("\n")) {
    return <CodeBlock code={code} language="text" />;
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

// Custom table components with neo-brutalist styling
function CustomTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-2 border-black shadow-neo bg-white">
        {children}
      </table>
    </div>
  );
}

function CustomThead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-neo-yellow/30">{children}</thead>;
}

function CustomTbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-neo-dark/10">{children}</tbody>;
}

function CustomTr({ children }: { children: React.ReactNode }) {
  return <tr className="hover:bg-neo-dark/5 transition-colors">{children}</tr>;
}

function CustomTh({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left font-heading font-bold text-neo-dark border-b-2 border-black">
      {children}
    </th>
  );
}

function CustomTd({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3 text-neo-dark/80">{children}</td>
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
  thead: CustomThead,
  tbody: CustomTbody,
  tr: CustomTr,
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
  SkillsGrid,
  SkillCard,
};

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...mdxComponents,
    ...components,
  };
}
