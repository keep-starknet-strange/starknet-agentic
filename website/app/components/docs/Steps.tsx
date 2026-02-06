import type { ReactNode } from "react";

interface StepProps {
  number: number;
  title: string;
  children: ReactNode;
}

export function Step({ number, title, children }: StepProps) {
  return (
    <div className="relative pl-12 pb-8 last:pb-0">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-neo-dark/10 last:hidden" />

      {/* Step number */}
      <div className="absolute left-0 w-8 h-8 rounded-full bg-neo-purple text-white font-heading font-bold flex items-center justify-center text-sm border-2 border-neo-purple shadow-neo-sm">
        {number}
      </div>

      {/* Content */}
      <div>
        <h3 className="font-heading font-bold text-lg text-neo-dark mb-2" id={`step-${number}`}>
          {title}
        </h3>
        <div className="text-neo-dark/80 [&>p:first-child]:mt-0">
          {children}
        </div>
      </div>
    </div>
  );
}

interface StepsProps {
  children: ReactNode;
}

export function Steps({ children }: StepsProps) {
  return (
    <div className="my-6">
      {children}
    </div>
  );
}
