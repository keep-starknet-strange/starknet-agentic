import type { ReactNode } from "react";

type CalloutType = "info" | "warning" | "success" | "error" | "tip";

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

const CALLOUT_STYLES: Record<CalloutType, { bg: string; border: string; icon: ReactNode }> = {
  info: {
    bg: "bg-neo-blue/10",
    border: "border-neo-blue",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    bg: "bg-neo-yellow/20",
    border: "border-neo-yellow",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  success: {
    bg: "bg-neo-green/10",
    border: "border-neo-green",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  error: {
    bg: "bg-red-500/10",
    border: "border-red-500",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  tip: {
    bg: "bg-neo-purple/10",
    border: "border-neo-purple",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
};

export function Callout({ type = "info", title, children }: CalloutProps) {
  const styles = CALLOUT_STYLES[type];

  return (
    <div className={`my-6 rounded-lg border-2 ${styles.bg} ${styles.border} not-prose`}>
      <div className="flex items-center gap-3 p-4">
        <div className={`shrink-0 self-center ${type === "warning" ? "text-neo-yellow" : type === "success" ? "text-neo-green" : type === "error" ? "text-red-500" : type === "tip" ? "text-neo-purple" : "text-neo-blue"}`}>
          {styles.icon}
        </div>
        <div className="flex-1 min-w-0">
          {title && (
            <p className="font-heading font-bold text-neo-dark m-0 leading-tight">{title}</p>
          )}
          <div className="text-neo-dark/80 text-sm [&>*]:m-0 [&>*]:mt-1 [&>*:first-child]:mt-0 [&_a]:underline [&_a]:text-inherit">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
