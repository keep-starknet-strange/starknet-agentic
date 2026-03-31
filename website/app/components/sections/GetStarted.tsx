import Link from "next/link";
import { STEPS, EXTERNAL_LINKS } from "@/data/get-started";
import { InstallCommand } from "@/components/Hero/InstallCommand";
import { StepCard } from "@/components/ui/StepCard";

const CODEX_CAIRO_AUDITOR_COMMAND = [
  'CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"',
  'python3 "$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py" \\',
  "  --repo keep-starknet-strange/starknet-agentic \\",
  "  --path skills/cairo-auditor \\",
  "  --ref main",
].join("\n");

const CLAUDE_CAIRO_AUDITOR_COMMAND = [
  "/plugin marketplace add keep-starknet-strange/starknet-agentic",
  "/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user",
  "/reload-plugins",
  "/starknet-agentic-skills:cairo-auditor deep skills/cairo-auditor/tests/fixtures/insecure_upgrade_controller/src/lib.cairo --file-output",
].join("\n");

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

        <div className="neo-card p-6 md:p-8 mb-12 bg-white text-left">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
            <div>
              <h3 className="font-heading font-bold text-2xl text-neo-dark mb-2">
                Try Cairo Auditor First
              </h3>
              <p className="text-neo-dark/70 max-w-2xl">
                Fastest path to a concrete artifact: run the deterministic vulnerable fixture and generate a real{" "}
                <code className="px-1.5 py-0.5 bg-neo-dark/5 rounded text-sm">security-review-*.md</code> report before
                you wire the rest of the stack.
              </p>
            </div>
            <Link
              href="/docs/skills/cairo-auditor"
              className="neo-btn-secondary text-sm py-2 px-4 whitespace-nowrap"
            >
              Open 30-second guide
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-2 border-neo-dark/10 rounded p-4">
              <p className="text-sm font-heading font-bold text-neo-dark mb-2">Codex</p>
              <code className="block whitespace-pre-wrap break-all text-xs md:text-sm bg-neo-dark text-white rounded px-3 py-3">
                {CODEX_CAIRO_AUDITOR_COMMAND}
              </code>
            </div>
            <div className="border-2 border-neo-dark/10 rounded p-4">
              <p className="text-sm font-heading font-bold text-neo-dark mb-2">Claude Code</p>
              <code className="block whitespace-pre-wrap break-all text-xs md:text-sm bg-neo-dark text-white rounded px-3 py-3">
                {CLAUDE_CAIRO_AUDITOR_COMMAND}
              </code>
            </div>
          </div>

          <p className="mt-4 text-sm text-neo-dark/70">
            The demo fixture path in the command above assumes you are inside a local clone of this repository. If not, clone the repo first or replace the path with your own local Cairo contract.
          </p>
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
          <Link
            href="/docs"
            className="neo-btn-secondary text-lg py-4 px-8"
          >
            Read the Docs
          </Link>
        </div>
      </div>
    </section>
  );
}
