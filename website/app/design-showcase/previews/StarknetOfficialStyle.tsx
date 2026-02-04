export default function StarknetOfficialStyle() {
  return (
    <div className="h-full w-full bg-[#f7f8f9] relative overflow-hidden font-sans">
      {/* Subtle top navigation bar */}
      <div className="absolute top-0 left-0 right-0 bg-white border-b border-[#e5e7eb] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-[#222222] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">S</span>
          </div>
          <span className="text-[#222222] text-xs font-semibold tracking-tight">Starknet Agentic</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[#575760] text-[10px] font-medium hover:text-[#1e73be] transition-colors cursor-pointer">Docs</span>
          <span className="text-[#575760] text-[10px] font-medium hover:text-[#1e73be] transition-colors cursor-pointer">GitHub</span>
        </div>
      </div>

      {/* Main content area */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 pt-12">
        {/* Hero section */}
        <div className="text-center max-w-md">
          {/* Small badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#e5e7eb] rounded-full mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#1e73be]" />
            <span className="text-[10px] font-medium text-[#575760]">Infrastructure for AI Agents</span>
          </div>

          {/* Main heading */}
          <h1 className="text-[#222222] text-2xl md:text-3xl font-semibold tracking-tight mb-2">
            Starknet Agentic
          </h1>

          {/* Tagline */}
          <p className="text-[#575760] text-xs md:text-sm font-normal leading-relaxed mb-6 max-w-xs mx-auto">
            Give your AI agents wallets, identity, and DeFi access on Starknet.
          </p>

          {/* CTA Buttons - Pill shaped */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button className="px-5 py-2 bg-[#55555e] text-white text-[11px] font-medium rounded-full hover:bg-[#3d3d44] transition-colors duration-200 cursor-pointer">
              Get Started
            </button>
            <button className="px-5 py-2 bg-white text-[#222222] text-[11px] font-medium rounded-full border border-[#e5e7eb] hover:border-[#1e73be] hover:text-[#1e73be] transition-colors duration-200 cursor-pointer">
              Documentation
            </button>
          </div>
        </div>

        {/* Code snippet element */}
        <div className="bg-white border border-[#e5e7eb] rounded-lg p-3 w-full max-w-sm shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-[#ef4444]" />
            <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
            <div className="w-2 h-2 rounded-full bg-[#22c55e]" />
          </div>
          <div style={{ fontFamily: 'Menlo, Consolas, Monaco, monospace' }} className="text-[10px] leading-relaxed">
            <div className="text-[#575760]">
              <span className="text-[#1e73be]">const</span>{' '}
              <span className="text-[#222222]">agent</span>{' '}
              <span className="text-[#575760]">=</span>{' '}
              <span className="text-[#1e73be]">await</span>{' '}
              <span className="text-[#222222]">createAgent</span>
              <span className="text-[#575760]">(</span>
              <span className="text-[#575760]">{'{'}</span>
            </div>
            <div className="pl-3 text-[#575760]">
              <span className="text-[#222222]">wallet</span>
              <span>:</span>{' '}
              <span className="text-[#22863a]">&quot;0x123...&quot;</span>
              <span>,</span>
            </div>
            <div className="pl-3 text-[#575760]">
              <span className="text-[#222222]">identity</span>
              <span>:</span>{' '}
              <span className="text-[#1e73be]">true</span>
            </div>
            <div className="text-[#575760]">
              <span>{'}'}</span>
              <span>)</span>
              <span>;</span>
            </div>
          </div>
        </div>

        {/* Feature grid - subtle */}
        <div className="grid grid-cols-3 gap-4 mt-6 w-full max-w-sm">
          <div className="text-center">
            <p className="text-[#222222] text-xs font-semibold">MCP Server</p>
            <p className="text-[#575760] text-[9px]">Tools Protocol</p>
          </div>
          <div className="text-center border-l border-r border-[#e5e7eb]">
            <p className="text-[#222222] text-xs font-semibold">ERC-8004</p>
            <p className="text-[#575760] text-[9px]">Identity</p>
          </div>
          <div className="text-center">
            <p className="text-[#222222] text-xs font-semibold">DeFi Skills</p>
            <p className="text-[#575760] text-[9px]">Swap & Stake</p>
          </div>
        </div>
      </div>

      {/* Bottom label */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="w-3 h-px bg-[#d1d5db]" />
        <span className="text-[8px] font-medium tracking-widest uppercase text-[#9ca3af]">
          Starknet Official Style
        </span>
        <div className="w-3 h-px bg-[#d1d5db]" />
      </div>

      {/* Subtle corner accent */}
      <div className="absolute top-14 right-6 w-8 h-8 border-r border-t border-[#e5e7eb] rounded-tr-lg opacity-50" />
    </div>
  );
}
