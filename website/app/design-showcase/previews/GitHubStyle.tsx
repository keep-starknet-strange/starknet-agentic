export default function GitHubStyle() {
  return (
    <div className="h-full w-full relative overflow-hidden" style={{ backgroundColor: '#ffffff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif' }}>
      {/* Top navigation bar */}
      <div className="w-full px-6 py-3 flex items-center justify-between" style={{ backgroundColor: '#f6f8fa', borderBottom: '1px solid #d0d7de' }}>
        <div className="flex items-center gap-4">
          {/* Logo placeholder */}
          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: '#24292f' }} />
          <span className="text-xs font-semibold" style={{ color: '#24292f' }}>starknet-agentic</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: '#ddf4ff', color: '#0969da' }}>Open Source</span>
          <div className="flex items-center gap-1">
            <svg className="w-3 h-3" style={{ color: '#57606a' }} fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            <span className="text-[10px]" style={{ color: '#57606a' }}>Star</span>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="px-6 py-6">
        {/* Hero section */}
        <div className="text-center mb-6">
          {/* Badge pills */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#dafbe1', color: '#1a7f37' }}>Production Ready</span>
            <span className="text-[9px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#fff8c5', color: '#9a6700' }}>v1.0</span>
          </div>

          {/* Main heading */}
          <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: '#24292f' }}>
            Starknet Agentic
          </h1>

          {/* Tagline */}
          <p className="text-sm mb-4 max-w-xs mx-auto" style={{ color: '#57606a' }}>
            Infrastructure for autonomous AI agents on Starknet with wallets, identity, and DeFi access.
          </p>

          {/* CTA buttons */}
          <div className="flex items-center justify-center gap-3">
            <button
              className="px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer"
              style={{
                backgroundColor: '#238636',
                color: '#ffffff',
                border: '1px solid rgba(27, 31, 36, 0.15)',
                boxShadow: '0 1px 0 rgba(27, 31, 36, 0.1)'
              }}
            >
              Get Started
            </button>
            <button
              className="px-4 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer"
              style={{
                backgroundColor: '#f6f8fa',
                color: '#24292f',
                border: '1px solid #d0d7de',
                boxShadow: '0 1px 0 rgba(27, 31, 36, 0.04)'
              }}
            >
              Documentation
            </button>
          </div>
        </div>

        {/* Feature cards grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* Card 1 */}
          <div className="p-3 rounded-md" style={{ backgroundColor: '#f6f8fa', border: '1px solid #d0d7de' }}>
            <div className="w-5 h-5 rounded mb-2 flex items-center justify-center" style={{ backgroundColor: '#ddf4ff' }}>
              <svg className="w-3 h-3" style={{ color: '#0969da' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#24292f' }}>MCP Server</p>
            <p className="text-[9px]" style={{ color: '#57606a' }}>Model Context Protocol tools</p>
          </div>

          {/* Card 2 */}
          <div className="p-3 rounded-md" style={{ backgroundColor: '#f6f8fa', border: '1px solid #d0d7de' }}>
            <div className="w-5 h-5 rounded mb-2 flex items-center justify-center" style={{ backgroundColor: '#dafbe1' }}>
              <svg className="w-3 h-3" style={{ color: '#1a7f37' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#24292f' }}>ERC-8004</p>
            <p className="text-[9px]" style={{ color: '#57606a' }}>Identity & reputation</p>
          </div>

          {/* Card 3 */}
          <div className="p-3 rounded-md" style={{ backgroundColor: '#f6f8fa', border: '1px solid #d0d7de' }}>
            <div className="w-5 h-5 rounded mb-2 flex items-center justify-center" style={{ backgroundColor: '#ffeff7' }}>
              <svg className="w-3 h-3" style={{ color: '#bf3989' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#24292f' }}>DeFi Skills</p>
            <p className="text-[9px]" style={{ color: '#57606a' }}>Swap, stake, bridge</p>
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="absolute bottom-0 left-0 right-0 px-6 py-2 flex items-center justify-between" style={{ backgroundColor: '#f6f8fa', borderTop: '1px solid #d0d7de' }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#2ea44f' }} />
            <span className="text-[9px]" style={{ color: '#57606a' }}>74 tests passing</span>
          </div>
          <span className="text-[9px]" style={{ color: '#8b949e' }}>|</span>
          <span className="text-[9px]" style={{ color: '#0969da' }}>Cairo 2.12.1</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] tracking-wider uppercase" style={{ color: '#8b949e' }}>GitHub Style</span>
        </div>
      </div>
    </div>
  );
}
