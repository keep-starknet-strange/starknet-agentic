// Loaded from app/globals.css via `@config`. Theme tokens live in the CSS
// `@theme` block; only the @tailwindcss/typography customisation stays here,
// because the plugin's raw CSS can only be configured through this JS API in
// Tailwind v4.
//
// The neo docs theme is merged into the DEFAULT modifier so it is emitted as
// part of `.prose`. As a separate `prose-neo` modifier, Tailwind v4's
// property-based utility sorting placed it before `.prose`, which then
// overrode it. With these overrides (the `margin` shorthand on `pre`), `.prose`
// sorts before the m-*/my-* utilities, so utilities on MDX elements still win
// as they did in v3.

const fontHeading = "var(--font-space-grotesk), system-ui, sans-serif";

/** @type {import('tailwindcss').Config} */
const config = {
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            color: "rgb(26 26 46 / 0.8)",
            "--tw-prose-body": "#1a1a2e",
            "--tw-prose-headings": "#1a1a2e",
            "--tw-prose-links": "#A855F7",
            "--tw-prose-bold": "#1a1a2e",
            "--tw-prose-code": "#1a1a2e",
            "--tw-prose-pre-bg": "#0d1117",
            "--tw-prose-pre-code": "#e6edf3",
            h1: {
              fontFamily: fontHeading,
              fontWeight: "700",
              marginBottom: "1rem",
            },
            h2: {
              fontFamily: fontHeading,
              fontWeight: "700",
              marginTop: "2rem",
              marginBottom: "1rem",
              scrollMarginTop: "5rem",
            },
            h3: {
              fontFamily: fontHeading,
              fontWeight: "600",
              marginTop: "1.5rem",
              marginBottom: "0.75rem",
              scrollMarginTop: "5rem",
            },
            h4: {
              fontFamily: fontHeading,
              fontWeight: "600",
              marginTop: "1.25rem",
              marginBottom: "0.5rem",
            },
            p: {
              marginTop: "1rem",
              marginBottom: "1rem",
            },
            a: {
              color: "#A855F7",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              "&:hover": {
                color: "#9333EA",
              },
            },
            strong: {
              fontWeight: "600",
            },
            code: {
              backgroundColor: "rgba(26, 26, 46, 0.1)",
              padding: "0.125rem 0.375rem",
              borderRadius: "0.25rem",
              fontSize: "0.875em",
              fontFamily: "var(--font-jetbrains-mono), monospace",
            },
            "code::before": {
              content: '""',
            },
            "code::after": {
              content: '""',
            },
            pre: {
              backgroundColor: "#0d1117",
              borderRadius: "0.5rem",
              padding: "0",
              margin: "1rem 0",
            },
            "pre code": {
              backgroundColor: "transparent",
              padding: "0",
              fontSize: "0.875rem",
            },
          },
        },
      },
    },
  },
};

export default config;
