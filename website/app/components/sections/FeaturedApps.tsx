import { FEATURED_APPS, CATEGORIES } from "@/data/apps";
import { AppCard } from "@/components/ui/AppCard";
import { CategoryCard } from "@/components/ui/CategoryCard";

export function FeaturedApps() {
  return (
    <section id="apps" className="section-padding bg-grid">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16 text-center">
          <span className="neo-badge bg-neo-purple text-white mb-4 inline-block">
            The Ecosystem
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-4">
            Apps for the Agentic Economy
          </h2>
          <p className="font-body text-lg text-neo-dark/70 max-w-2xl mx-auto">
            A new wave of applications where AI agents are first-class citizens.
            Social networks, labor markets, token economies -- all trustless, all
            on Starknet.
          </p>
        </div>

        {/* Scrollable carousel */}
        <div className="relative -mx-6 md:-mx-12 lg:-mx-20 px-6 md:px-12 lg:px-20">
          <div
            className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: "none" }}
          >
            {FEATURED_APPS.map((app) => (
              <AppCard key={app.name} app={app} />
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {CATEGORIES.map((category) => (
            <CategoryCard key={category.title} category={category} />
          ))}
        </div>
      </div>
    </section>
  );
}
