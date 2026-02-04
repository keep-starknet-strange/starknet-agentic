export default function MinimalDark() {
  return (
    <div className="h-full w-full bg-[#0a0a0f] relative overflow-hidden">
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0f] via-[#0f0f18] to-[#0a0a0f]" />

      {/* Subtle gradient orb - top right */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />

      {/* Subtle gradient orb - bottom left */}
      <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl" />

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8">
        {/* Main heading */}
        <h1 className="text-white text-3xl md:text-4xl font-light tracking-tight mb-3 text-center">
          Starknet <span className="font-medium">Agentic</span>
        </h1>

        {/* Tagline */}
        <p className="text-gray-500 text-sm md:text-base font-light tracking-wide mb-8 text-center max-w-md">
          Infrastructure for autonomous agents on Starknet
        </p>

        {/* Subtle divider */}
        <div className="w-12 h-px bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent mb-8" />

        {/* Buttons */}
        <div className="flex items-center gap-4">
          {/* Primary button */}
          <button className="px-6 py-2.5 bg-white text-[#0a0a0f] text-sm font-medium tracking-wide rounded-sm transition-all duration-300 hover:bg-gray-100 hover:shadow-lg hover:shadow-white/5">
            Get Started
          </button>

          {/* Secondary button */}
          <button className="px-6 py-2.5 text-gray-400 text-sm font-medium tracking-wide border border-gray-800 rounded-sm transition-all duration-300 hover:text-white hover:border-gray-600">
            Documentation
          </button>
        </div>

        {/* Bottom accent line */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
          <div className="w-1 h-1 rounded-full bg-cyan-500/50" />
          <div className="w-8 h-px bg-gray-800" />
          <span className="text-gray-600 text-xs font-light tracking-widest uppercase">
            Minimal
          </span>
          <div className="w-8 h-px bg-gray-800" />
          <div className="w-1 h-1 rounded-full bg-cyan-500/50" />
        </div>
      </div>

      {/* Subtle border frame */}
      <div className="absolute inset-4 border border-white/[0.03] rounded-sm pointer-events-none" />
    </div>
  );
}
