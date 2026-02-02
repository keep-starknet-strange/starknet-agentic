"use client";

import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { INSTALL_COMMAND } from "@/data/get-started";

interface InstallCommandProps {
  command?: string;
  variant?: "default" | "large";
}

export function InstallCommand({
  command = INSTALL_COMMAND,
  variant = "default",
}: InstallCommandProps) {
  const { copied, copy } = useCopyToClipboard();

  const handleClick = () => copy(command);

  const isLarge = variant === "large";

  return (
    <button
      onClick={handleClick}
      aria-label={copied ? "Copied to clipboard" : `Copy command: ${command}`}
      className={`w-full flex items-center gap-3 bg-neo-dark text-white
        ${isLarge ? "border-4 px-6 py-5 shadow-neo-xl" : "border-2 px-5 py-4 shadow-neo-lg"}
        border-black font-mono ${isLarge ? "text-base md:text-lg" : "text-sm md:text-base"}
        hover:shadow-neo hover:translate-x-[2px] hover:translate-y-[2px]
        transition-all duration-100 text-left group`}
    >
      <span className="text-neo-green shrink-0" aria-hidden="true">
        $
      </span>
      <span className="flex-1 truncate">{command}</span>
      <span
        className={`shrink-0 text-white/60 group-hover:text-white transition-colors
          ${isLarge ? "text-sm px-3 py-1" : "text-xs px-2 py-1"} border border-white/20 rounded`}
      >
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}
