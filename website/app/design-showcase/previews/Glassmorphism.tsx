export default function Glassmorphism() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-purple-50">
      {/* Colorful gradient blobs in background */}
      <div className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-gradient-to-br from-pink-300 to-rose-400 opacity-60 blur-3xl" />
      <div className="absolute top-10 right-10 h-64 w-64 rounded-full bg-gradient-to-br from-purple-300 to-violet-500 opacity-50 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-gradient-to-br from-blue-300 to-cyan-400 opacity-50 blur-3xl" />
      <div className="absolute -bottom-10 -right-10 h-56 w-56 rounded-full bg-gradient-to-br from-fuchsia-300 to-pink-400 opacity-40 blur-3xl" />
      <div className="absolute top-1/2 left-10 h-40 w-40 rounded-full bg-gradient-to-br from-indigo-300 to-blue-400 opacity-40 blur-2xl" />

      {/* Main content container */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-10">
        {/* Floating glass card - top left decorative */}
        <div className="absolute left-6 top-8 hidden md:block">
          <div className="h-16 w-32 rounded-xl border border-white/30 bg-white/20 p-3 shadow-lg backdrop-blur-md">
            <div className="h-2 w-16 rounded bg-white/40" />
            <div className="mt-2 h-2 w-10 rounded bg-white/30" />
          </div>
        </div>

        {/* Floating glass card - top right decorative */}
        <div className="absolute right-8 top-12 hidden md:block">
          <div className="h-20 w-24 rounded-2xl border border-white/30 bg-white/25 p-3 shadow-xl backdrop-blur-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-400/50 to-pink-400/50">
              <span className="text-xs text-white/80">AI</span>
            </div>
            <div className="mt-2 h-1.5 w-12 rounded bg-white/30" />
          </div>
        </div>

        {/* Main heading */}
        <h1 className="mb-4 text-center font-sans text-3xl font-bold tracking-tight text-slate-800 md:text-4xl">
          <span className="bg-gradient-to-r from-purple-600 via-pink-500 to-blue-500 bg-clip-text text-transparent">
            Starknet Agentic
          </span>
        </h1>

        {/* Tagline glass card */}
        <div className="mb-6 max-w-md rounded-2xl border border-white/30 bg-white/30 px-6 py-4 shadow-xl backdrop-blur-xl">
          <p className="text-center text-sm text-slate-600 md:text-base">
            AI agents with on-chain identity, reputation, and DeFi superpowers.
            Built for the agentic economy.
          </p>
        </div>

        {/* Glass effect buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button className="rounded-xl border border-white/40 bg-gradient-to-r from-purple-500/80 to-pink-500/80 px-5 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-all hover:from-purple-500 hover:to-pink-500 hover:shadow-xl">
            Get Started
          </button>
          <button className="rounded-xl border border-white/40 bg-white/30 px-5 py-2.5 text-sm font-medium text-slate-700 shadow-md backdrop-blur-md transition-all hover:bg-white/50">
            Explore Docs
          </button>
        </div>

        {/* Bottom floating glass cards */}
        <div className="mt-8 flex items-center gap-4">
          <div className="rounded-xl border border-white/30 bg-white/25 px-4 py-3 shadow-lg backdrop-blur-lg">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-400/60 to-cyan-400/60" />
              <div>
                <div className="h-1.5 w-12 rounded bg-slate-400/50" />
                <div className="mt-1 h-1 w-8 rounded bg-slate-300/50" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-white/30 bg-white/25 px-4 py-3 shadow-lg backdrop-blur-lg">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-pink-400/60 to-rose-400/60" />
              <div>
                <div className="h-1.5 w-14 rounded bg-slate-400/50" />
                <div className="mt-1 h-1 w-9 rounded bg-slate-300/50" />
              </div>
            </div>
          </div>
          <div className="hidden rounded-xl border border-white/30 bg-white/25 px-4 py-3 shadow-lg backdrop-blur-lg sm:block">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-400/60 to-purple-400/60" />
              <div>
                <div className="h-1.5 w-10 rounded bg-slate-400/50" />
                <div className="mt-1 h-1 w-7 rounded bg-slate-300/50" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle overlay for extra depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/10 via-transparent to-white/5" />
    </div>
  );
}
