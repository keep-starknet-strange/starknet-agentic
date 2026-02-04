export default function CyberpunkNeon() {
  return (
    <div className="relative h-full w-full bg-[#0d0d0d] overflow-hidden">
      {/* Scanline Overlay */}
      <div
        className="absolute inset-0 z-20 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.1) 2px, rgba(255,255,255,0.1) 4px)",
        }}
      />

      {/* Grid Lines Background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Neon Glow Shapes */}
      <div
        className="absolute top-12 right-16 w-32 h-1 bg-[#ff00ff] skew-x-[-20deg]"
        style={{
          boxShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 40px #ff00ff",
        }}
      />
      <div
        className="absolute top-20 right-24 w-20 h-1 bg-[#00ffff] skew-x-[-20deg]"
        style={{
          boxShadow: "0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 40px #00ffff",
        }}
      />
      <div
        className="absolute bottom-24 left-12 w-24 h-1 bg-[#00ffff] skew-x-[20deg]"
        style={{
          boxShadow: "0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 40px #00ffff",
        }}
      />
      <div
        className="absolute bottom-16 left-20 w-16 h-1 bg-[#ff00ff] skew-x-[20deg]"
        style={{
          boxShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 40px #ff00ff",
        }}
      />

      {/* Circuit Corner Elements */}
      <svg
        className="absolute top-4 left-4 w-16 h-16 opacity-40"
        viewBox="0 0 64 64"
        fill="none"
      >
        <path
          d="M0 32 H24 V8 H48"
          stroke="#00ffff"
          strokeWidth="2"
          style={{ filter: "drop-shadow(0 0 4px #00ffff)" }}
        />
        <circle cx="48" cy="8" r="3" fill="#00ffff" />
        <circle cx="24" cy="32" r="2" fill="#00ffff" />
      </svg>
      <svg
        className="absolute bottom-4 right-4 w-16 h-16 opacity-40 rotate-180"
        viewBox="0 0 64 64"
        fill="none"
      >
        <path
          d="M0 32 H24 V8 H48"
          stroke="#ff00ff"
          strokeWidth="2"
          style={{ filter: "drop-shadow(0 0 4px #ff00ff)" }}
        />
        <circle cx="48" cy="8" r="3" fill="#ff00ff" />
        <circle cx="24" cy="32" r="2" fill="#ff00ff" />
      </svg>

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 py-6">
        {/* Glitch Badge */}
        <div
          className="mb-4 px-4 py-1 border border-[#00ffff] bg-[#00ffff]/10 skew-x-[-5deg]"
          style={{
            boxShadow: "0 0 10px rgba(0,255,255,0.3), inset 0 0 10px rgba(0,255,255,0.1)",
          }}
        >
          <span
            className="text-[#00ffff] text-sm font-mono tracking-[0.3em] uppercase"
            style={{
              textShadow: "0 0 10px #00ffff, 0 0 20px #00ffff",
            }}
          >
            AI Infrastructure
          </span>
        </div>

        {/* Heading with Neon Glow */}
        <h1
          className="font-bold text-4xl md:text-5xl text-white mb-2 text-center tracking-wider"
          style={{
            textShadow: `
              0 0 10px #00ffff,
              0 0 20px #00ffff,
              0 0 40px #00ffff,
              0 0 80px rgba(0,255,255,0.5)
            `,
          }}
        >
          STARKNET AGENTIC
        </h1>

        {/* Glitch-style underline */}
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-12 h-[2px] bg-[#ff00ff]"
            style={{ boxShadow: "0 0 8px #ff00ff" }}
          />
          <div
            className="w-4 h-4 border-2 border-[#00ffff] rotate-45"
            style={{ boxShadow: "0 0 8px #00ffff" }}
          />
          <div
            className="w-12 h-[2px] bg-[#ff00ff]"
            style={{ boxShadow: "0 0 8px #ff00ff" }}
          />
        </div>

        {/* Tagline */}
        <p
          className="text-gray-400 text-base md:text-lg mb-6 text-center max-w-lg font-mono"
          style={{
            textShadow: "0 0 10px rgba(255,255,255,0.2)",
          }}
        >
          Autonomous agents with{" "}
          <span className="text-[#ff00ff]" style={{ textShadow: "0 0 8px #ff00ff" }}>
            wallets
          </span>
          ,{" "}
          <span className="text-[#00ffff]" style={{ textShadow: "0 0 8px #00ffff" }}>
            identity
          </span>
          , and{" "}
          <span className="text-[#4d4dff]" style={{ textShadow: "0 0 8px #4d4dff" }}>
            DeFi
          </span>{" "}
          on Starknet
        </p>

        {/* Neon Buttons */}
        <div className="flex flex-wrap gap-4 justify-center">
          {/* Primary Button - Cyan */}
          <button
            className="relative px-8 py-3 bg-transparent border-2 border-[#00ffff] text-[#00ffff] font-mono uppercase tracking-wider text-sm hover:bg-[#00ffff]/20 transition-all duration-300"
            style={{
              boxShadow: "0 0 10px rgba(0,255,255,0.5), inset 0 0 10px rgba(0,255,255,0.1)",
              textShadow: "0 0 10px #00ffff",
            }}
          >
            <span className="relative z-10">Initialize</span>
          </button>

          {/* Secondary Button - Magenta */}
          <button
            className="relative px-8 py-3 bg-transparent border-2 border-[#ff00ff] text-[#ff00ff] font-mono uppercase tracking-wider text-sm hover:bg-[#ff00ff]/20 transition-all duration-300"
            style={{
              boxShadow: "0 0 10px rgba(255,0,255,0.5), inset 0 0 10px rgba(255,0,255,0.1)",
              textShadow: "0 0 10px #ff00ff",
            }}
          >
            <span className="relative z-10">Documentation</span>
          </button>
        </div>

        {/* Mini Feature Tags */}
        <div className="flex gap-3 mt-8 font-mono text-xs">
          <div
            className="px-3 py-1 border border-[#00ffff]/50 text-[#00ffff]/80 bg-[#00ffff]/5"
            style={{ textShadow: "0 0 5px #00ffff" }}
          >
            MCP_SERVER
          </div>
          <div
            className="px-3 py-1 border border-[#ff00ff]/50 text-[#ff00ff]/80 bg-[#ff00ff]/5"
            style={{ textShadow: "0 0 5px #ff00ff" }}
          >
            ERC_8004
          </div>
          <div
            className="px-3 py-1 border border-[#4d4dff]/50 text-[#4d4dff]/80 bg-[#4d4dff]/5"
            style={{ textShadow: "0 0 5px #4d4dff" }}
          >
            DEFI_SKILLS
          </div>
        </div>
      </div>

      {/* Bottom Neon Bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00ffff] to-transparent"
        style={{
          boxShadow: "0 0 10px #00ffff, 0 0 20px #00ffff",
        }}
      />

      {/* Top Neon Accent */}
      <div
        className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-[#ff00ff] to-transparent"
        style={{
          boxShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff",
        }}
      />

      {/* Corner Accents */}
      <div className="absolute top-0 left-0 w-8 h-8 border-l-2 border-t-2 border-[#00ffff] opacity-60" />
      <div className="absolute top-0 right-0 w-8 h-8 border-r-2 border-t-2 border-[#ff00ff] opacity-60" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-l-2 border-b-2 border-[#ff00ff] opacity-60" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-r-2 border-b-2 border-[#00ffff] opacity-60" />
    </div>
  );
}
