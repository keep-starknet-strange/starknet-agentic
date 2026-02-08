import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
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
    },
  },
  plugins: [],
};
export default config;
