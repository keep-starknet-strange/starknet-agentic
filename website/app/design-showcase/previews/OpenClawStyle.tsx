export default function OpenClawStyle() {
  return (
    <div className="h-full w-full bg-[#050810] relative overflow-hidden">
      {/* Layered gradient backgrounds for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0f1a] via-[#050810] to-[#111827]" />

      {/* Cyan glow orb - top right */}
      <div
        className="absolute -top-20 -right-20 w-64 h-64 rounded-full opacity-30"
        style={{
          background: "radial-gradient(circle, rgba(0, 229, 204, 0.4) 0%, transparent 70%)",
        }}
      />

      {/* Coral glow orb - bottom left */}
      <div
        className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-25"
        style={{
          background: "radial-gradient(circle, rgba(230, 57, 70, 0.4) 0%, transparent 70%)",
        }}
      />

      {/* Content container */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 py-4">
        {/* Main heading section */}
        <div className="text-center mb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">
            <span className="text-[#f0f4ff]">Starknet </span>
            <span
              className="text-[#00e5cc]"
              style={{
                textShadow: "0 0 20px rgba(0, 229, 204, 0.4), 0 0 40px rgba(0, 229, 204, 0.2)",
              }}
            >
              Agentic
            </span>
          </h1>
          <p className="text-[#8892b0] text-sm md:text-base max-w-md mx-auto">
            Infrastructure for autonomous AI agents with wallets, identity, and DeFi on Starknet
          </p>
        </div>

        {/* Glowing buttons */}
        <div className="flex gap-3 mb-8">
          {/* Coral primary button */}
          <button
            className="px-6 py-2.5 bg-[#e63946] text-white text-sm font-semibold rounded-lg transition-all duration-300 hover:brightness-110 cursor-pointer"
            style={{
              boxShadow: "0 0 20px rgba(230, 57, 70, 0.4), 0 0 40px rgba(230, 57, 70, 0.2)",
            }}
          >
            Get Started
          </button>

          {/* Cyan secondary button */}
          <button
            className="px-6 py-2.5 bg-transparent text-[#00e5cc] text-sm font-semibold rounded-lg border border-[#00e5cc]/50 transition-all duration-300 hover:bg-[#00e5cc]/10 cursor-pointer"
            style={{
              boxShadow: "0 0 15px rgba(0, 229, 204, 0.2)",
            }}
          >
            Documentation
          </button>
        </div>

        {/* Floating asymmetric cards */}
        <div className="w-full max-w-lg grid grid-cols-3 gap-3">
          {/* Card 1 - MCP Server (larger) */}
          <div
            className="col-span-2 bg-[#0a0f1a]/80 backdrop-blur-sm rounded-xl p-4 border border-[#00e5cc]/20"
            style={{
              boxShadow: "0 0 20px rgba(0, 229, 204, 0.1), inset 0 0 20px rgba(0, 229, 204, 0.02)",
            }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-8 h-8 rounded-lg bg-[#00e5cc]/10 flex items-center justify-center"
                style={{ boxShadow: "0 0 10px rgba(0, 229, 204, 0.2)" }}
              >
                <svg className="w-4 h-4 text-[#00e5cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
              </div>
              <div>
                <p className="text-[#f0f4ff] text-sm font-semibold">MCP Server</p>
                <p className="text-[#8892b0] text-xs">Agent-to-tool connectivity</p>
              </div>
            </div>
          </div>

          {/* Card 2 - ERC-8004 (small accent) */}
          <div
            className="col-span-1 bg-gradient-to-br from-[#e63946]/20 to-[#e63946]/5 backdrop-blur-sm rounded-xl p-3 border border-[#e63946]/30"
            style={{
              boxShadow: "0 0 15px rgba(230, 57, 70, 0.15)",
            }}
          >
            <div className="w-6 h-6 rounded-md bg-[#e63946]/20 flex items-center justify-center mb-2">
              <svg className="w-3.5 h-3.5 text-[#ff4d4d]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-[#f0f4ff] text-xs font-semibold">ERC-8004</p>
            <p className="text-[#8892b0] text-[10px]">Identity</p>
          </div>

          {/* Card 3 - DeFi (small) */}
          <div
            className="col-span-1 bg-[#0a0f1a]/80 backdrop-blur-sm rounded-xl p-3 border border-[#14b8a6]/20"
            style={{
              boxShadow: "0 0 12px rgba(20, 184, 166, 0.1)",
            }}
          >
            <div className="w-6 h-6 rounded-md bg-[#14b8a6]/10 flex items-center justify-center mb-2">
              <svg className="w-3.5 h-3.5 text-[#14b8a6]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[#f0f4ff] text-xs font-semibold">DeFi</p>
            <p className="text-[#8892b0] text-[10px]">Swaps</p>
          </div>

          {/* Card 4 - A2A Protocol (wider) */}
          <div
            className="col-span-2 bg-[#0a0f1a]/80 backdrop-blur-sm rounded-xl p-3 border border-[#00e5cc]/15 flex items-center gap-3"
            style={{
              boxShadow: "0 0 15px rgba(0, 229, 204, 0.08)",
            }}
          >
            <div
              className="w-7 h-7 rounded-lg bg-[#00e5cc]/10 flex items-center justify-center flex-shrink-0"
              style={{ boxShadow: "0 0 8px rgba(0, 229, 204, 0.15)" }}
            >
              <svg className="w-3.5 h-3.5 text-[#00e5cc]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <p className="text-[#f0f4ff] text-xs font-semibold">A2A Protocol</p>
              <p className="text-[#8892b0] text-[10px]">Agent-to-agent communication</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom accent bar with glow */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00e5cc] to-transparent"
        style={{
          boxShadow: "0 0 10px rgba(0, 229, 204, 0.4), 0 0 20px rgba(0, 229, 204, 0.2)",
        }}
      />

      {/* Top corner accents */}
      <div
        className="absolute top-0 left-1/3 w-24 h-[2px] bg-gradient-to-r from-transparent via-[#e63946] to-transparent"
        style={{
          boxShadow: "0 0 8px rgba(230, 57, 70, 0.3)",
        }}
      />

      {/* Subtle corner frame */}
      <div className="absolute top-3 left-3 w-6 h-6 border-l border-t border-[#00e5cc]/30" />
      <div className="absolute top-3 right-3 w-6 h-6 border-r border-t border-[#e63946]/30" />
      <div className="absolute bottom-3 left-3 w-6 h-6 border-l border-b border-[#e63946]/30" />
      <div className="absolute bottom-3 right-3 w-6 h-6 border-r border-b border-[#00e5cc]/30" />

      {/* Style label */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div
          className="w-1.5 h-1.5 rounded-full bg-[#00e5cc]"
          style={{ boxShadow: "0 0 6px rgba(0, 229, 204, 0.5)" }}
        />
        <span className="text-[#8892b0] text-[10px] font-medium tracking-widest uppercase">
          OpenClaw Style
        </span>
        <div
          className="w-1.5 h-1.5 rounded-full bg-[#e63946]"
          style={{ boxShadow: "0 0 6px rgba(230, 57, 70, 0.5)" }}
        />
      </div>
    </div>
  );
}
