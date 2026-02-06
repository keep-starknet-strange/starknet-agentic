import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import { ComponentPropsWithoutRef } from "react";

// Custom components for MDX rendering
function Heading1(props: ComponentPropsWithoutRef<"h1">) {
  return (
    <h1
      className="text-3xl md:text-4xl font-heading font-bold text-neo-dark mt-8 mb-4 first:mt-0"
      {...props}
    />
  );
}

function Heading2(props: ComponentPropsWithoutRef<"h2">) {
  const id =
    typeof props.children === "string"
      ? props.children.toLowerCase().replace(/\s+/g, "-")
      : undefined;
  return (
    <h2
      id={id}
      className="text-2xl md:text-3xl font-heading font-semibold text-neo-dark mt-8 mb-3 scroll-mt-20"
      {...props}
    />
  );
}

function Heading3(props: ComponentPropsWithoutRef<"h3">) {
  const id =
    typeof props.children === "string"
      ? props.children.toLowerCase().replace(/\s+/g, "-")
      : undefined;
  return (
    <h3
      id={id}
      className="text-xl md:text-2xl font-heading font-semibold text-neo-dark mt-6 mb-2 scroll-mt-20"
      {...props}
    />
  );
}

function Heading4(props: ComponentPropsWithoutRef<"h4">) {
  return (
    <h4
      className="text-lg md:text-xl font-heading font-medium text-neo-dark mt-4 mb-2"
      {...props}
    />
  );
}

function Paragraph(props: ComponentPropsWithoutRef<"p">) {
  return (
    <p className="text-neo-dark/80 leading-relaxed mb-4 last:mb-0" {...props} />
  );
}

function Anchor(props: ComponentPropsWithoutRef<"a">) {
  const { href, children, ...rest } = props;
  const isExternal = href?.startsWith("http") || href?.startsWith("//");

  if (isExternal) {
    return (
      <a
        href={href}
        className="text-neo-purple hover:text-neo-purple/80 underline underline-offset-2 transition-colors"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link
      href={href || "#"}
      className="text-neo-purple hover:text-neo-purple/80 underline underline-offset-2 transition-colors"
      {...rest}
    >
      {children}
    </Link>
  );
}

function UnorderedList(props: ComponentPropsWithoutRef<"ul">) {
  return (
    <ul
      className="list-disc list-inside space-y-2 mb-4 text-neo-dark/80 pl-2"
      {...props}
    />
  );
}

function OrderedList(props: ComponentPropsWithoutRef<"ol">) {
  return (
    <ol
      className="list-decimal list-inside space-y-2 mb-4 text-neo-dark/80 pl-2"
      {...props}
    />
  );
}

function ListItem(props: ComponentPropsWithoutRef<"li">) {
  return <li className="leading-relaxed" {...props} />;
}

function Blockquote(props: ComponentPropsWithoutRef<"blockquote">) {
  return (
    <blockquote
      className="border-l-4 border-neo-yellow pl-4 py-2 my-4 bg-neo-yellow/5 italic text-neo-dark/70"
      {...props}
    />
  );
}

function InlineCode(props: ComponentPropsWithoutRef<"code">) {
  // Check if this is inside a pre tag (code block) - don't style it
  const hasDataLanguage = "data-language" in props;
  if (hasDataLanguage) {
    return <code {...props} />;
  }

  return (
    <code
      className="bg-neo-dark/5 text-neo-dark px-1.5 py-0.5 rounded text-sm font-mono border border-neo-dark/10"
      {...props}
    />
  );
}

function Pre(props: ComponentPropsWithoutRef<"pre">) {
  return (
    <pre
      className="bg-[#0d1117] text-gray-100 rounded-lg p-4 overflow-x-auto my-4 text-sm neo-sm [&>code]:bg-transparent [&>code]:p-0 [&>code]:border-none"
      {...props}
    />
  );
}

function Table(props: ComponentPropsWithoutRef<"table">) {
  return (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full border-collapse neo-sm rounded-lg overflow-hidden" {...props} />
    </div>
  );
}

function TableHead(props: ComponentPropsWithoutRef<"thead">) {
  return <thead className="bg-neo-dark/5" {...props} />;
}

function TableRow(props: ComponentPropsWithoutRef<"tr">) {
  return <tr className="border-b border-neo-dark/10 last:border-b-0" {...props} />;
}

function TableHeader(props: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      className="text-left px-4 py-3 font-heading font-semibold text-neo-dark"
      {...props}
    />
  );
}

function TableCell(props: ComponentPropsWithoutRef<"td">) {
  return <td className="px-4 py-3 text-neo-dark/80" {...props} />;
}

function HorizontalRule() {
  return <hr className="my-8 border-neo-dark/10" />;
}

function Strong(props: ComponentPropsWithoutRef<"strong">) {
  return <strong className="font-semibold text-neo-dark" {...props} />;
}

function Emphasis(props: ComponentPropsWithoutRef<"em">) {
  return <em className="italic" {...props} />;
}

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: Heading1,
    h2: Heading2,
    h3: Heading3,
    h4: Heading4,
    p: Paragraph,
    a: Anchor,
    ul: UnorderedList,
    ol: OrderedList,
    li: ListItem,
    blockquote: Blockquote,
    code: InlineCode,
    pre: Pre,
    table: Table,
    thead: TableHead,
    tr: TableRow,
    th: TableHeader,
    td: TableCell,
    hr: HorizontalRule,
    strong: Strong,
    em: Emphasis,
    ...components,
  };
}
