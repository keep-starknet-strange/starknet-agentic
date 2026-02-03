import { NAV_LINKS } from "@/data/navigation";
import { NavbarMobile } from "./NavbarMobile";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-cream/90 backdrop-blur-sm border-b-2 border-black">
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between relative">
        <a href="#" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center font-heading font-black text-sm group-hover:rotate-12 transition-transform">
            S
          </div>
          <span className="font-heading font-bold text-lg hidden sm:block">
            Starknet Agentic
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="font-heading font-medium hover:text-neo-purple transition-colors"
            >
              {link.label}
            </a>
          ))}
          <a href="#get-started" className="neo-btn-primary text-sm py-2 px-4">
            Get Started
          </a>
        </div>

        {/* Mobile toggle - client component */}
        <NavbarMobile />
      </div>
    </nav>
  );
}
