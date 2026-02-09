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

const languageMap: Record<string, BundledLanguage | "text"> = {
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
  text: "text",
  plaintext: "text",
  txt: "text",
};

export async function CodeBlock({
  code,
  language = "typescript",
  filename,
  showLineNumbers = false,
  showCopyButton = true,
}: CodeBlockProps) {
  const lang = languageMap[language.toLowerCase()] || "typescript";
  // Trim leading/trailing newlines but preserve indentation
  const trimmedCode = code.replace(/^\n+|\n+$/g, '');

  // For plain text, render without syntax highlighting
  if (lang === "text") {
    return (
      <div className="group relative">
        {filename && (
          <div className="bg-[#161b22] px-4 py-2 text-sm text-gray-400 border-b border-gray-700 font-mono flex items-center justify-between rounded-t-lg border-2 border-b-0 border-black">
            <span>{filename}</span>
          </div>
        )}
        {showCopyButton && <CopyButton code={trimmedCode} />}
        <pre
          className={`!bg-[#0d1117] !m-0 p-4 overflow-x-auto text-sm leading-relaxed text-gray-100 whitespace-pre border-2 border-black shadow-neo ${filename ? 'rounded-t-none' : 'rounded-lg'}`}
          style={{ fontFamily: 'var(--font-jetbrains-mono), "JetBrains Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace' }}
        >
          {trimmedCode}
        </pre>
      </div>
    );
  }

  const html = await codeToHtml(trimmedCode, {
    lang: lang as BundledLanguage,
    theme: "github-dark-default",
  });

  return (
    <div className="group relative">
      {filename && (
        <div className="bg-[#161b22] px-4 py-2 text-sm text-gray-400 border-b border-gray-700 font-mono flex items-center justify-between rounded-t-lg border-2 border-b-0 border-black">
          <span>{filename}</span>
        </div>
      )}
      {showCopyButton && <CopyButton code={trimmedCode} />}
      <div
        className={`
          [&>pre]:!bg-[#0d1117] [&>pre]:!m-0 [&>pre]:p-4 [&>pre]:overflow-x-auto
          [&>pre]:text-sm [&>pre]:leading-relaxed [&>pre]:font-mono
          [&>pre]:border-2 [&>pre]:border-black [&>pre]:shadow-neo [&>pre]:rounded-lg
          [&_code]:font-mono
          ${filename ? "[&>pre]:rounded-t-none [&>pre]:border-t-0" : ""}
          ${showLineNumbers ? "[&_.line]:before:content-[counter(line)] [&_.line]:before:counter-increment-[line] [&_.line]:before:mr-4 [&_.line]:before:text-gray-500 [&_.line]:before:text-right [&_.line]:before:w-4 [&_.line]:before:inline-block [&>pre]:counter-reset-[line]" : ""}
        `}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
