import { STEPS, EXTERNAL_LINKS } from "@/data/get-started";
import { InstallCommand } from "@/components/Hero/InstallCommand";
import { StepCard } from "@/components/ui/StepCard";

export function GetStarted() {
  return (
    <section id="get-started" className="section-padding bg-neo-yellow bg-dots">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-7xl mb-6">
          Build the Future.
          <br />
          One Agent at a Time.
        </h2>
        <p className="font-body text-lg md:text-xl text-neo-dark/70 max-w-2xl mx-auto mb-10">
          Get started with a single command. Create an AI agent with a Starknet
          wallet, on-chain identity, and DeFi superpowers in minutes.
        </p>

        {/* Install command */}
        <div className="max-w-xl mx-auto mb-10">
          <InstallCommand variant="large" />
        </div>

        {/* Three steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {STEPS.map((item) => (
            <StepCard key={item.step} item={item} />
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={EXTERNAL_LINKS.github}
            target="_blank"
            rel="noopener noreferrer"
            className="neo-btn-dark text-lg py-4 px-8"
          >
            GitHub Repository
            <span className="sr-only"> (opens in new tab)</span>
          </a>
          <a
            href={EXTERNAL_LINKS.specification}
            target="_blank"
            rel="noopener noreferrer"
            className="neo-btn-secondary text-lg py-4 px-8"
          >
            Read the Spec
            <span className="sr-only"> (opens in new tab)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
