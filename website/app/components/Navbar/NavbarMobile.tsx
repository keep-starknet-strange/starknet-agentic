"use client";

import { useState } from "react";
<<<<<<< HEAD
import { NAV_LINKS } from "@/data/navigation";

=======
import Link from "next/link";
import { NAV_LINKS } from "@/data/navigation";

function MobileNavLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick: () => void;
}) {
  const isInternal = href.startsWith("/");

  if (isInternal) {
    return (
      <Link
        href={href}
        onClick={onClick}
        className="font-heading font-medium py-2"
      >
        {label}
      </Link>
    );
  }

  return (
    <a href={href} onClick={onClick} className="font-heading font-medium py-2">
      {label}
    </a>
  );
}

>>>>>>> origin/main
export function NavbarMobile() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden neo-btn-secondary py-2 px-3"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav"
      >
        <span className="text-lg" aria-hidden="true">
          {mobileOpen ? "✕" : "☰"}
        </span>
      </button>

      {mobileOpen && (
        <div
          id="mobile-nav"
          className="absolute top-full left-0 right-0 md:hidden border-t-2 border-black bg-cream px-6 py-4 flex flex-col gap-3"
        >
          {NAV_LINKS.map((link) => (
<<<<<<< HEAD
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="font-heading font-medium py-2"
            >
              {link.label}
            </a>
=======
            <MobileNavLink
              key={link.href}
              href={link.href}
              label={link.label}
              onClick={() => setMobileOpen(false)}
            />
>>>>>>> origin/main
          ))}
          <a
            href="#get-started"
            onClick={() => setMobileOpen(false)}
            className="neo-btn-primary text-sm py-2 px-4 text-center"
          >
            Get Started
          </a>
        </div>
      )}
    </>
  );
}
