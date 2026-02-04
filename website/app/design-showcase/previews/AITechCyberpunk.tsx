export default function AITechCyberpunk() {
  return (
    <div className="relative h-full w-full bg-[#0d0d0d] overflow-hidden">
      {/* Deep gradient base layer */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(139,92,246,0.08) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(59,130,246,0.08) 0%, transparent 50%), linear-gradient(180deg, #0d0d0d 0%, #1a1a2e 50%, #0d0d0d 100%)",
        }}
      />

      {/* Neural network / circuit pattern background */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.15]"
        viewBox="0 0 400 400"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Neural connection lines */}
        <line x1="50" y1="80" x2="120" y2="150" stroke="url(#neuralGrad1)" strokeWidth="1" />
        <line x1="120" y1="150" x2="200" y2="120" stroke="url(#neuralGrad1)" strokeWidth="1" />
        <line x1="200" y1="120" x2="280" y2="180" stroke="url(#neuralGrad2)" strokeWidth="1" />
        <line x1="280" y1="180" x2="350" y2="140" stroke="url(#neuralGrad2)" strokeWidth="1" />
        <line x1="120" y1="150" x2="150" y2="250" stroke="url(#neuralGrad1)" strokeWidth="1" />
        <line x1="150" y1="250" x2="250" y2="280" stroke="url(#neuralGrad3)" strokeWidth="1" />
        <line x1="250" y1="280" x2="320" y2="240" stroke="url(#neuralGrad2)" strokeWidth="1" />
        <line x1="280" y1="180" x2="250" y2="280" stroke="url(#neuralGrad2)" strokeWidth="1" />
        <line x1="80" y1="320" x2="150" y2="250" stroke="url(#neuralGrad3)" strokeWidth="1" />
        <line x1="320" y1="240" x2="380" y2="300" stroke="url(#neuralGrad2)" strokeWidth="1" />
        <line x1="200" y1="120" x2="220" y2="50" stroke="url(#neuralGrad1)" strokeWidth="1" />
        <line x1="150" y1="250" x2="100" y2="350" stroke="url(#neuralGrad3)" strokeWidth="1" />

        {/* Neural nodes */}
        <circle cx="50" cy="80" r="4" fill="#8b5cf6" />
        <circle cx="120" cy="150" r="5" fill="#8b5cf6" />
        <circle cx="200" cy="120" r="4" fill="#3b82f6" />
        <circle cx="280" cy="180" r="5" fill="#3b82f6" />
        <circle cx="350" cy="140" r="4" fill="#06b6d4" />
        <circle cx="150" cy="250" r="5" fill="#8b5cf6" />
        <circle cx="250" cy="280" r="4" fill="#06b6d4" />
        <circle cx="320" cy="240" r="5" fill="#3b82f6" />
        <circle cx="80" cy="320" r="4" fill="#8b5cf6" />
        <circle cx="380" cy="300" r="4" fill="#06b6d4" />
        <circle cx="220" cy="50" r="4" fill="#3b82f6" />
        <circle cx="100" cy="350" r="4" fill="#06b6d4" />

        {/* Gradients */}
        <defs>
          <linearGradient id="neuralGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="neuralGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <linearGradient id="neuralGrad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>

      {/* Floating orb - top right with purple glow */}
      <div
        className="absolute top-8 right-12 w-20 h-20 rounded-full"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(139,92,246,0.4), rgba(139,92,246,0.1) 60%, transparent 100%)",
          boxShadow: "0 0 40px rgba(139,92,246,0.4), 0 0 80px rgba(139,92,246,0.2)",
        }}
      />

      {/* Floating orb - bottom left with blue/cyan glow */}
      <div
        className="absolute bottom-12 left-8 w-16 h-16 rounded-full"
        style={{
          background: "radial-gradient(circle at 30% 30%, rgba(6,182,212,0.4), rgba(59,130,246,0.1) 60%, transparent 100%)",
          boxShadow: "0 0 30px rgba(6,182,212,0.3), 0 0 60px rgba(59,130,246,0.2)",
        }}
      />

      {/* Small accent orbs */}
      <div
        className="absolute top-24 left-16 w-3 h-3 rounded-full bg-[#8b5cf6]"
        style={{ boxShadow: "0 0 12px #8b5cf6, 0 0 24px rgba(139,92,246,0.5)" }}
      />
      <div
        className="absolute bottom-28 right-20 w-2 h-2 rounded-full bg-[#06b6d4]"
        style={{ boxShadow: "0 0 10px #06b6d4, 0 0 20px rgba(6,182,212,0.5)" }}
      />
      <div
        className="absolute top-1/3 right-8 w-2 h-2 rounded-full bg-[#3b82f6]"
        style={{ boxShadow: "0 0 8px #3b82f6" }}
      />

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 py-6">
        {/* AI Badge */}
        <div
          className="mb-4 px-4 py-1.5 rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/10"
          style={{
            boxShadow: "0 0 20px rgba(139,92,246,0.2), inset 0 0 15px rgba(139,92,246,0.1)",
          }}
        >
          <span
            className="text-sm font-medium tracking-wide"
            style={{
              background: "linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            AI-Powered Infrastructure
          </span>
        </div>

        {/* Heading with gradient glow */}
        <h1 className="font-bold text-4xl md:text-5xl mb-3 text-center tracking-tight">
          <span
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #e0e7ff 50%, #c7d2fe 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              textShadow: "0 0 60px rgba(139,92,246,0.5), 0 0 120px rgba(59,130,246,0.3)",
              filter: "drop-shadow(0 0 20px rgba(139,92,246,0.3))",
            }}
          >
            Starknet Agentic
          </span>
        </h1>

        {/* Tagline */}
        <p
          className="text-gray-400 text-sm md:text-base mb-6 text-center max-w-md leading-relaxed"
          style={{ textShadow: "0 0 20px rgba(139,92,246,0.2)" }}
        >
          Autonomous AI agents with{" "}
          <span
            className="font-medium"
            style={{
              background: "linear-gradient(90deg, #8b5cf6, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            wallets
          </span>
          ,{" "}
          <span
            className="font-medium"
            style={{
              background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            identity
          </span>
          , and{" "}
          <span
            className="font-medium"
            style={{
              background: "linear-gradient(90deg, #06b6d4, #22d3ee)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            DeFi
          </span>{" "}
          on Starknet
        </p>

        {/* Gradient Buttons */}
        <div className="flex flex-wrap gap-4 justify-center">
          {/* Primary Button - Gradient fill */}
          <button
            className="relative px-7 py-2.5 rounded-lg text-white font-medium text-sm transition-all duration-300 hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #3b82f6 50%, #06b6d4 100%)",
              boxShadow: "0 0 20px rgba(139,92,246,0.4), 0 0 40px rgba(59,130,246,0.2)",
            }}
          >
            Launch Agent
          </button>

          {/* Secondary Button - Gradient border */}
          <button
            className="relative px-7 py-2.5 rounded-lg text-white/90 font-medium text-sm transition-all duration-300 hover:bg-white/5"
            style={{
              background: "linear-gradient(#0d0d0d, #0d0d0d) padding-box, linear-gradient(135deg, #8b5cf6, #3b82f6, #06b6d4) border-box",
              border: "1px solid transparent",
            }}
          >
            Explore Docs
          </button>
        </div>

        {/* Tech stack indicators */}
        <div className="flex items-center gap-4 mt-8">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-1.5 h-1.5 rounded-full bg-[#8b5cf6]" style={{ boxShadow: "0 0 6px #8b5cf6" }} />
            <span>MCP Server</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6]" style={{ boxShadow: "0 0 6px #3b82f6" }} />
            <span>ERC-8004</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="w-1.5 h-1.5 rounded-full bg-[#06b6d4]" style={{ boxShadow: "0 0 6px #06b6d4" }} />
            <span>A2A Protocol</span>
          </div>
        </div>
      </div>

      {/* Top gradient bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #8b5cf6 25%, #3b82f6 50%, #06b6d4 75%, transparent 100%)",
          boxShadow: "0 0 15px rgba(139,92,246,0.5), 0 0 30px rgba(59,130,246,0.3)",
        }}
      />

      {/* Bottom gradient bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[1px]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #06b6d4 25%, #3b82f6 50%, #8b5cf6 75%, transparent 100%)",
          boxShadow: "0 0 15px rgba(6,182,212,0.5), 0 0 30px rgba(59,130,246,0.3)",
        }}
      />

      {/* Holographic corner accents */}
      <div
        className="absolute top-0 left-0 w-24 h-24 opacity-30"
        style={{
          background: "linear-gradient(135deg, rgba(139,92,246,0.3) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-24 h-24 opacity-30"
        style={{
          background: "linear-gradient(315deg, rgba(6,182,212,0.3) 0%, transparent 60%)",
        }}
      />
    </div>
  );
}
