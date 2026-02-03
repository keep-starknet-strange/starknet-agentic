import {
  INFRASTRUCTURE_LINKS,
  ECOSYSTEM_LINKS,
  COMMUNITY_LINKS,
} from "@/data/footer";
import type { FooterLink } from "@/data/types";

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (link.url) {
    return (
      <li>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-body text-sm text-white/60 hover:text-neo-yellow transition-colors"
        >
          {link.name} ↗<span className="sr-only"> (opens in new tab)</span>
        </a>
      </li>
    );
  }

  return (
    <li>
      <a
        href="#"
        className="font-body text-sm text-white/60 hover:text-neo-yellow transition-colors"
      >
        {link.name}
      </a>
    </li>
  );
}

function FooterSection({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  return (
    <div>
      <h4 className="font-heading font-bold text-sm uppercase tracking-wider text-white/40 mb-4">
        {title}
      </h4>
      <ul className="space-y-2">
        {links.map((link) => (
          <FooterLinkItem key={link.name} link={link} />
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="bg-neo-dark text-white border-t-2 border-black">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center font-heading font-black text-sm text-neo-dark">
                S
              </div>
              <span className="font-heading font-bold text-lg">
                Starknet Agentic
              </span>
            </div>
            <p className="font-body text-sm text-white/50 leading-relaxed">
              The infrastructure layer for the sovereign agentic era on Starknet.
              Open source. Community driven.
            </p>
          </div>

          {/* Infrastructure */}
          <FooterSection title="Infrastructure" links={INFRASTRUCTURE_LINKS} />

          {/* Ecosystem */}
          <FooterSection title="Ecosystem" links={ECOSYSTEM_LINKS} />

          {/* Community */}
          <FooterSection title="Community" links={COMMUNITY_LINKS} />
        </div>

        {/* Bottom bar */}
        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-body text-sm text-white/40">
            Built by{" "}
            <a
              href="https://github.com/keep-starknet-strange"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/60 hover:text-neo-yellow transition-colors"
            >
              Keep Starknet Strange
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          </p>
          <p className="font-body text-sm text-white/40">
            Open source under MIT License
          </p>
        </div>
      </div>
    </footer>
  );
}
