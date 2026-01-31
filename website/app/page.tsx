"use client";

import { useState } from "react";

/* ─────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────── */

const FEATURED_APPS: App[] = [
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

const WHY_STARKNET = [
  {
    title: "Massive On-Chain Computation",
    description:
      "Agents need compute. Starknet's validity proofs let you run complex logic on-chain at a fraction of L1 costs. Session key validation, multi-step DeFi strategies, reputation scoring -- all verifiable.",
    icon: "⚡",
    color: "bg-neo-yellow",
  },
  {
    title: "ZK-STARKs for Verifiable AI",
    description:
      "No trusted setup. Transparent, post-quantum secure proofs. Agents can prove their computations are correct without revealing sensitive data. The foundation of trustless AI.",
    icon: "🔐",
    color: "bg-neo-purple text-white",
  },
  {
    title: "Native Account Abstraction",
    description:
      "Every account is a smart contract. Session keys, spending limits, automated policies -- built in, not bolted on. Agents get programmable wallets by default.",
    icon: "🔑",
    color: "bg-neo-green",
  },
  {
    title: "Sub-Cent Transactions",
    description:
      "Agents transact thousands of times per day. At $0.001 per transaction with 2-second finality, Starknet makes micro-economies between agents economically viable.",
    icon: "💨",
    color: "bg-neo-pink",
  },
];

const ARCHITECTURE_LAYERS = [
  {
    label: "Agent Platforms",
    items: ["OpenClaw", "MoltBook", "Daydreams", "Custom Agents"],
    color: "bg-neo-purple text-white",
  },
  {
    label: "Integration Layer",
    items: ["MCP Server", "A2A Protocol", "Claude Skills"],
    color: "bg-neo-blue text-white",
  },
  {
    label: "Starknet Agentic SDK",
    items: ["Wallets", "DeFi", "Identity", "Payments"],
    color: "bg-neo-yellow",
  },
  {
    label: "Smart Contracts (Cairo)",
    items: ["Agent Account", "Agent Registry", "Reputation"],
    color: "bg-neo-green",
  },
  {
    label: "Starknet L2",
    items: ["ZK-STARKs", "Native AA", "Paymaster", "Provable Compute"],
    color: "bg-neo-dark text-white",
  },
];

/* ─────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────── */

interface App {
  name: string;
  tagline: string;
  description: string;
  color: string;
  icon: string;
  stats: string;
  tags: string[];
}

/* ─────────────────────────────────────────────
   PAGE
   ───────────────────────────────────────────── */

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />
      <MarqueeBanner />
      <WhyStarknet />
      <Vision />
      <FeaturedApps />
      <Architecture />
      <GetStarted />
      <Footer />
    </main>
  );
}

/* ─────────────────────────────────────────────
   NAVBAR
   ───────────────────────────────────────────── */

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-cream/90 backdrop-blur-sm border-b-2 border-black">
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
        <a href="#" className="flex items-center gap-2 group">
          <div className="w-8 h-8 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center font-heading font-black text-sm group-hover:rotate-12 transition-transform">
            S
          </div>
          <span className="font-heading font-bold text-lg hidden sm:block">
            Starknet Agentic
          </span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          <a
            href="#why"
            className="font-heading font-medium hover:text-neo-purple transition-colors"
          >
            Why Starknet
          </a>
          <a
            href="#vision"
            className="font-heading font-medium hover:text-neo-purple transition-colors"
          >
            Vision
          </a>
          <a
            href="#apps"
            className="font-heading font-medium hover:text-neo-purple transition-colors"
          >
            Apps
          </a>
          <a
            href="#architecture"
            className="font-heading font-medium hover:text-neo-purple transition-colors"
          >
            Architecture
          </a>
          <a href="#get-started" className="neo-btn-primary text-sm py-2 px-4">
            Get Started
          </a>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden neo-btn-secondary py-2 px-3"
          aria-label="Menu"
        >
          <span className="text-lg">{mobileOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t-2 border-black bg-cream px-6 py-4 flex flex-col gap-3">
          <a
            href="#why"
            onClick={() => setMobileOpen(false)}
            className="font-heading font-medium py-2"
          >
            Why Starknet
          </a>
          <a
            href="#vision"
            onClick={() => setMobileOpen(false)}
            className="font-heading font-medium py-2"
          >
            Vision
          </a>
          <a
            href="#apps"
            onClick={() => setMobileOpen(false)}
            className="font-heading font-medium py-2"
          >
            Apps
          </a>
          <a
            href="#architecture"
            onClick={() => setMobileOpen(false)}
            className="font-heading font-medium py-2"
          >
            Architecture
          </a>
          <a
            href="#get-started"
            onClick={() => setMobileOpen(false)}
            className="neo-btn-primary text-sm py-2 px-4 text-center"
          >
            Get Started
          </a>
        </div>
      )}
    </nav>
  );
}

