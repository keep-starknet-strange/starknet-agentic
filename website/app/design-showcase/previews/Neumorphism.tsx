export default function Neumorphism() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#e0e5ec]">
      {/* Main content container */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 py-10">
        {/* Floating neumorphic card - top left decorative */}
        <div className="absolute left-6 top-8 hidden md:block">
          <div
            className="h-16 w-32 rounded-2xl bg-[#e0e5ec] p-3"
            style={{
              boxShadow:
                "8px 8px 16px #b8bcc4, -8px -8px 16px #ffffff",
            }}
          >
            <div className="h-2 w-16 rounded-full bg-[#d1d5dc]" />
            <div className="mt-2 h-2 w-10 rounded-full bg-[#d8dce3]" />
          </div>
        </div>

        {/* Floating neumorphic card - top right decorative (inset style) */}
        <div className="absolute right-8 top-12 hidden md:block">
          <div
            className="h-20 w-24 rounded-2xl bg-[#e0e5ec] p-3"
            style={{
              boxShadow:
                "inset 5px 5px 10px #b8bcc4, inset -5px -5px 10px #ffffff",
            }}
          >
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#e0e5ec]"
              style={{
                boxShadow:
                  "3px 3px 6px #b8bcc4, -3px -3px 6px #ffffff",
              }}
            >
              <span className="text-xs font-semibold text-[#6b7280]">AI</span>
            </div>
            <div className="mt-2 h-1.5 w-12 rounded-full bg-[#d1d5dc]" />
          </div>
        </div>

        {/* Main heading with soft extruded effect */}
        <h1
          className="mb-4 text-center font-sans text-3xl font-bold tracking-tight text-[#4a5568] md:text-4xl"
          style={{
            textShadow: "2px 2px 4px #b8bcc4, -1px -1px 2px #ffffff",
          }}
        >
          Starknet Agentic
        </h1>

        {/* Tagline in neumorphic inset card */}
        <div
          className="mb-6 max-w-md rounded-2xl bg-[#e0e5ec] px-6 py-4"
          style={{
            boxShadow:
              "inset 6px 6px 12px #b8bcc4, inset -6px -6px 12px #ffffff",
          }}
        >
          <p className="text-center text-sm text-[#5a6578] md:text-base">
            AI agents with on-chain identity, reputation, and DeFi superpowers.
            Built for the agentic economy.
          </p>
        </div>

        {/* Neumorphic buttons (extruded style) */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button
            className="cursor-pointer rounded-2xl bg-[#e0e5ec] px-6 py-3 text-sm font-semibold text-[#4a5568] transition-all duration-150 hover:text-[#3b82f6] active:scale-[0.98]"
            style={{
              boxShadow:
                "8px 8px 16px #b8bcc4, -8px -8px 16px #ffffff",
            }}
          >
            Get Started
          </button>
          <button
            className="cursor-pointer rounded-2xl bg-[#e0e5ec] px-6 py-3 text-sm font-semibold text-[#4a5568] transition-all duration-150 hover:text-[#6366f1] active:scale-[0.98]"
            style={{
              boxShadow:
                "8px 8px 16px #b8bcc4, -8px -8px 16px #ffffff",
            }}
          >
            Explore Docs
          </button>
        </div>

        {/* Bottom soft badges / cards */}
        <div className="mt-8 flex items-center gap-4">
          <div
            className="flex items-center gap-2 rounded-xl bg-[#e0e5ec] px-4 py-3"
            style={{
              boxShadow:
                "5px 5px 10px #b8bcc4, -5px -5px 10px #ffffff",
            }}
          >
            <div
              className="h-6 w-6 rounded-lg bg-[#e0e5ec]"
              style={{
                boxShadow:
                  "inset 2px 2px 4px #b8bcc4, inset -2px -2px 4px #ffffff",
              }}
            />
            <div>
              <div className="h-1.5 w-12 rounded-full bg-[#c5cad2]" />
              <div className="mt-1 h-1 w-8 rounded-full bg-[#d1d5dc]" />
            </div>
          </div>
          <div
            className="flex items-center gap-2 rounded-xl bg-[#e0e5ec] px-4 py-3"
            style={{
              boxShadow:
                "5px 5px 10px #b8bcc4, -5px -5px 10px #ffffff",
            }}
          >
            <div
              className="h-6 w-6 rounded-lg bg-[#e0e5ec]"
              style={{
                boxShadow:
                  "inset 2px 2px 4px #b8bcc4, inset -2px -2px 4px #ffffff",
              }}
            />
            <div>
              <div className="h-1.5 w-14 rounded-full bg-[#c5cad2]" />
              <div className="mt-1 h-1 w-9 rounded-full bg-[#d1d5dc]" />
            </div>
          </div>
          <div
            className="hidden items-center gap-2 rounded-xl bg-[#e0e5ec] px-4 py-3 sm:flex"
            style={{
              boxShadow:
                "5px 5px 10px #b8bcc4, -5px -5px 10px #ffffff",
            }}
          >
            <div
              className="h-6 w-6 rounded-lg bg-[#e0e5ec]"
              style={{
                boxShadow:
                  "inset 2px 2px 4px #b8bcc4, inset -2px -2px 4px #ffffff",
              }}
            />
            <div>
              <div className="h-1.5 w-10 rounded-full bg-[#c5cad2]" />
              <div className="mt-1 h-1 w-7 rounded-full bg-[#d1d5dc]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
