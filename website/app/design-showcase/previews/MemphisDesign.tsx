"use client";

export default function MemphisDesign() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ backgroundColor: '#FEF3C7' }}>
      {/* Terrazzo/Confetti Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Small confetti dots scattered across */}
        <div className="absolute top-[15%] left-[8%] w-2 h-2 rounded-full" style={{ backgroundColor: '#F472B6' }} />
        <div className="absolute top-[25%] left-[22%] w-3 h-3 rounded-full" style={{ backgroundColor: '#14B8A6' }} />
        <div className="absolute top-[12%] left-[45%] w-2 h-2 rounded-full" style={{ backgroundColor: '#FACC15' }} />
        <div className="absolute top-[35%] left-[78%] w-2 h-2 rounded-full" style={{ backgroundColor: '#F472B6' }} />
        <div className="absolute top-[8%] left-[85%] w-3 h-3 rounded-full" style={{ backgroundColor: '#000' }} />
        <div className="absolute top-[65%] left-[12%] w-2 h-2 rounded-full" style={{ backgroundColor: '#14B8A6' }} />
        <div className="absolute top-[75%] left-[88%] w-2 h-2 rounded-full" style={{ backgroundColor: '#FACC15' }} />
        <div className="absolute top-[85%] left-[35%] w-3 h-3 rounded-full" style={{ backgroundColor: '#F472B6' }} />
        <div className="absolute top-[55%] left-[5%] w-2 h-2 rounded-full" style={{ backgroundColor: '#000' }} />
        <div className="absolute top-[45%] left-[92%] w-2 h-2 rounded-full" style={{ backgroundColor: '#14B8A6' }} />
      </div>

      {/* Large Geometric Shapes - Memphis Style */}
      {/* Pink Triangle - Top Left */}
      <div
        className="absolute -top-6 -left-6"
        style={{
          width: 0,
          height: 0,
          borderLeft: '60px solid transparent',
          borderRight: '60px solid transparent',
          borderBottom: '100px solid #F472B6',
          transform: 'rotate(-15deg)',
        }}
      />

      {/* Teal Circle with Pattern - Top Right */}
      <div
        className="absolute top-8 right-12 w-20 h-20 rounded-full border-4"
        style={{
          backgroundColor: '#14B8A6',
          borderColor: '#000',
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(0,0,0,0.15) 4px, rgba(0,0,0,0.15) 8px)',
        }}
      />

      {/* Yellow Zigzag Shape - Left Side */}
      <svg
        className="absolute top-1/3 -left-4 w-16 h-24"
        viewBox="0 0 50 80"
        fill="none"
      >
        <path
          d="M0 0 L25 20 L0 40 L25 60 L0 80"
          stroke="#FACC15"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Black Rectangle with Dots - Bottom Left */}
      <div
        className="absolute bottom-12 left-8 w-16 h-10 border-4"
        style={{
          backgroundColor: '#000',
          borderColor: '#000',
          backgroundImage: 'radial-gradient(#FEF3C7 2px, transparent 2px)',
          backgroundSize: '8px 8px',
        }}
      />

      {/* Pink Squiggle - Right Side */}
      <svg
        className="absolute top-1/2 -right-2 w-20 h-32"
        viewBox="0 0 60 120"
        fill="none"
      >
        <path
          d="M30 0 C50 20, 10 40, 30 60 C50 80, 10 100, 30 120"
          stroke="#F472B6"
          strokeWidth="8"
          strokeLinecap="round"
        />
      </svg>

      {/* Teal Triangle - Bottom Right */}
      <div
        className="absolute -bottom-8 right-1/4"
        style={{
          width: 0,
          height: 0,
          borderLeft: '50px solid transparent',
          borderRight: '50px solid transparent',
          borderBottom: '80px solid #14B8A6',
          transform: 'rotate(10deg)',
        }}
      />

      {/* Yellow Semicircle - Bottom */}
      <div
        className="absolute -bottom-12 left-1/3 w-24 h-12 border-4 border-b-0"
        style={{
          backgroundColor: '#FACC15',
          borderColor: '#000',
          borderRadius: '60px 60px 0 0',
        }}
      />

      {/* Horizontal Stripes Decoration - Top */}
      <div className="absolute top-4 left-1/4 flex flex-col gap-1">
        <div className="w-12 h-1" style={{ backgroundColor: '#000' }} />
        <div className="w-10 h-1" style={{ backgroundColor: '#000' }} />
        <div className="w-8 h-1" style={{ backgroundColor: '#000' }} />
      </div>

      {/* Cross/Plus Shape - Right Side */}
      <div className="absolute top-1/4 right-1/3">
        <div className="relative w-8 h-8">
          <div className="absolute top-1/2 left-0 w-8 h-2 -translate-y-1/2" style={{ backgroundColor: '#000' }} />
          <div className="absolute top-0 left-1/2 w-2 h-8 -translate-x-1/2" style={{ backgroundColor: '#000' }} />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 py-6">
        {/* Playful Badge */}
        <div
          className="mb-4 px-4 py-1.5 border-4 transform -rotate-3 cursor-default"
          style={{
            backgroundColor: '#F472B6',
            borderColor: '#000',
            boxShadow: '4px 4px 0 #000',
          }}
        >
          <span className="font-bold text-sm tracking-wider uppercase text-white">AI Infrastructure</span>
        </div>

        {/* Main Heading - Bold Playful Typography */}
        <h1
          className="font-black text-4xl md:text-5xl text-center mb-2 tracking-tight"
          style={{
            color: '#000',
            textShadow: '3px 3px 0 #14B8A6, 6px 6px 0 #F472B6',
          }}
        >
          Starknet
        </h1>
        <h1
          className="font-black text-4xl md:text-5xl text-center mb-4 tracking-tight transform rotate-1"
          style={{
            color: '#000',
            textShadow: '3px 3px 0 #FACC15, 6px 6px 0 #14B8A6',
          }}
        >
          Agentic
        </h1>

        {/* Tagline */}
        <p
          className="text-base font-bold text-center max-w-sm mb-6"
          style={{ color: '#000' }}
        >
          Autonomous AI agents on Starknet
        </p>

        {/* Colorful Pills/Badges Row */}
        <div className="flex flex-wrap gap-3 justify-center mb-6">
          <div
            className="px-4 py-2 border-4 transform rotate-2 cursor-default transition-transform hover:-rotate-2"
            style={{
              backgroundColor: '#FACC15',
              borderColor: '#000',
              boxShadow: '3px 3px 0 #000',
            }}
          >
            <span className="font-bold text-sm">MCP Server</span>
          </div>
          <div
            className="px-4 py-2 border-4 transform -rotate-1 cursor-default transition-transform hover:rotate-1"
            style={{
              backgroundColor: '#14B8A6',
              borderColor: '#000',
              boxShadow: '3px 3px 0 #000',
            }}
          >
            <span className="font-bold text-sm text-white">ERC-8004</span>
          </div>
          <div
            className="px-4 py-2 border-4 transform rotate-1 cursor-default transition-transform hover:-rotate-1"
            style={{
              backgroundColor: '#F472B6',
              borderColor: '#000',
              boxShadow: '3px 3px 0 #000',
            }}
          >
            <span className="font-bold text-sm text-white">DeFi Skills</span>
          </div>
        </div>

        {/* CTA Button - Memphis Style */}
        <button
          className="px-8 py-3 border-4 font-black uppercase tracking-wide transition-all cursor-pointer hover:translate-x-1 hover:translate-y-1"
          style={{
            backgroundColor: '#000',
            color: '#FEF3C7',
            borderColor: '#000',
            boxShadow: '6px 6px 0 #F472B6',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '2px 2px 0 #F472B6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '6px 6px 0 #F472B6';
          }}
        >
          Get Started
        </button>
      </div>

      {/* Decorative Zigzag Border - Bottom */}
      <svg
        className="absolute bottom-0 left-0 w-full h-6"
        viewBox="0 0 400 20"
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          d="M0 10 L20 0 L40 20 L60 0 L80 20 L100 0 L120 20 L140 0 L160 20 L180 0 L200 20 L220 0 L240 20 L260 0 L280 20 L300 0 L320 20 L340 0 L360 20 L380 0 L400 20 L400 20 L0 20 Z"
          fill="#000"
        />
      </svg>

      {/* Additional Squiggle - Top Area */}
      <svg
        className="absolute top-6 left-1/2 w-24 h-6 -translate-x-1/2"
        viewBox="0 0 100 20"
        fill="none"
      >
        <path
          d="M0 10 C10 0, 20 20, 30 10 C40 0, 50 20, 60 10 C70 0, 80 20, 90 10 C95 5, 100 10, 100 10"
          stroke="#14B8A6"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>

      {/* Scattered geometric mini shapes */}
      <div
        className="absolute top-[20%] right-[15%] w-4 h-4 border-2"
        style={{ borderColor: '#000', transform: 'rotate(45deg)' }}
      />
      <div
        className="absolute bottom-[30%] left-[20%] w-4 h-4 border-2 rounded-full"
        style={{ borderColor: '#000' }}
      />
      <div
        className="absolute top-[60%] right-[25%] w-3 h-3"
        style={{ backgroundColor: '#FACC15', transform: 'rotate(30deg)' }}
      />
    </div>
  );
}
