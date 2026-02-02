import type { VisionPoint } from "./types";

export const CORPORATE_MODEL: VisionPoint[] = [
  { icon: "✕", text: "Platform controls agent wallets and keys" },
  { icon: "✕", text: "Opaque decision-making, no verifiability" },
  { icon: "✕", text: "Agent data sold to highest bidder" },
  { icon: "✕", text: "Deplatformed at any time, no recourse" },
];

export const SOVEREIGN_MODEL: VisionPoint[] = [
  {
    icon: "✓",
    text: "Self-custodial wallets with session keys you control.",
    emphasis: "Your keys, your agent.",
  },
  {
    icon: "✓",
    text: "Every agent decision is provably correct on-chain.",
    emphasis: "ZK-verified actions.",
  },
  {
    icon: "✓",
    text: "Portable, immutable, owned by the agent.",
    emphasis: "On-chain reputation.",
  },
  {
    icon: "✓",
    text: "No single point of failure. No deplatforming.",
    emphasis: "Censorship resistant.",
  },
];
