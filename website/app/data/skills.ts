import type { Skill } from "./types";

export const SKILLS: Skill[] = [
  {
    slug: "starknet-wallet",
    name: "starknet-wallet",
    title: "Wallet",
    description:
      "Manage Starknet wallets with Account Abstraction. Transfer tokens, check balances, multi-call transactions, and gasless operations.",
    keywords: [
      "wallet",
      "transfer",
      "balance",
      "session-keys",
      "account-abstraction",
      "paymaster",
      "gasless",
    ],
    icon: "💳",
    color: "bg-neo-purple",
    features: [
      "Balance checks",
      "Token transfers",
      "Multi-call batching",
      "Gasless transactions",
      "Session keys",
    ],
  },
  {
    slug: "starknet-defi",
    name: "starknet-defi",
    title: "DeFi",
    description:
      "Execute DeFi operations via AVNU aggregator. Token swaps with best-price routing, DCA orders, STRK staking, and lending.",
    keywords: [
      "defi",
      "swap",
      "dca",
      "staking",
      "lending",
      "avnu",
      "ekubo",
      "yield",
    ],
    icon: "📈",
    color: "bg-neo-green",
    features: [
      "Token swaps",
      "DCA orders",
      "STRK staking",
      "Yield farming",
      "Price queries",
    ],
  },
  {
    slug: "starknet-identity",
    name: "starknet-identity",
    title: "Identity",
    description:
      "Register AI agents on-chain using ERC-8004 Trustless Agents standard. Build reputation through feedback and validation.",
    keywords: [
      "identity",
      "erc-8004",
      "reputation",
      "validation",
      "nft",
      "on-chain-identity",
    ],
    icon: "🪪",
    color: "bg-neo-blue",
    features: [
      "Agent registration",
      "ERC-721 identity NFTs",
      "Reputation system",
      "Validation registry",
      "A2A integration",
    ],
  },
  {
    slug: "starknet-mini-pay",
    name: "starknet-mini-pay",
    title: "Mini-Pay",
    description:
      "Simple P2P payments on Starknet. Generate QR codes, create payment links, manage invoices. Like Lightning, but native.",
    keywords: [
      "payments",
      "qr-code",
      "payment-links",
      "p2p",
      "invoice",
      "transfer",
    ],
    icon: "⚡",
    color: "bg-neo-yellow",
    features: [
      "QR code generation",
      "Payment links",
      "Invoice system",
      "Telegram bot",
      "Transaction history",
    ],
  },
  {
    slug: "starknet-anonymous-wallet",
    name: "starknet-anonymous-wallet",
    title: "Anonymous Wallet",
    description:
      "Create privacy-preserving Starknet wallets via Typhoon. Break the on-chain link between deposits and agent operations.",
    keywords: [
      "anonymous",
      "privacy",
      "typhoon",
      "wallet",
      "preflight",
    ],
    icon: "🔒",
    color: "bg-neo-pink",
    features: [
      "Anonymous accounts",
      "Typhoon integration",
      "ABI discovery",
      "Preflight simulation",
      "TypedData signing",
    ],
  },
];

// Get all unique keywords from all skills
export function getAllKeywords(): string[] {
  const keywordSet = new Set<string>();
  SKILLS.forEach((skill) => {
    skill.keywords.forEach((kw) => keywordSet.add(kw));
  });
  return Array.from(keywordSet).sort();
}

// Filter skills by keyword search
export function filterSkills(query: string): Skill[] {
  if (!query.trim()) return SKILLS;

  const lowerQuery = query.toLowerCase();
  return SKILLS.filter((skill) => {
    const nameMatch = skill.name.toLowerCase().includes(lowerQuery);
    const titleMatch = skill.title.toLowerCase().includes(lowerQuery);
    const descMatch = skill.description.toLowerCase().includes(lowerQuery);
    const keywordMatch = skill.keywords.some((kw) =>
      kw.toLowerCase().includes(lowerQuery)
    );
    return nameMatch || titleMatch || descMatch || keywordMatch;
  });
}

// Get skill by slug
export function getSkillBySlug(slug: string): Skill | undefined {
  return SKILLS.find((skill) => skill.slug === slug);
}
