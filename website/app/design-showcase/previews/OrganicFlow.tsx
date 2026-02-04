export default function OrganicFlow() {
  return (
    <div className="h-full w-full relative overflow-hidden bg-gradient-to-br from-amber-50 via-rose-50 to-sky-100">
      {/* Background blob shapes */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Large warm blob - top left */}
        <div className="absolute -top-20 -left-20 w-80 h-80 bg-gradient-to-br from-amber-200/60 to-orange-300/40 rounded-full blur-3xl" />

        {/* Cool blob - top right */}
        <div className="absolute -top-10 right-10 w-64 h-64 bg-gradient-to-bl from-sky-200/50 to-indigo-200/40 rounded-full blur-3xl" />

        {/* Pink accent blob - center */}
        <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-gradient-to-tr from-rose-200/40 to-pink-100/30 rounded-full blur-3xl -translate-y-1/2" />

        {/* Green accent blob - bottom right */}
        <div className="absolute bottom-0 right-1/4 w-56 h-56 bg-gradient-to-tl from-emerald-200/50 to-teal-100/40 rounded-full blur-3xl" />

        {/* Small floating accent blob */}
        <div className="absolute top-1/4 right-1/3 w-32 h-32 bg-gradient-to-br from-violet-200/40 to-purple-100/30 rounded-full blur-2xl animate-float" />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 py-8">
        {/* Main heading area */}
        <div className="text-center mb-6">
          {/* Logo/brand element */}
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-white/60 backdrop-blur-sm rounded-full shadow-sm">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-rose-400 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <span className="font-heading text-sm font-medium text-slate-700">Starknet Agentic</span>
          </div>

          {/* Main heading with rounded feel */}
          <h1 className="font-heading text-3xl md:text-4xl font-bold mb-3 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent leading-tight">
            AI Agents That Flow<br />
            <span className="bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500 bg-clip-text text-transparent">
              With Your Vision
            </span>
          </h1>

          {/* Friendly tagline */}
          <p className="font-body text-slate-600 text-sm md:text-base max-w-md mx-auto leading-relaxed">
            Gentle, autonomous agents working harmoniously on Starknet.
            Building trust, one interaction at a time.
          </p>
        </div>

        {/* Pill-shaped CTA buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
          <button className="px-6 py-2.5 bg-gradient-to-r from-amber-400 via-rose-400 to-pink-400 text-white font-heading font-medium text-sm rounded-full shadow-lg shadow-rose-200/50 hover:shadow-xl hover:shadow-rose-300/50 transition-all duration-300">
            Get Started
          </button>
          <button className="px-6 py-2.5 bg-white/70 backdrop-blur-sm text-slate-700 font-heading font-medium text-sm rounded-full shadow-md hover:bg-white/90 transition-all duration-300 border border-white/50">
            Learn More
          </button>
        </div>

        {/* Soft card elements */}
        <div className="flex flex-wrap items-stretch justify-center gap-4 w-full max-w-2xl">
          {/* Card 1 */}
          <div className="flex-1 min-w-[140px] max-w-[180px] p-4 bg-white/60 backdrop-blur-sm rounded-3xl shadow-lg shadow-slate-200/30 border border-white/70">
            <div className="w-10 h-10 mb-3 bg-gradient-to-br from-amber-300 to-orange-400 rounded-2xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-heading text-sm font-semibold text-slate-800 mb-1">Identity</h3>
            <p className="font-body text-xs text-slate-500 leading-relaxed">On-chain trust and reputation</p>
          </div>

          {/* Card 2 */}
          <div className="flex-1 min-w-[140px] max-w-[180px] p-4 bg-white/60 backdrop-blur-sm rounded-3xl shadow-lg shadow-slate-200/30 border border-white/70">
            <div className="w-10 h-10 mb-3 bg-gradient-to-br from-sky-300 to-indigo-400 rounded-2xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="font-heading text-sm font-semibold text-slate-800 mb-1">Transact</h3>
            <p className="font-body text-xs text-slate-500 leading-relaxed">Seamless DeFi operations</p>
          </div>

          {/* Card 3 */}
          <div className="flex-1 min-w-[140px] max-w-[180px] p-4 bg-white/60 backdrop-blur-sm rounded-3xl shadow-lg shadow-slate-200/30 border border-white/70">
            <div className="w-10 h-10 mb-3 bg-gradient-to-br from-emerald-300 to-teal-400 rounded-2xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="font-heading text-sm font-semibold text-slate-800 mb-1">Connect</h3>
            <p className="font-body text-xs text-slate-500 leading-relaxed">Agent-to-agent harmony</p>
          </div>
        </div>
      </div>

      {/* Decorative organic shapes at edges */}
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-amber-200/30 to-transparent rounded-tr-full" />
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-sky-200/30 to-transparent rounded-bl-full" />
    </div>
  );
}
