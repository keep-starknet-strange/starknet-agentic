export default function BentoGrid() {
  return (
    <div className="h-full w-full bg-[#f5f5f7] overflow-hidden p-4">
      {/* Bento Grid Container */}
      <div className="h-full grid grid-cols-4 grid-rows-3 gap-3">
        {/* Hero Cell - Large spanning cell */}
        <div className="col-span-2 row-span-2 bg-white rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0071e3] to-[#40a9ff] flex items-center justify-center mb-4">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-xl md:text-2xl font-semibold text-[#1d1d1f] tracking-tight mb-2">
              Starknet Agentic
            </h1>
            <p className="text-[#86868b] text-sm leading-relaxed">
              Infrastructure for autonomous AI agents. Wallets, identity, and DeFi on Starknet.
            </p>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="px-4 py-2 bg-[#0071e3] text-white text-xs font-medium rounded-full hover:bg-[#0077ed] transition-colors">
              Get Started
            </button>
            <button className="px-4 py-2 text-[#0071e3] text-xs font-medium rounded-full hover:bg-[#0071e3]/5 transition-colors">
              Learn more
            </button>
          </div>
        </div>

        {/* MCP Server Cell */}
        <div className="col-span-1 row-span-1 bg-white rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="w-6 h-6 rounded-md bg-[#f5f5f7] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#1d1d1f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          </div>
          <div>
            <p className="text-[#1d1d1f] text-sm font-medium">MCP Server</p>
            <p className="text-[#86868b] text-xs">Tool connectivity</p>
          </div>
        </div>

        {/* ERC-8004 Cell */}
        <div className="col-span-1 row-span-1 bg-gradient-to-br from-[#1d1d1f] to-[#3a3a3c] rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-medium">ERC-8004</p>
            <p className="text-white/60 text-xs">Identity & Trust</p>
          </div>
        </div>

        {/* A2A Protocol Cell */}
        <div className="col-span-1 row-span-1 bg-white rounded-2xl p-4 shadow-sm flex flex-col justify-between">
          <div className="w-6 h-6 rounded-md bg-[#f5f5f7] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[#1d1d1f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          <div>
            <p className="text-[#1d1d1f] text-sm font-medium">A2A Protocol</p>
            <p className="text-[#86868b] text-xs">Agent-to-agent</p>
          </div>
        </div>

        {/* Stats Cell - accent colored */}
        <div className="col-span-1 row-span-1 bg-gradient-to-br from-[#0071e3] to-[#40a9ff] rounded-2xl p-4 shadow-sm flex flex-col justify-center items-center text-center">
          <p className="text-white/80 text-xs font-medium uppercase tracking-wide mb-1">Built on</p>
          <p className="text-white text-lg font-semibold">Starknet</p>
          <p className="text-white/70 text-xs mt-1">Native AA</p>
        </div>

        {/* DeFi Skills Cell - horizontal */}
        <div className="col-span-2 row-span-1 bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#34c759] to-[#30d158] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-[#1d1d1f] text-sm font-medium">DeFi Skills</p>
            <p className="text-[#86868b] text-xs">Swap, lend, provide liquidity with avnu integration</p>
          </div>
          <div className="flex gap-1">
            <span className="px-2 py-1 bg-[#f5f5f7] rounded-md text-[10px] text-[#86868b] font-medium">STRK</span>
            <span className="px-2 py-1 bg-[#f5f5f7] rounded-md text-[10px] text-[#86868b] font-medium">ETH</span>
            <span className="px-2 py-1 bg-[#f5f5f7] rounded-md text-[10px] text-[#86868b] font-medium">USDC</span>
          </div>
        </div>

        {/* Wallet Cell */}
        <div className="col-span-1 row-span-1 bg-[#f5f5f7] rounded-2xl p-4 flex flex-col justify-between border border-[#d2d2d7]/50">
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center shadow-sm">
            <svg className="w-3.5 h-3.5 text-[#1d1d1f]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <div>
            <p className="text-[#1d1d1f] text-sm font-medium">Wallets</p>
            <p className="text-[#86868b] text-xs">Session keys</p>
          </div>
        </div>
      </div>
    </div>
  );
}
