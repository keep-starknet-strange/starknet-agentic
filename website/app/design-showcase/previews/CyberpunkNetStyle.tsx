export default function CyberpunkNetStyle() {
  return (
    <div className="h-full w-full bg-[#0a0a0a] relative overflow-hidden">
      {/* Subtle scanline overlay */}
      <div
        className="absolute inset-0 z-20 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.1) 1px, rgba(255,255,255,0.1) 2px)",
        }}
      />

      {/* Minimal grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(252,227,0,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(252,227,0,0.3) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Angular accent - top right */}
      <div
        className="absolute top-0 right-0 w-32 h-32"
        style={{
          background: "linear-gradient(135deg, transparent 50%, #FCE300 50%)",
          opacity: 0.08,
        }}
      />

      {/* Angular accent - bottom left */}
      <div
        className="absolute bottom-0 left-0 w-24 h-24"
        style={{
          background: "linear-gradient(-45deg, transparent 50%, #FCE300 50%)",
          opacity: 0.06,
        }}
      />

      {/* Top yellow bar accent */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#FCE300]" />

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 py-6">
        {/* Small tagline - stark white */}
        <div className="mb-3 flex items-center gap-3">
          <div className="w-8 h-[2px] bg-[#FCE300]" />
          <span className="text-[#FCE300] text-xs font-bold tracking-[0.4em] uppercase">
            AI Infrastructure
          </span>
          <div className="w-8 h-[2px] bg-[#FCE300]" />
        </div>

        {/* Main Heading - Bold, Caps, Yellow accent */}
        <h1 className="font-black text-4xl md:text-5xl text-white mb-1 text-center tracking-tight uppercase">
          STARKNET{" "}
          <span
            className="text-[#FCE300]"
            style={{
              textShadow: "0 0 30px rgba(252,227,0,0.4)",
            }}
          >
            AGENTIC
          </span>
        </h1>

        {/* Subtle underline */}
        <div className="w-24 h-[2px] bg-white/20 mb-4" />

        {/* Tagline - clean white */}
        <p className="text-white/70 text-sm md:text-base mb-6 text-center max-w-md font-light tracking-wide">
          Autonomous agents with{" "}
          <span className="text-[#FCE300] font-medium">wallets</span>,{" "}
          <span className="text-white font-medium">identity</span>, and{" "}
          <span className="text-[#FCE300] font-medium">DeFi</span> access
        </p>

        {/* Buttons - Stark contrast */}
        <div className="flex flex-wrap gap-4 justify-center">
          {/* Primary Button - Yellow fill */}
          <button
            className="px-8 py-3 bg-[#FCE300] text-[#0a0a0a] font-bold uppercase tracking-wider text-sm transition-all duration-200 hover:bg-[#FFED00]"
            style={{
              boxShadow: "0 0 20px rgba(252,227,0,0.3)",
            }}
          >
            Initialize
          </button>

          {/* Secondary Button - Yellow border */}
          <button className="px-8 py-3 bg-transparent border-2 border-white/30 text-white font-bold uppercase tracking-wider text-sm transition-all duration-200 hover:border-[#FCE300] hover:text-[#FCE300]">
            Documentation
          </button>
        </div>

        {/* Feature tags - minimal */}
        <div className="flex gap-4 mt-8 text-xs font-medium tracking-widest uppercase">
          <span className="text-white/40">MCP</span>
          <span className="text-[#FCE300]/60">|</span>
          <span className="text-white/40">ERC-8004</span>
          <span className="text-[#FCE300]/60">|</span>
          <span className="text-white/40">DeFi</span>
        </div>
      </div>

      {/* Bottom corner marks */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <div className="w-3 h-3 border-l-2 border-b-2 border-[#FCE300]/40" />
        <span className="text-[#FCE300]/30 text-[10px] font-bold tracking-[0.3em] uppercase">
          2077
        </span>
      </div>

      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        <span className="text-white/20 text-[10px] font-mono">SYS_OK</span>
        <div className="w-2 h-2 bg-[#FCE300] animate-pulse" />
      </div>

      {/* Diagonal cut corner - bottom right */}
      <div
        className="absolute bottom-0 right-0 w-16 h-16"
        style={{
          background: "linear-gradient(135deg, transparent 70%, #FCE300 70%)",
          opacity: 0.15,
        }}
      />

      {/* Side accent lines */}
      <div className="absolute left-0 top-1/4 w-[3px] h-16 bg-gradient-to-b from-[#FCE300] to-transparent opacity-30" />
      <div className="absolute right-0 bottom-1/4 w-[3px] h-16 bg-gradient-to-t from-[#FCE300] to-transparent opacity-30" />
    </div>
  );
}