/* ─────────────────────────────────────────────
   HERO
   ───────────────────────────────────────────── */

function Hero() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npx create-starknet-agent@latest");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-44 md:pb-32 section-padding bg-grid">
      {/* Decorative shapes */}
      <div className="absolute top-24 right-12 w-20 h-20 bg-neo-yellow border-2 border-black shadow-neo rotate-12 animate-float hidden lg:block" />
      <div className="absolute top-48 left-8 w-14 h-14 bg-neo-pink border-2 border-black shadow-neo -rotate-6 animate-float [animation-delay:2s] hidden lg:block" />
      <div className="absolute bottom-24 right-1/4 w-16 h-16 bg-neo-purple border-2 border-black shadow-neo rotate-45 animate-float [animation-delay:4s] hidden lg:block" />

      <div className="max-w-6xl mx-auto relative">
        <div className="inline-block mb-6">
          <span className="neo-badge bg-neo-yellow">
            Now Building in Public
          </span>
        </div>

        <h1 className="font-heading font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] mb-6 text-balance">
          The Sovereign
          <br />
          <span className="relative inline-block">
            <span className="relative z-10">Agentic Era</span>
            <span className="absolute bottom-1 left-0 right-0 h-4 md:h-6 bg-neo-yellow -z-0 -rotate-1" />
          </span>
          <br />
          on Starknet
        </h1>

        <p className="font-body text-lg md:text-xl max-w-2xl mb-10 text-neo-dark/80 leading-relaxed">
          Build AI agents that own wallets, earn reputation, and transact
          trustlessly. Powered by ZK-STARKs, native account abstraction, and
          verifiable computation. Your agents, your keys, your rules.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-12">
          <a href="#get-started" className="neo-btn-primary text-lg py-4 px-8">
            Start Building
            <span className="ml-2">→</span>
          </a>
          <a href="#apps" className="neo-btn-secondary text-lg py-4 px-8">
            Explore Apps
          </a>
        </div>

        {/* Install command */}
        <div className="max-w-xl">
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 bg-neo-dark text-white border-2 border-black
              px-5 py-4 font-mono text-sm md:text-base shadow-neo-lg
              hover:shadow-neo hover:translate-x-[2px] hover:translate-y-[2px]
              transition-all duration-100 text-left group"
          >
            <span className="text-neo-green shrink-0">$</span>
            <span className="flex-1 truncate">
              npx create-starknet-agent@latest
            </span>
            <span className="shrink-0 text-white/60 group-hover:text-white transition-colors text-xs border border-white/20 px-2 py-1 rounded">
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   MARQUEE BANNER
   ───────────────────────────────────────────── */

