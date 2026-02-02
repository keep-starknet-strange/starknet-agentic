import { InstallCommand } from "./InstallCommand";

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 section-padding bg-grid">
      {/* Decorative shapes - with aria-hidden and motion-safe */}
      <div
        className="absolute top-24 right-12 w-20 h-20 bg-neo-yellow border-2 border-black shadow-neo rotate-12 motion-safe:animate-float hidden lg:block"
        aria-hidden="true"
      />
      <div
        className="absolute top-48 left-8 w-14 h-14 bg-neo-pink border-2 border-black shadow-neo -rotate-6 motion-safe:animate-float [animation-delay:2s] hidden lg:block"
        aria-hidden="true"
      />
      <div
        className="absolute bottom-24 right-1/4 w-16 h-16 bg-neo-purple border-2 border-black shadow-neo rotate-45 motion-safe:animate-float [animation-delay:4s] hidden lg:block"
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto relative">
        <div className="inline-block mb-6">
          <span className="neo-badge bg-neo-yellow">Now Building in Public</span>
        </div>

        <h1 className="font-heading font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] mb-6 text-balance">
          The Sovereign
          <br />
          <span className="relative inline-block">
            <span className="relative z-10">Agentic Era</span>
            <span
              className="absolute bottom-1 left-0 right-0 h-4 md:h-6 bg-neo-yellow -z-0 -rotate-1"
              aria-hidden="true"
            />
          </span>
          <br />
          on Starknet
        </h1>

        <p className="font-body text-lg md:text-xl max-w-2xl mb-10 text-neo-dark/80 leading-relaxed">
          Build AI agents that own wallets, earn reputation, and transact
          trustlessly. Powered by ZK-STARKs, native account abstraction, and
          verifiable computation. Your agents, your keys, your rules.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-12">
          <a href="#get-started" className="neo-btn-primary text-lg py-4 px-8">
            Start Building
            <span className="ml-2" aria-hidden="true">
              →
            </span>
          </a>
          <a href="#apps" className="neo-btn-secondary text-lg py-4 px-8">
            Explore Apps
          </a>
        </div>

        <div className="max-w-xl">
          <InstallCommand />
        </div>
      </div>
    </section>
  );
}
