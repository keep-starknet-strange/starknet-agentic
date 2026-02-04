export default function SwissDesign() {
  return (
    <div className="h-full w-full bg-white relative overflow-hidden font-sans">
      {/* Grid overlay for Swiss precision */}
      <div className="absolute inset-0 opacity-[0.03]">
        <div className="h-full w-full" style={{
          backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Red accent bar - top */}
      <div className="absolute top-0 left-0 w-full h-1 bg-red-600" />

      {/* Main grid container */}
      <div className="relative z-10 h-full grid grid-cols-12 gap-4 px-8 py-10">
        {/* Left column - Typography hero */}
        <div className="col-span-7 flex flex-col justify-between">
          {/* Top section - Large typography */}
          <div>
            {/* Overline text */}
            <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-neutral-500 mb-2">
              AI Infrastructure
            </p>

            {/* Main headline - Swiss style bold typography */}
            <h1 className="text-5xl md:text-6xl font-black text-black leading-[0.9] tracking-tighter mb-4">
              STARKNET
              <br />
              <span className="text-red-600">AGENTIC</span>
            </h1>

            {/* Horizontal rule */}
            <div className="w-16 h-0.5 bg-black mb-4" />

            {/* Subheadline */}
            <p className="text-sm font-medium text-neutral-700 leading-relaxed max-w-xs">
              Autonomous agents with wallets,
              <br />
              identity, and DeFi access.
            </p>
          </div>

          {/* Bottom section - CTA */}
          <div className="flex items-center gap-6">
            <button className="px-5 py-2.5 bg-black text-white text-xs font-bold tracking-widest uppercase hover:bg-red-600 transition-colors duration-200">
              Get Started
            </button>
            <button className="text-xs font-bold tracking-widest uppercase text-black border-b-2 border-black hover:text-red-600 hover:border-red-600 transition-colors duration-200 pb-0.5">
              Documentation
            </button>
          </div>
        </div>

        {/* Right column - Structured info blocks */}
        <div className="col-span-5 flex flex-col justify-between border-l border-neutral-200 pl-6">
          {/* Feature list - Swiss grid style */}
          <div className="space-y-4">
            {/* Feature 1 */}
            <div className="border-b border-neutral-100 pb-3">
              <span className="text-[10px] font-bold tracking-widest text-red-600 uppercase">01</span>
              <p className="text-xs font-semibold text-black mt-1 tracking-wide uppercase">MCP Server</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">Model Context Protocol</p>
            </div>

            {/* Feature 2 */}
            <div className="border-b border-neutral-100 pb-3">
              <span className="text-[10px] font-bold tracking-widest text-red-600 uppercase">02</span>
              <p className="text-xs font-semibold text-black mt-1 tracking-wide uppercase">ERC-8004</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">Identity & Reputation</p>
            </div>

            {/* Feature 3 */}
            <div className="pb-3">
              <span className="text-[10px] font-bold tracking-widest text-red-600 uppercase">03</span>
              <p className="text-xs font-semibold text-black mt-1 tracking-wide uppercase">DeFi Skills</p>
              <p className="text-[10px] text-neutral-500 mt-0.5">Swap, Stake, Bridge</p>
            </div>
          </div>

          {/* Bottom right - Version/Year block */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">Version</p>
              <p className="text-lg font-black text-black">1.0</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold tracking-widest text-neutral-400 uppercase">Year</p>
              <p className="text-lg font-black text-black">2024</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vertical line accent */}
      <div className="absolute top-10 bottom-10 left-6 w-px bg-neutral-200" />

      {/* Red dot accent - bottom left */}
      <div className="absolute bottom-8 left-8 w-2 h-2 rounded-full bg-red-600" />

      {/* Horizontal line accent - bottom */}
      <div className="absolute bottom-0 left-1/3 right-0 h-px bg-neutral-200" />

      {/* Small type label - bottom */}
      <div className="absolute bottom-3 right-8 flex items-center gap-2">
        <div className="w-4 h-px bg-neutral-300" />
        <span className="text-[8px] font-bold tracking-[0.2em] uppercase text-neutral-400">
          Swiss International Style
        </span>
      </div>
    </div>
  );
}
