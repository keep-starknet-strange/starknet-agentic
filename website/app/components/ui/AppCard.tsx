import type { App } from "@/data/types";

interface AppCardProps {
  app: App;
}

export function AppCard({ app }: AppCardProps) {
  return (
    <article className="neo-card-hover min-w-[340px] md:min-w-[380px] snap-start flex flex-col">
      <div className={`${app.color} p-6 border-b-2 border-black`}>
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-4xl"
            role="img"
            aria-label={`${app.name} icon`}
          >
            {app.icon}
          </span>
          <div className="flex gap-2">
            {app.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-heading font-bold bg-white/80 text-neo-dark border border-black px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <h3 className="font-heading font-black text-2xl">{app.name}</h3>
        <p className="font-heading font-medium text-sm mt-1 opacity-80">
          {app.tagline}
        </p>
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <p className="font-body text-sm text-neo-dark/70 leading-relaxed flex-1">
          {app.description}
        </p>
        <div className="mt-4 pt-4 border-t border-black/10 flex items-center justify-between">
          <span className="font-mono text-xs text-neo-dark/50">{app.stats}</span>
          <span className="neo-badge bg-cream text-xs">Coming Soon</span>
        </div>
      </div>
    </article>
  );
}
