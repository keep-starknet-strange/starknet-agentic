import type { Config } from "tailwindcss";
<<<<<<< HEAD

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
=======
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./content/**/*.{md,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
>>>>>>> origin/main
  theme: {
    extend: {
      colors: {
        cream: "#FFFBEB",
        "neo-yellow": "#FFD600",
        "neo-pink": "#FF6B6B",
        "neo-purple": "#A855F7",
        "neo-blue": "#3B82F6",
        "neo-green": "#34D399",
        "neo-orange": "#FF8C42",
        "neo-cyan": "#06B6D4",
        "neo-dark": "#1a1a2e",
      },
      fontFamily: {
        heading: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        body: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      boxShadow: {
        "neo-sm": "2px 2px 0px 0px #000000",
        neo: "4px 4px 0px 0px #000000",
        "neo-lg": "6px 6px 0px 0px #000000",
        "neo-xl": "8px 8px 0px 0px #000000",
      },
      animation: {
        "marquee": "marquee 30s linear infinite",
        "marquee-reverse": "marquee-reverse 30s linear infinite",
        "float": "float 6s ease-in-out infinite",
        "pulse-slow": "pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "marquee-reverse": {
          "0%": { transform: "translateX(-50%)" },
          "100%": { transform: "translateX(0%)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
      },
<<<<<<< HEAD
    },
  },
  plugins: [],
=======
      typography: {
        neo: {
          css: {
            "--tw-prose-body": "#1a1a2e",
            "--tw-prose-headings": "#1a1a2e",
            "--tw-prose-links": "#A855F7",
            "--tw-prose-bold": "#1a1a2e",
            "--tw-prose-code": "#1a1a2e",
            "--tw-prose-pre-bg": "#0d1117",
            "--tw-prose-pre-code": "#e6edf3",
            "h1": {
              fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
              fontWeight: "700",
              marginBottom: "1rem",
            },
            "h2": {
              fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
              fontWeight: "700",
              marginTop: "2rem",
              marginBottom: "1rem",
              scrollMarginTop: "5rem",
            },
            "h3": {
              fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
              fontWeight: "600",
              marginTop: "1.5rem",
              marginBottom: "0.75rem",
              scrollMarginTop: "5rem",
            },
            "h4": {
              fontFamily: "var(--font-space-grotesk), system-ui, sans-serif",
              fontWeight: "600",
              marginTop: "1.25rem",
              marginBottom: "0.5rem",
            },
            "p": {
              marginTop: "1rem",
              marginBottom: "1rem",
            },
            "a": {
              color: "#A855F7",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              "&:hover": {
                color: "#9333EA",
              },
            },
            "strong": {
              fontWeight: "600",
            },
            "code": {
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
            "pre": {
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
  plugins: [typography],
>>>>>>> origin/main
};
export default config;
