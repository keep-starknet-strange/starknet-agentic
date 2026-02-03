import { WHY_STARKNET, STATS } from "@/data/why-starknet";
import { WhyCard } from "@/components/ui/WhyCard";
import { StatCard } from "@/components/ui/StatCard";

export function WhyStarknet() {
  return (
    <section id="why" className="section-padding bg-dots">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <span className="neo-badge bg-neo-blue text-white mb-4 inline-block">
            The Foundation
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-4">
            Why Starknet is Built
            <br />
            for the Agentic Era
          </h2>
          <p className="font-body text-lg text-neo-dark/70 max-w-2xl">
            AI agents need a blockchain that can keep up. Starknet&apos;s
            architecture was designed for exactly this moment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {WHY_STARKNET.map((item) => (
            <WhyCard key={item.title} item={item} />
          ))}
        </div>

        {/* Stats bar */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {STATS.map((stat) => (
            <StatCard key={stat.label} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}
