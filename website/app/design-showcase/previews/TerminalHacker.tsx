export default function TerminalHacker() {
  return (
    <div className="h-full w-full bg-black font-mono relative overflow-hidden">
      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 255, 0, 0.03) 1px, rgba(0, 255, 0, 0.03) 2px)",
        }}
      />

      {/* Subtle glow effect top */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-96 h-40 bg-green-500/10 blur-3xl rounded-full" />

      {/* Terminal window chrome */}
      <div className="relative z-10 h-full flex flex-col">
        {/* Terminal header bar */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#0a0a0a] border-b border-green-900/30">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="text-green-500/60 text-xs ml-2">
            user@starknet ~ /agentic
          </span>
        </div>

        {/* Terminal content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-4">
          {/* ASCII banner */}
          <pre className="text-green-500 text-[8px] md:text-[10px] leading-tight mb-4 text-center select-none">
{`  _____ _____  _    ____  _  ___   _ _____ _____
 / ____|_   _|/ \\  |  _ \\| |/ / \\ | | ____|_   _|
 \\___ \\ | | / _ \\ | |_) | ' /|  \\| |  _|   | |
  ___) || |/ ___ \\|  _ <| . \\| |\\  | |___  | |
 |____/ |_/_/   \\_\\_| \\_\\_|\\_\\_| \\_|_____| |_|
           A G E N T I C`}
          </pre>

          {/* Command prompt style tagline */}
          <div className="text-green-400 text-sm mb-6 flex items-center">
            <span className="text-green-600">$</span>
            <span className="ml-2">Infrastructure for autonomous AI agents</span>
            <span className="inline-block w-2 h-4 bg-green-500 ml-1 animate-pulse" />
          </div>

          {/* Code snippet preview */}
          <div className="bg-[#0a0a0a] border border-green-900/40 rounded px-4 py-3 mb-6 max-w-md w-full">
            <div className="text-green-600 text-xs mb-1"># Quick start</div>
            <div className="text-green-400 text-sm">
              <span className="text-green-600">$</span> npx starknet-agentic init
            </div>
            <div className="text-green-500/60 text-xs mt-1">
              [OK] Agent wallet created
            </div>
            <div className="text-green-500/60 text-xs">
              [OK] Identity registered (ERC-8004)
            </div>
          </div>

          {/* Command-line style buttons */}
          <div className="flex gap-4">
            <button className="group flex items-center gap-2 px-4 py-2 border border-green-500 text-green-500 text-sm hover:bg-green-500 hover:text-black transition-colors">
              <span className="text-green-600 group-hover:text-black">&gt;</span>
              <span>install</span>
            </button>
            <button className="group flex items-center gap-2 px-4 py-2 border border-green-500/50 text-green-500/70 text-sm hover:border-green-500 hover:text-green-500 transition-colors">
              <span className="text-green-600/50 group-hover:text-green-600">&gt;</span>
              <span>docs</span>
            </button>
          </div>
        </div>

        {/* Bottom status bar */}
        <div className="flex items-center justify-between px-4 py-1.5 bg-[#0a0a0a] border-t border-green-900/30 text-[10px]">
          <div className="flex items-center gap-4">
            <span className="text-green-500/50">MCP</span>
            <span className="text-green-500/50">A2A</span>
            <span className="text-green-500/50">ERC-8004</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-green-500/70">CONNECTED</span>
          </div>
        </div>
      </div>

      {/* Matrix-style falling characters (static representation) */}
      <div className="absolute top-0 left-4 h-full w-4 flex flex-col gap-2 opacity-20 pointer-events-none overflow-hidden">
        {["S", "T", "A", "R", "K", "N", "E", "T"].map((char, i) => (
          <span
            key={i}
            className="text-green-500 text-xs"
            style={{ opacity: 1 - i * 0.1 }}
          >
            {char}
          </span>
        ))}
      </div>
      <div className="absolute top-8 right-8 h-full w-4 flex flex-col gap-2 opacity-10 pointer-events-none overflow-hidden">
        {["0", "1", "0", "1", "1", "0", "1", "0"].map((char, i) => (
          <span
            key={i}
            className="text-green-500 text-xs"
            style={{ opacity: 1 - i * 0.12 }}
          >
            {char}
          </span>
        ))}
      </div>
    </div>
  );
}
