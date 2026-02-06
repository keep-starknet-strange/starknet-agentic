"use server";

import { codeToHtml, type BundledLanguage } from "shiki";
import { CopyButton } from "./CopyButton";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  showCopyButton?: boolean;
}

const languageMap: Record<string, BundledLanguage> = {
  typescript: "typescript",
  ts: "typescript",
  javascript: "javascript",
  js: "javascript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  env: "bash",
  cairo: "rust", // Cairo syntax is similar to Rust
  rust: "rust",
  python: "python",
  py: "python",
  solidity: "solidity",
  sol: "solidity",
  yaml: "yaml",
  yml: "yaml",
  markdown: "markdown",
  md: "markdown",
  toml: "toml",
  css: "css",
  html: "html",
  sql: "sql",
  graphql: "graphql",
};

export async function CodeBlock({
  code,
  language = "typescript",
  filename,
  showLineNumbers = false,
  showCopyButton = true,
}: CodeBlockProps) {
  const lang = languageMap[language.toLowerCase()] || "typescript";

  const html = await codeToHtml(code.trim(), {
    lang,
    theme: "github-dark-default",
  });

  return (
    <div className="my-4 neo-sm rounded-lg overflow-hidden group relative">
      {filename && (
        <div className="bg-[#161b22] px-4 py-2 text-sm text-gray-400 border-b border-gray-700 font-mono flex items-center justify-between">
          <span>{filename}</span>
        </div>
      )}
      {showCopyButton && <CopyButton code={code.trim()} />}
      <div
        className={`
          [&>pre]:!bg-[#0d1117] [&>pre]:!m-0 [&>pre]:p-4 [&>pre]:overflow-x-auto
          [&>pre]:text-sm [&>pre]:leading-relaxed
          ${showLineNumbers ? "[&_.line]:before:content-[counter(line)] [&_.line]:before:counter-increment-[line] [&_.line]:before:mr-4 [&_.line]:before:text-gray-500 [&_.line]:before:text-right [&_.line]:before:w-4 [&_.line]:before:inline-block [&>pre]:counter-reset-[line]" : ""}
        `}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
