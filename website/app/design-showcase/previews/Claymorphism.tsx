export default function Claymorphism() {
  return (
    <div className="h-full w-full relative overflow-hidden bg-gradient-to-br from-pink-50 via-blue-50 to-yellow-50">
      {/* Background soft shapes */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Large pastel blob - top left */}
        <div className="absolute -top-16 -left-16 w-64 h-64 bg-gradient-to-br from-pink-200/50 to-pink-300/30 rounded-full blur-2xl" />
        {/* Blue blob - top right */}
        <div className="absolute -top-8 right-20 w-48 h-48 bg-gradient-to-bl from-blue-200/50 to-sky-200/40 rounded-full blur-2xl" />
        {/* Yellow blob - bottom */}
        <div className="absolute bottom-10 left-1/4 w-56 h-56 bg-gradient-to-tr from-yellow-200/40 to-amber-100/30 rounded-full blur-2xl" />
        {/* Mint blob - bottom right */}
        <div className="absolute bottom-0 right-10 w-40 h-40 bg-gradient-to-tl from-emerald-200/50 to-mint-100/40 rounded-full blur-2xl" />
      </div>

      {/* Floating 3D clay shapes */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Pink clay sphere */}
        <div
          className="absolute top-12 left-12 w-12 h-12 rounded-full"
          style={{
            background: "linear-gradient(145deg, #fdb4c0 0%, #f7a8b8 50%, #e899a8 100%)",
            boxShadow: "inset -4px -4px 12px rgba(0,0,0,0.08), inset 4px 4px 12px rgba(255,255,255,0.9), 6px 6px 20px rgba(0,0,0,0.1)",
          }}
        />
        {/* Blue clay cube */}
        <div
          className="absolute top-20 right-16 w-10 h-10 rounded-2xl"
          style={{
            background: "linear-gradient(145deg, #a8d4f0 0%, #8ec5e8 50%, #7bb8e0 100%)",
            boxShadow: "inset -3px -3px 10px rgba(0,0,0,0.08), inset 3px 3px 10px rgba(255,255,255,0.9), 5px 5px 16px rgba(0,0,0,0.1)",
            transform: "rotate(15deg)",
          }}
        />
        {/* Yellow clay star shape */}
        <div
          className="absolute bottom-24 right-24 w-8 h-8 rounded-xl"
          style={{
            background: "linear-gradient(145deg, #ffe082 0%, #ffd54f 50%, #ffca28 100%)",
            boxShadow: "inset -2px -2px 8px rgba(0,0,0,0.06), inset 2px 2px 8px rgba(255,255,255,0.9), 4px 4px 12px rgba(0,0,0,0.08)",
            transform: "rotate(-20deg)",
          }}
        />
        {/* Mint clay pill */}
        <div
          className="absolute bottom-32 left-16 w-6 h-14 rounded-full"
          style={{
            background: "linear-gradient(145deg, #a8e6cf 0%, #88d8b0 50%, #7bcba0 100%)",
            boxShadow: "inset -2px -2px 8px rgba(0,0,0,0.06), inset 2px 2px 8px rgba(255,255,255,0.9), 4px 4px 12px rgba(0,0,0,0.08)",
            transform: "rotate(25deg)",
          }}
        />
        {/* Lilac clay donut */}
        <div
          className="absolute top-1/3 left-8 w-10 h-10 rounded-full"
          style={{
            background: "linear-gradient(145deg, #e6d5f2 0%, #d4c4e3 50%, #c4b4d4 100%)",
            boxShadow: "inset -3px -3px 10px rgba(0,0,0,0.06), inset 3px 3px 10px rgba(255,255,255,0.9), 5px 5px 16px rgba(0,0,0,0.08)",
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6 py-8">
        {/* Brand badge - clay style */}
        <div
          className="inline-flex items-center gap-2 mb-5 px-5 py-2.5 rounded-full"
          style={{
            background: "linear-gradient(145deg, #ffffff 0%, #f8f4ff 50%, #f0ecff 100%)",
            boxShadow: "inset -2px -2px 8px rgba(0,0,0,0.04), inset 2px 2px 8px rgba(255,255,255,1), 6px 6px 20px rgba(0,0,0,0.08), -2px -2px 8px rgba(255,255,255,0.8)",
            border: "3px solid rgba(255,255,255,0.8)",
          }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{
              background: "linear-gradient(145deg, #fdb4c0 0%, #f7a8b8 50%, #e899a8 100%)",
              boxShadow: "inset -2px -2px 6px rgba(0,0,0,0.1), inset 2px 2px 6px rgba(255,255,255,0.5)",
            }}
          >
            <span className="text-white text-xs font-bold drop-shadow-sm">S</span>
          </div>
          <span className="font-heading text-sm font-semibold text-slate-700">Starknet Agentic</span>
        </div>

        {/* Main heading - puffy 3D text effect */}
        <div className="text-center mb-5">
          <h1
            className="font-heading text-3xl md:text-4xl font-bold mb-2 leading-tight"
            style={{
              color: "#4a4a6a",
              textShadow: "2px 2px 0px rgba(255,255,255,0.8), -1px -1px 0px rgba(0,0,0,0.05), 3px 3px 6px rgba(0,0,0,0.1)",
            }}
          >
            Soft AI Agents
          </h1>
          <h2
            className="font-heading text-2xl md:text-3xl font-bold leading-tight"
            style={{
              background: "linear-gradient(135deg, #f7a8b8 0%, #8ec5e8 50%, #a8e6cf 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(2px 2px 4px rgba(0,0,0,0.1))",
            }}
          >
            On Starknet
          </h2>
        </div>

        {/* Tagline */}
        <p className="font-body text-slate-600 text-sm md:text-base max-w-sm mx-auto text-center mb-6 leading-relaxed">
          Playful, trustworthy agents with clay-soft interfaces.
        </p>

        {/* Clay buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
          <button
            className="px-7 py-3 rounded-2xl font-heading font-semibold text-sm text-white transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              background: "linear-gradient(145deg, #f7a8b8 0%, #e899a8 50%, #d88a98 100%)",
              boxShadow: "inset -3px -3px 10px rgba(0,0,0,0.15), inset 3px 3px 10px rgba(255,255,255,0.4), 6px 6px 20px rgba(0,0,0,0.12)",
              border: "3px solid rgba(255,255,255,0.3)",
            }}
          >
            Get Started
          </button>
          <button
            className="px-7 py-3 rounded-2xl font-heading font-semibold text-sm text-slate-700 transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              background: "linear-gradient(145deg, #ffffff 0%, #f5f5f5 50%, #ebebeb 100%)",
              boxShadow: "inset -3px -3px 10px rgba(0,0,0,0.06), inset 3px 3px 10px rgba(255,255,255,1), 6px 6px 20px rgba(0,0,0,0.1)",
              border: "3px solid rgba(255,255,255,0.8)",
            }}
          >
            Learn More
          </button>
        </div>

        {/* Clay feature cards */}
        <div className="flex flex-wrap items-stretch justify-center gap-4 w-full max-w-xl">
          {/* Card 1 - Identity */}
          <div
            className="flex-1 min-w-[130px] max-w-[160px] p-4 rounded-3xl transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              background: "linear-gradient(145deg, #ffe5ec 0%, #ffd6e0 50%, #ffc8d4 100%)",
              boxShadow: "inset -4px -4px 12px rgba(0,0,0,0.06), inset 4px 4px 12px rgba(255,255,255,0.8), 8px 8px 24px rgba(0,0,0,0.1)",
              border: "3px solid rgba(255,255,255,0.6)",
            }}
          >
            <div
              className="w-10 h-10 mb-3 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(145deg, #f7a8b8 0%, #e899a8 100%)",
                boxShadow: "inset -2px -2px 6px rgba(0,0,0,0.12), inset 2px 2px 6px rgba(255,255,255,0.4)",
              }}
            >
              <svg className="w-5 h-5 text-white drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="font-heading text-sm font-bold text-slate-700 mb-1">Identity</h3>
            <p className="font-body text-xs text-slate-500 leading-relaxed">Soft trust layers</p>
          </div>

          {/* Card 2 - Transact */}
          <div
            className="flex-1 min-w-[130px] max-w-[160px] p-4 rounded-3xl transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              background: "linear-gradient(145deg, #d6eeff 0%, #c4e4ff 50%, #b2daff 100%)",
              boxShadow: "inset -4px -4px 12px rgba(0,0,0,0.06), inset 4px 4px 12px rgba(255,255,255,0.8), 8px 8px 24px rgba(0,0,0,0.1)",
              border: "3px solid rgba(255,255,255,0.6)",
            }}
          >
            <div
              className="w-10 h-10 mb-3 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(145deg, #8ec5e8 0%, #7bb8e0 100%)",
                boxShadow: "inset -2px -2px 6px rgba(0,0,0,0.12), inset 2px 2px 6px rgba(255,255,255,0.4)",
              }}
            >
              <svg className="w-5 h-5 text-white drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <h3 className="font-heading text-sm font-bold text-slate-700 mb-1">Transact</h3>
            <p className="font-body text-xs text-slate-500 leading-relaxed">Smooth swaps</p>
          </div>

          {/* Card 3 - Connect */}
          <div
            className="flex-1 min-w-[130px] max-w-[160px] p-4 rounded-3xl transition-all duration-200 hover:scale-[1.02] cursor-pointer"
            style={{
              background: "linear-gradient(145deg, #d4f5e9 0%, #c0eed9 50%, #acE7c9 100%)",
              boxShadow: "inset -4px -4px 12px rgba(0,0,0,0.06), inset 4px 4px 12px rgba(255,255,255,0.8), 8px 8px 24px rgba(0,0,0,0.1)",
              border: "3px solid rgba(255,255,255,0.6)",
            }}
          >
            <div
              className="w-10 h-10 mb-3 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(145deg, #88d8b0 0%, #7bcba0 100%)",
                boxShadow: "inset -2px -2px 6px rgba(0,0,0,0.12), inset 2px 2px 6px rgba(255,255,255,0.4)",
              }}
            >
              <svg className="w-5 h-5 text-white drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="font-heading text-sm font-bold text-slate-700 mb-1">Connect</h3>
            <p className="font-body text-xs text-slate-500 leading-relaxed">Agent friends</p>
          </div>
        </div>
      </div>

      {/* Bottom decorative clay elements */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2"
      >
        <div
          className="w-3 h-3 rounded-full"
          style={{
            background: "linear-gradient(145deg, #fdb4c0, #e899a8)",
            boxShadow: "inset -1px -1px 3px rgba(0,0,0,0.1), inset 1px 1px 3px rgba(255,255,255,0.5)",
          }}
        />
        <div
          className="w-3 h-3 rounded-full"
          style={{
            background: "linear-gradient(145deg, #a8d4f0, #7bb8e0)",
            boxShadow: "inset -1px -1px 3px rgba(0,0,0,0.1), inset 1px 1px 3px rgba(255,255,255,0.5)",
          }}
        />
        <div
          className="w-3 h-3 rounded-full"
          style={{
            background: "linear-gradient(145deg, #ffe082, #ffca28)",
            boxShadow: "inset -1px -1px 3px rgba(0,0,0,0.1), inset 1px 1px 3px rgba(255,255,255,0.5)",
          }}
        />
        <div
          className="w-3 h-3 rounded-full"
          style={{
            background: "linear-gradient(145deg, #a8e6cf, #7bcba0)",
            boxShadow: "inset -1px -1px 3px rgba(0,0,0,0.1), inset 1px 1px 3px rgba(255,255,255,0.5)",
          }}
        />
      </div>
    </div>
  );
}
