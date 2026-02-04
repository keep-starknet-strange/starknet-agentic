export default function NeoBrutalist() {
  return (
    <div className="relative h-full w-full bg-cream overflow-hidden">
      {/* Decorative Background Shapes */}
      <div className="absolute top-8 right-12 w-24 h-24 bg-neo-yellow border-4 border-black rotate-12" />
      <div className="absolute bottom-16 right-1/4 w-16 h-16 bg-neo-pink border-4 border-black rounded-full" />
      <div className="absolute top-1/3 left-8 w-12 h-12 bg-neo-purple border-2 border-black rotate-45" />
      <div className="absolute bottom-8 left-16 w-20 h-4 bg-neo-blue border-2 border-black" />

      {/* Zigzag Decoration */}
      <svg
        className="absolute bottom-12 right-8 w-24 h-8"
        viewBox="0 0 100 20"
        fill="none"
        stroke="black"
        strokeWidth="3"
      >
        <path d="M0 10 L15 2 L30 18 L45 2 L60 18 L75 2 L90 18 L100 10" />
      </svg>

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 py-6">
        {/* Mini Badge */}
        <div className="mb-4 bg-neo-yellow border-2 border-black px-3 py-1 shadow-neo transform -rotate-2 hover:rotate-0 transition-transform cursor-default">
          <span className="font-heading font-bold text-sm tracking-wide uppercase">AI Infrastructure</span>
        </div>

        {/* Heading */}
        <h1 className="font-heading font-black text-4xl md:text-5xl text-black mb-3 text-center tracking-tight">
          Starknet Agentic
        </h1>

        {/* Tagline */}
        <p className="font-body text-lg md:text-xl text-neo-dark/80 mb-6 text-center max-w-md font-medium">
          Autonomous AI agents with wallets, identity, and DeFi on Starknet
        </p>

        {/* Button Group */}
        <div className="flex flex-wrap gap-4 justify-center">
          {/* Primary Button */}
          <button className="group relative bg-neo-blue text-white font-heading font-bold px-6 py-3 border-4 border-black shadow-neo-lg hover:shadow-neo-sm hover:translate-x-1 hover:translate-y-1 transition-all uppercase tracking-wide">
            Install Now
          </button>

          {/* Secondary Button */}
          <button className="group relative bg-white text-black font-heading font-bold px-6 py-3 border-4 border-black shadow-neo-lg hover:shadow-neo-sm hover:translate-x-1 hover:translate-y-1 transition-all uppercase tracking-wide">
            Learn More
          </button>
        </div>

        {/* Mini Feature Cards Row */}
        <div className="flex gap-3 mt-8">
          <div className="bg-neo-pink border-2 border-black px-4 py-2 shadow-neo hover:shadow-neo-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-default">
            <span className="font-heading font-bold text-sm">MCP Server</span>
          </div>
          <div className="bg-neo-purple border-2 border-black px-4 py-2 shadow-neo hover:shadow-neo-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-default">
            <span className="font-heading font-bold text-sm text-white">ERC-8004</span>
          </div>
          <div className="bg-neo-yellow border-2 border-black px-4 py-2 shadow-neo hover:shadow-neo-sm hover:translate-x-0.5 hover:translate-y-0.5 transition-all cursor-default">
            <span className="font-heading font-bold text-sm">DeFi Skills</span>
          </div>
        </div>
      </div>

      {/* Bottom Decorative Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-2 bg-black" />

      {/* Corner Accent */}
      <div className="absolute top-0 left-0 w-8 h-8 bg-neo-pink border-r-4 border-b-4 border-black" />

      {/* Top Right Circle Decoration */}
      <div className="absolute -top-4 -right-4 w-20 h-20 border-4 border-black rounded-full bg-transparent" />
    </div>
  );
}