function MarqueeBanner() {
  const items = [
    "ZK-STARKs",
    "Native Account Abstraction",
    "Session Keys",
    "Verifiable AI",
    "On-Chain Identity",
    "Paymaster Support",
    "Sub-Cent Gas",
    "Agent Wallets",
    "Trustless Reputation",
    "MCP Protocol",
    "A2A Protocol",
    "ERC-8004",
    "zkML Ready",
    "Cairo Smart Contracts",
  ];

  return (
    <div className="border-y-2 border-black bg-neo-dark text-white py-4 overflow-hidden marquee-container">
      <div className="flex animate-marquee">
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            className="font-heading font-bold text-sm md:text-base whitespace-nowrap px-6 flex items-center gap-3"
          >
            <span className="w-2 h-2 bg-neo-yellow rotate-45 shrink-0" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   WHY STARKNET
   ───────────────────────────────────────────── */

function WhyStarknet() {
  return (
    <section id="why" className="section-padding bg-dots">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16">
          <span className="neo-badge bg-neo-blue text-white mb-4 inline-block">
            The Foundation
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-4">
            Why Starknet is Built
            <br />
            for the Agentic Era
          </h2>
          <p className="font-body text-lg text-neo-dark/70 max-w-2xl">
            AI agents need a blockchain that can keep up. Starknet&apos;s
            architecture was designed for exactly this moment.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {WHY_STARKNET.map((item) => (
            <div key={item.title} className="neo-card-hover p-8">
              <div
                className={`inline-flex items-center justify-center w-14 h-14 ${item.color} border-2 border-black shadow-neo-sm text-2xl mb-5`}
              >
                {item.icon}
              </div>
              <h3 className="font-heading font-bold text-xl md:text-2xl mb-3">
                {item.title}
              </h3>
              <p className="font-body text-neo-dark/70 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>

        {/* Stats bar */}
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { value: "< $0.001", label: "Avg. Transaction Cost" },
            { value: "2s", label: "Block Time" },
            { value: "992", label: "Peak TPS" },
            { value: "∞", label: "Provable Compute" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="neo-card p-5 text-center"
            >
              <div className="font-heading font-black text-2xl md:text-3xl text-neo-purple">
                {stat.value}
              </div>
              <div className="font-body text-sm text-neo-dark/60 mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   VISION
   ───────────────────────────────────────────── */

function Vision() {
  return (
    <section id="vision" className="section-padding bg-neo-dark text-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <div>
            <span className="neo-badge bg-neo-yellow text-neo-dark mb-6 inline-block">
              The Stakes
            </span>
            <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-8 leading-[1.05]">
              AI Will Either
              <br />
              <span className="text-neo-pink">Concentrate Power</span>
              <br />
              Or Set Us Free
            </h2>
            <div className="space-y-6 font-body text-white/80 text-lg leading-relaxed">
              <p>
                The agentic era is coming whether we&apos;re ready or not. AI
                agents will manage finances, negotiate deals, and run businesses.
                The question is: <strong className="text-white">who controls them?</strong>
              </p>
              <p>
                Corporate AI locks you in. Your agent&apos;s wallet is their
                wallet. Your agent&apos;s data is their data. Your agent&apos;s
                decisions serve their interests.
              </p>
              <p>
                <strong className="text-neo-yellow">
                  Sovereign agents change everything.
                </strong>{" "}
                When your agent&apos;s wallet is a smart contract you control,
                when its reputation lives on-chain, when its computations are
                ZK-verified -- you stay in control. Not a corporation. Not a
                platform. You.
              </p>
              <p>
                Starknet&apos;s ZK-STARKs make this possible. Verifiable
                computation means you can prove what your agent did without
                trusting anyone. That&apos;s not just privacy. That&apos;s{" "}
                <strong className="text-neo-green">sovereignty</strong>.
              </p>
            </div>
          </div>

          {/* Right: Visual comparison */}
          <div className="space-y-6">
            {/* Corporate model */}
            <div className="border-2 border-neo-pink/50 bg-neo-pink/10 p-8 relative">
              <div className="absolute -top-3 left-6">
                <span className="neo-badge bg-neo-pink text-white text-xs">
                  ✕ Centralized AI
                </span>
              </div>
              <ul className="space-y-4 mt-3 font-body text-white/70">
                <li className="flex items-start gap-3">
                  <span className="text-neo-pink mt-1">✕</span>
                  <span>Platform controls agent wallets and keys</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neo-pink mt-1">✕</span>
                  <span>Opaque decision-making, no verifiability</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neo-pink mt-1">✕</span>
                  <span>Agent data sold to highest bidder</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neo-pink mt-1">✕</span>
                  <span>Deplatformed at any time, no recourse</span>
                </li>
              </ul>
            </div>

            {/* Sovereign model */}
            <div className="border-2 border-neo-green bg-neo-green/10 p-8 relative">
              <div className="absolute -top-3 left-6">
                <span className="neo-badge bg-neo-green text-neo-dark text-xs">
                  ✓ Sovereign Agents on Starknet
                </span>
              </div>
              <ul className="space-y-4 mt-3 font-body text-white/90">
                <li className="flex items-start gap-3">
                  <span className="text-neo-green mt-1">✓</span>
                  <span>
                    <strong>Your keys, your agent.</strong> Self-custodial wallets
                    with session keys you control.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neo-green mt-1">✓</span>
                  <span>
                    <strong>ZK-verified actions.</strong> Every agent decision is
                    provably correct on-chain.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neo-green mt-1">✓</span>
                  <span>
                    <strong>On-chain reputation.</strong> Portable, immutable,
                    owned by the agent.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-neo-green mt-1">✓</span>
                  <span>
                    <strong>Censorship resistant.</strong> No single point of failure.
                    No deplatforming.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FEATURED APPS
   ───────────────────────────────────────────── */

function FeaturedApps() {
  return (
    <section id="apps" className="section-padding bg-grid">
      <div className="max-w-7xl mx-auto">
        <div className="mb-16 text-center">
          <span className="neo-badge bg-neo-purple text-white mb-4 inline-block">
            The Ecosystem
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-4">
            Apps for the Agentic Economy
          </h2>
          <p className="font-body text-lg text-neo-dark/70 max-w-2xl mx-auto">
            A new wave of applications where AI agents are first-class citizens.
            Social networks, labor markets, token economies -- all trustless, all
            on Starknet.
          </p>
        </div>

        {/* Scrollable carousel */}
        <div className="relative -mx-6 md:-mx-12 lg:-mx-20 px-6 md:px-12 lg:px-20">
          <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-hide"
               style={{ scrollbarWidth: "none" }}>
            {FEATURED_APPS.map((app) => (
              <AppCard key={app.name} app={app} />
            ))}
          </div>
        </div>

        {/* Categories */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="neo-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-neo-yellow border-2 border-black shadow-neo-sm flex items-center justify-center text-lg">
                🤝
              </div>
              <h3 className="font-heading font-bold text-lg">
                Social & Discovery
              </h3>
            </div>
            <p className="font-body text-sm text-neo-dark/70">
              Agent social networks, reputation systems, skill discovery. Agents
              build relationships and find collaborators on-chain.
            </p>
          </div>
          <div className="neo-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-neo-pink border-2 border-black shadow-neo-sm flex items-center justify-center text-lg">
                💼
              </div>
              <h3 className="font-heading font-bold text-lg">
                Work & Commerce
              </h3>
            </div>
            <p className="font-body text-sm text-neo-dark/70">
              Trustless labor markets, agent-to-agent payments, escrow, and
              service agreements. All verifiable with ZK proofs.
            </p>
          </div>
          <div className="neo-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-neo-green border-2 border-black shadow-neo-sm flex items-center justify-center text-lg">
                🏦
              </div>
              <h3 className="font-heading font-bold text-lg">
                Token Economy
              </h3>
            </div>
            <p className="font-body text-sm text-neo-dark/70">
              Agent token launches, DeFi strategies, yield optimization, and
              autonomous treasury management. Agents earn and compound.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function AppCard({ app }: { app: App }) {
  return (
    <div className="neo-card-hover min-w-[340px] md:min-w-[380px] snap-start flex flex-col">
      <div className={`${app.color} p-6 border-b-2 border-black`}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-4xl">{app.icon}</span>
          <div className="flex gap-2">
            {app.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-heading font-bold bg-white/80 text-neo-dark border border-black px-2 py-0.5"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
        <h3 className="font-heading font-black text-2xl">{app.name}</h3>
        <p className="font-heading font-medium text-sm mt-1 opacity-80">
          {app.tagline}
        </p>
      </div>
      <div className="p-6 flex-1 flex flex-col">
        <p className="font-body text-sm text-neo-dark/70 leading-relaxed flex-1">
          {app.description}
        </p>
        <div className="mt-4 pt-4 border-t border-black/10 flex items-center justify-between">
          <span className="font-mono text-xs text-neo-dark/50">
            {app.stats}
          </span>
          <span className="neo-badge bg-cream text-xs">Coming Soon</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   ARCHITECTURE
   ───────────────────────────────────────────── */

function Architecture() {
  return (
    <section id="architecture" className="section-padding bg-white border-y-2 border-black">
      <div className="max-w-5xl mx-auto">
        <div className="mb-16 text-center">
          <span className="neo-badge bg-neo-green mb-4 inline-block">
            The Stack
          </span>
          <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-4">
            Five Layers of
            <br />
            Agent Infrastructure
          </h2>
          <p className="font-body text-lg text-neo-dark/70 max-w-2xl mx-auto">
            From AI platforms down to provable compute. Each layer is
            composable, open, and standards-based.
          </p>
        </div>

        <div className="space-y-3">
          {ARCHITECTURE_LAYERS.map((layer, i) => (
            <div key={layer.label} className="relative">
              {/* Connector line */}
              {i > 0 && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-black" />
              )}
              <div
                className={`${layer.color} border-2 border-black shadow-neo p-5 md:p-6`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <h3 className="font-heading font-bold text-lg md:text-xl">
                    {layer.label}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {layer.items.map((item) => (
                      <span
                        key={item}
                        className="text-xs font-mono bg-white/20 border border-current/20 px-3 py-1"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Standards */}
        <div className="mt-16">
          <h3 className="font-heading font-bold text-2xl mb-6 text-center">
            Built on Open Standards
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                name: "MCP",
                full: "Model Context Protocol",
                desc: "Agent-to-tool connectivity. 13K+ servers. Works with Claude, ChatGPT, Cursor.",
                color: "border-neo-blue",
              },
              {
                name: "A2A",
                full: "Agent-to-Agent Protocol",
                desc: "Inter-agent communication. Agent Cards for discovery. Task management over transactions.",
                color: "border-neo-purple",
              },
              {
                name: "ERC-8004",
                full: "Trustless Agent Identity",
                desc: "On-chain identity, reputation, and validation. Agents as NFTs with verifiable track records.",
                color: "border-neo-green",
              },
            ].map((standard) => (
              <div
                key={standard.name}
                className={`neo-card border-t-4 ${standard.color} p-6`}
              >
                <div className="font-heading font-black text-2xl mb-1">
                  {standard.name}
                </div>
                <div className="font-body text-sm text-neo-dark/50 mb-3">
                  {standard.full}
                </div>
                <p className="font-body text-sm text-neo-dark/70">
                  {standard.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   GET STARTED
   ───────────────────────────────────────────── */

function GetStarted() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npx create-starknet-agent@latest");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="get-started" className="section-padding bg-neo-yellow bg-dots">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-7xl mb-6">
          Build the Future.
          <br />
          One Agent at a Time.
        </h2>
        <p className="font-body text-lg md:text-xl text-neo-dark/70 max-w-2xl mx-auto mb-10">
          Get started with a single command. Create an AI agent with a Starknet
          wallet, on-chain identity, and DeFi superpowers in minutes.
        </p>

        {/* Install command */}
        <div className="max-w-xl mx-auto mb-10">
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-3 bg-neo-dark text-white border-4 border-black
              px-6 py-5 font-mono text-base md:text-lg shadow-neo-xl
              hover:shadow-neo-lg hover:translate-x-[2px] hover:translate-y-[2px]
              transition-all duration-100 text-left group"
          >
            <span className="text-neo-green shrink-0">$</span>
            <span className="flex-1 truncate">
              npx create-starknet-agent@latest
            </span>
            <span className="shrink-0 text-white/60 group-hover:text-white transition-colors text-sm border border-white/20 px-3 py-1">
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
        </div>

        {/* Three steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[
            {
              step: "1",
              title: "Scaffold",
              desc: "Run the CLI to create your agent project with wallet, identity, and tools pre-configured.",
            },
            {
              step: "2",
              title: "Configure",
              desc: "Set your RPC endpoint, fund your agent wallet, and choose which DeFi protocols to enable.",
            },
            {
              step: "3",
              title: "Deploy",
              desc: "Your agent is live on Starknet. It can trade, earn, build reputation, and collaborate with other agents.",
            },
          ].map((item) => (
            <div key={item.step} className="neo-card p-6 bg-white text-left">
              <div className="w-10 h-10 bg-neo-dark text-white border-2 border-black shadow-neo-sm flex items-center justify-center font-heading font-black text-lg mb-4">
                {item.step}
              </div>
              <h3 className="font-heading font-bold text-lg mb-2">
                {item.title}
              </h3>
              <p className="font-body text-sm text-neo-dark/70">
                {item.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href="https://github.com/keep-starknet-strange/starknet-agentic"
            target="_blank"
            rel="noopener noreferrer"
            className="neo-btn-dark text-lg py-4 px-8"
          >
            GitHub Repository
          </a>
          <a
            href="https://github.com/keep-starknet-strange/starknet-agentic/blob/main/docs/SPECIFICATION.md"
            target="_blank"
            rel="noopener noreferrer"
            className="neo-btn-secondary text-lg py-4 px-8"
          >
            Read the Spec
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FOOTER
   ───────────────────────────────────────────── */

function Footer() {
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
              The infrastructure layer for the sovereign agentic era on
              Starknet. Open source. Community driven.
            </p>
          </div>

          {/* Infrastructure */}
          <div>
            <h4 className="font-heading font-bold text-sm uppercase tracking-wider text-white/40 mb-4">
              Infrastructure
            </h4>
            <ul className="space-y-2">
              {[
                "MCP Server",
                "A2A Adapter",
                "Agent Account",
                "Agent Registry",
                "Skills Marketplace",
              ].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className="font-body text-sm text-white/60 hover:text-neo-yellow transition-colors"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Ecosystem */}
          <div>
            <h4 className="font-heading font-bold text-sm uppercase tracking-wider text-white/40 mb-4">
              Ecosystem
            </h4>
            <ul className="space-y-2">
              {[
                { name: "Starknet", url: "https://starknet.io" },
                { name: "AVNU", url: "https://avnu.fi" },
                { name: "Cartridge", url: "https://cartridge.gg" },
                { name: "OpenClaw", url: "https://docs.openclaw.ai" },
                { name: "Giza", url: "https://gizatech.xyz" },
              ].map((item) => (
                <li key={item.name}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-sm text-white/60 hover:text-neo-yellow transition-colors"
                  >
                    {item.name} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="font-heading font-bold text-sm uppercase tracking-wider text-white/40 mb-4">
              Community
            </h4>
            <ul className="space-y-2">
              {[
                {
                  name: "GitHub",
                  url: "https://github.com/keep-starknet-strange/starknet-agentic",
                },
                {
                  name: "Specification",
                  url: "https://github.com/keep-starknet-strange/starknet-agentic/blob/main/docs/SPECIFICATION.md",
                },
                {
                  name: "Contributing",
                  url: "https://github.com/keep-starknet-strange/starknet-agentic",
                },
              ].map((item) => (
                <li key={item.name}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-body text-sm text-white/60 hover:text-neo-yellow transition-colors"
                  >
                    {item.name} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>
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
