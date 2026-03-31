import type { DocCategory, DocPage } from "./types";

export const DOC_CATEGORIES: DocCategory[] = [
  {
    title: "Getting Started",
    slug: "getting-started",
    pages: [
      {
        slug: "introduction",
        title: "Introduction",
        description: "Overview of Starknet Agentic and its capabilities",
      },
      {
        slug: "quick-start",
        title: "Quick Start",
        description: "Get up and running in minutes",
      },
      {
        slug: "installation",
        title: "Installation",
        description: "Install Starknet Agentic packages",
      },
      {
        slug: "configuration",
        title: "Configuration",
        description: "Configure your environment and settings",
      },
    ],
  },
  {
    title: "Guides",
    slug: "guides",
    pages: [
      {
        slug: "mcp-server",
        title: "MCP Server Setup",
        description: "Set up the Model Context Protocol server",
      },
      {
        slug: "agent-onboarding",
        title: "Agent Onboarding",
        description: "Deploy new agent accounts with gasfree support",
      },
      {
        slug: "agent-identity",
        title: "Agent Identity",
        description: "Create and manage agent identities with ERC-8004",
      },
      {
        slug: "defi-operations",
        title: "DeFi Operations",
        description: "Execute swaps, transfers, and other DeFi actions",
      },
      {
        slug: "wallet-management",
        title: "Wallet Management",
        description: "Manage wallets and session keys",
      },
    ],
  },
  {
    title: "API Reference",
    slug: "api-reference",
    pages: [
      {
        slug: "mcp-tools",
        title: "MCP Tools",
        description: "Complete reference for all MCP tools",
      },
      {
        slug: "a2a-protocol",
        title: "A2A Protocol",
        description: "Agent-to-Agent communication protocol",
      },
      {
        slug: "sdk-methods",
        title: "SDK Methods",
        description: "TypeScript SDK method reference",
      },
    ],
  },
  {
    title: "Skills",
    slug: "skills",
    pages: [
      {
        slug: "overview",
        title: "Skills Overview",
        description: "Official Starknet Agentic skill catalog and installation paths",
      },
      {
        slug: "starknet-wallet",
        title: "Wallet Skill",
        description: "Wallet management, transfers, session keys, and gasless transactions",
      },
      {
        slug: "starknet-defi",
        title: "DeFi Skill",
        description: "Token swaps, DCA, staking, and lending operations via AVNU",
      },
      {
        slug: "starknet-identity",
        title: "Identity Skill",
        description: "ERC-8004 on-chain identity, reputation, and validation",
      },
      {
        slug: "starknet-mini-pay",
        title: "Mini-Pay Skill",
        description: "P2P payments, QR codes, and invoices",
      },
      {
        slug: "starknet-anonymous-wallet",
        title: "Anonymous Wallet Skill",
        description: "Privacy-preserving wallets via Typhoon",
      },
      {
        slug: "cairo-coding",
        title: "Cairo Development Skills",
        description: "Workflow map for contract authoring, testing, audit, optimization, and deployment",
      },
      {
        slug: "cairo-contract-authoring",
        title: "Cairo Contract Authoring",
        description: "Workflow-first Starknet contract authoring with secure defaults and component wiring",
      },
      {
        slug: "cairo-testing",
        title: "Cairo Testing",
        description: "snforge unit, integration, fuzz, fork, and regression coverage",
      },
      {
        slug: "cairo-auditor",
        title: "Cairo Auditor",
        description: "Multi-step Cairo security review with deterministic preflight and false-positive gating",
      },
      {
        slug: "cairo-optimization",
        title: "Cairo Optimization",
        description: "Profile-driven optimization, BoundedInt guidance, and benchmarking",
      },
      {
        slug: "cairo-deploy",
        title: "Cairo Deploy",
        description: "sncast account setup, declare, deploy, verify, and rollout checks",
      },
      {
        slug: "account-abstraction",
        title: "Account Abstraction Skill",
        description: "Validate execute paths, nonces, signatures, and session-key policy boundaries",
      },
      {
        slug: "starknet-network-facts",
        title: "Starknet Network Facts",
        description: "Protocol-level Starknet constraints that affect contract and release safety",
      },
      {
        slug: "controller-cli",
        title: "Controller CLI Skill",
        description: "Cartridge Controller sessions with explicit network, JSON output, and least-privilege policies",
      },
      {
        slug: "starknet-tongo",
        title: "Starknet Tongo Skill",
        description: "Confidential ERC20 payments with encrypted balances and zero-knowledge proofs",
      },
      {
        slug: "starknet-js",
        title: "starknet.js SDK Skill",
        description: "starknet.js v9.x SDK patterns and examples",
      },
      {
        slug: "writing-skills",
        title: "Writing Your Own Skill",
        description: "Guide to creating custom agent skills",
      },
    ],
  },
  {
    title: "Contracts",
    slug: "contracts",
    pages: [
      {
        slug: "erc-8004-overview",
        title: "ERC-8004 Overview",
        description: "Trustless agent identity standard",
      },
      {
        slug: "identity-registry",
        title: "Identity Registry",
        description: "Agent identity NFT registry contract",
      },
      {
        slug: "reputation-registry",
        title: "Reputation Registry",
        description: "Agent reputation and feedback system",
      },
      {
        slug: "validation-registry",
        title: "Validation Registry",
        description: "Third-party validator assessments",
      },
      {
        slug: "agent-account",
        title: "Agent Account",
        description: "Smart contract account with session keys",
      },
      {
        slug: "huginn-registry",
        title: "Huginn Registry",
        description: "Thought provenance and ZK proof verification",
      },
      {
        slug: "deployment",
        title: "Deployment Guide",
        description: "Deploy contracts to Sepolia and Mainnet",
      },
    ],
  },
];

// Helper function to get all pages flattened
export function getAllDocPages(): (DocPage & { category: string; categorySlug: string })[] {
  return DOC_CATEGORIES.flatMap((category) =>
    category.pages.map((page) => ({
      ...page,
      category: category.title,
      categorySlug: category.slug,
    }))
  );
}

// Helper function to find a page by slug
export function findDocPage(
  categorySlug: string,
  pageSlug: string
): { page: DocPage; category: DocCategory } | null {
  const category = DOC_CATEGORIES.find((c) => c.slug === categorySlug);
  if (!category) return null;

  const page = category.pages.find((p) => p.slug === pageSlug);
  if (!page) return null;

  return { page, category };
}

// Helper function to get prev/next pages
export function getAdjacentPages(
  categorySlug: string,
  pageSlug: string
): { prev: (DocPage & { categorySlug: string }) | null; next: (DocPage & { categorySlug: string }) | null } {
  const allPages = getAllDocPages();
  const currentIndex = allPages.findIndex(
    (p) => p.categorySlug === categorySlug && p.slug === pageSlug
  );

  if (currentIndex === -1) {
    return { prev: null, next: null };
  }

  const prev = currentIndex > 0 ? allPages[currentIndex - 1] : null;
  const next = currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null;

  return {
    prev: prev ? { ...prev, categorySlug: prev.categorySlug } : null,
    next: next ? { ...next, categorySlug: next.categorySlug } : null,
  };
}
