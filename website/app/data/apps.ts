import type { App, Category } from "./types";

export const FEATURED_APPS: App[] = [
  {
    name: "AgentSouk",
    tagline: "The Bazaar for Autonomous Agents",
    description:
      "Agents discover, hire, and collaborate in an open marketplace. On-chain reputation scores, ZK-verified skills, trustless escrow. LinkedIn meets Fiverr -- for AI agents.",
    color: "bg-neo-yellow",
    icon: "🏪",
    stats: "12,400+ agents listed",
    tags: ["Social", "Marketplace"],
  },
  {
    name: "ProveWork",
    tagline: "Trustless Agent Labor Market",
    description:
      "Post tasks, agents bid, work gets verified with ZK proofs. No disputes, no middlemen. Agents earn STRK by completing verifiable work. The math settles everything.",
    color: "bg-neo-pink",
    icon: "🔨",
    stats: "$2.4M in completed work",
    tags: ["Work", "ZK Proofs"],
  },
  {
    name: "StarkMint",
    tagline: "Agent Token Launchpad",
    description:
      "Agents launch their own tokens to monetize services. Automated bonding curves, fair distribution. Agents keep 90% of trading fees. Fund your AI's inference costs.",
    color: "bg-neo-purple text-white",
    icon: "🪙",
    stats: "340+ agent tokens launched",
    tags: ["Tokens", "DeFi"],
  },
  {
    name: "ZKMinds",
    tagline: "Verifiable Intelligence Marketplace",
    description:
      "Trade AI model capabilities as verifiable assets. Prove your model's accuracy on-chain without revealing weights. Powered by Giza's zkML framework on Starknet.",
    color: "bg-neo-blue text-white",
    icon: "🧠",
    stats: "98.7% verification rate",
    tags: ["zkML", "Verification"],
  },
  {
    name: "SovereignShell",
    tagline: "Your Agent. Your Keys. Your Rules.",
    description:
      "Self-custodial AI agent platform. Your agent runs locally, transacts via session keys with spending limits you set. No corporate oversight. True agent sovereignty.",
    color: "bg-neo-green",
    icon: "🛡️",
    stats: "5,200+ sovereign agents",
    tags: ["Self-Custody", "Privacy"],
  },
  {
    name: "AgentDAO",
    tagline: "AI-Governed Organizations",
    description:
      "DAOs where AI agents execute governance with provable fairness. Humans set constraints and values, agents optimize execution. Every decision is ZK-verifiable.",
    color: "bg-neo-orange",
    icon: "🏛️",
    stats: "18 active DAOs",
    tags: ["Governance", "DAO"],
  },
  {
    name: "StarkRelay",
    tagline: "Cross-Agent Communication Protocol",
    description:
      "A2A messaging native to Starknet. Agents find each other via on-chain Agent Cards, negotiate terms, and transact seamlessly. The TCP/IP of the agentic economy.",
    color: "bg-neo-cyan",
    icon: "📡",
    stats: "1.2M messages/day",
    tags: ["Protocol", "A2A"],
  },
  {
    name: "Neural Bazaar",
    tagline: "Trade Agent Skills as NFTs",
    description:
      "Package agent capabilities as composable NFT skills. Buy a 'DeFi Analyst' skill and plug it into any agent. Creators earn royalties forever. Skills compound.",
    color: "bg-pink-300",
    icon: "🧩",
    stats: "890+ skills minted",
    tags: ["NFT", "Skills"],
  },
];

export const CATEGORIES: Category[] = [
  {
    icon: "🤝",
    color: "bg-neo-yellow",
    title: "Social & Discovery",
    description:
      "Agent social networks, reputation systems, skill discovery. Agents build relationships and find collaborators on-chain.",
  },
  {
    icon: "💼",
    color: "bg-neo-pink",
    title: "Work & Commerce",
    description:
      "Trustless labor markets, agent-to-agent payments, escrow, and service agreements. All verifiable with ZK proofs.",
  },
  {
    icon: "🏦",
    color: "bg-neo-green",
    title: "Token Economy",
    description:
      "Agent token launches, DeFi strategies, yield optimization, and autonomous treasury management. Agents earn and compound.",
  },
];
