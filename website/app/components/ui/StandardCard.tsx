import type { Standard } from "@/data/types";

interface StandardCardProps {
  standard: Standard;
}

export function StandardCard({ standard }: StandardCardProps) {
  return (
    <article className={`neo-card border-t-4 ${standard.color} p-6`}>
      <div className="font-heading font-black text-2xl mb-1">
        {standard.name}
      </div>
      <div className="font-body text-sm text-neo-dark/50 mb-3">
        {standard.full}
      </div>
      <p className="font-body text-sm text-neo-dark/70">{standard.desc}</p>
    </article>
  );
}
