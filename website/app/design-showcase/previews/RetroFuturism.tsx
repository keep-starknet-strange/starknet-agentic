export default function RetroFuturism() {
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#0a0612' }}>
      {/* Star field background */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(1px 1px at 20px 30px, white, transparent),
            radial-gradient(1px 1px at 40px 70px, rgba(255,255,255,0.8), transparent),
            radial-gradient(1px 1px at 90px 40px, rgba(255,255,255,0.6), transparent),
            radial-gradient(1px 1px at 130px 80px, white, transparent),
            radial-gradient(1px 1px at 160px 30px, rgba(255,255,255,0.7), transparent),
            radial-gradient(1px 1px at 200px 60px, white, transparent),
            radial-gradient(1px 1px at 250px 20px, rgba(255,255,255,0.5), transparent),
            radial-gradient(1px 1px at 280px 90px, white, transparent),
            radial-gradient(1px 1px at 320px 50px, rgba(255,255,255,0.8), transparent),
            radial-gradient(1px 1px at 360px 85px, white, transparent)
          `,
          backgroundSize: '400px 100px',
        }}
      />

      {/* Sunset gradient sky */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            linear-gradient(
              180deg,
              rgba(10, 6, 18, 0.9) 0%,
              rgba(45, 10, 60, 0.8) 30%,
              rgba(120, 30, 80, 0.6) 50%,
              rgba(255, 100, 50, 0.4) 70%,
              rgba(255, 150, 80, 0.3) 85%,
              rgba(10, 6, 18, 0.95) 100%
            )
          `,
        }}
      />

      {/* Synthwave Sun */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[35%] w-36 h-36">
        {/* Sun glow */}
        <div
          className="absolute inset-0 rounded-full blur-xl"
          style={{
            background: 'radial-gradient(circle, rgba(255, 100, 150, 0.8) 0%, rgba(255, 50, 100, 0) 70%)',
          }}
        />
        {/* Sun body with horizontal scan lines */}
        <div
          className="absolute inset-2 rounded-full overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #ff6090 0%, #ff9040 40%, #ffcc60 100%)',
          }}
        >
          {/* Horizontal cutout lines through the sun */}
          <div className="absolute inset-0 flex flex-col justify-end">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="w-full"
                style={{
                  height: `${4 + i * 3}px`,
                  marginBottom: `${2 + i}px`,
                  background: '#0a0612',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Perspective Grid Floor */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[45%]"
        style={{
          perspective: '300px',
          perspectiveOrigin: '50% 0%',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: 'rotateX(75deg)',
            transformOrigin: 'center top',
            backgroundImage: `
              linear-gradient(90deg, rgba(255, 0, 180, 0.5) 1px, transparent 1px),
              linear-gradient(0deg, rgba(0, 255, 255, 0.4) 1px, transparent 1px)
            `,
            backgroundSize: '40px 30px',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 20%, black 100%)',
          }}
        />
      </div>

      {/* Horizon glow line */}
      <div
        className="absolute bottom-[44%] left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #ff00ff 20%, #00ffff 50%, #ff00ff 80%, transparent 100%)',
          boxShadow: '0 0 20px rgba(255, 0, 255, 0.8), 0 0 40px rgba(0, 255, 255, 0.5)',
        }}
      />

      {/* Chrome geometric shapes */}
      <svg
        className="absolute top-8 left-8 w-12 h-12 opacity-70"
        viewBox="0 0 48 48"
        fill="none"
      >
        <polygon
          points="24,4 44,40 4,40"
          stroke="url(#chromeGrad1)"
          strokeWidth="2"
          fill="none"
        />
        <defs>
          <linearGradient id="chromeGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0e0e0" />
            <stop offset="50%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#a0a0a0" />
          </linearGradient>
        </defs>
      </svg>

      <svg
        className="absolute top-12 right-12 w-10 h-10 opacity-60"
        viewBox="0 0 40 40"
        fill="none"
      >
        <circle
          cx="20"
          cy="20"
          r="16"
          stroke="url(#chromeGrad2)"
          strokeWidth="2"
          fill="none"
        />
        <line x1="20" y1="4" x2="20" y2="36" stroke="url(#chromeGrad2)" strokeWidth="1" />
        <line x1="4" y1="20" x2="36" y2="20" stroke="url(#chromeGrad2)" strokeWidth="1" />
        <defs>
          <linearGradient id="chromeGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c0c0c0" />
            <stop offset="30%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#d0d0d0" />
            <stop offset="100%" stopColor="#909090" />
          </linearGradient>
        </defs>
      </svg>

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 pt-4 pb-20">
        {/* Chrome Badge */}
        <div
          className="mb-4 px-5 py-1.5 border"
          style={{
            borderImage: 'linear-gradient(135deg, #c0c0c0, #ffffff, #909090) 1',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))',
          }}
        >
          <span
            className="text-xs uppercase tracking-[0.4em] font-bold"
            style={{
              background: 'linear-gradient(90deg, #e0e0e0, #ffffff, #c0c0c0)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            AI Infrastructure
          </span>
        </div>

        {/* Retro Futuristic Title */}
        <h1
          className="text-4xl md:text-5xl font-black tracking-[0.15em] uppercase mb-2 text-center"
          style={{
            fontFamily: '"Arial Black", "Helvetica Neue", sans-serif',
            background: 'linear-gradient(180deg, #ffffff 0%, #ff80a0 30%, #ff6090 60%, #cc4080 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            textShadow: '0 0 40px rgba(255, 100, 150, 0.5)',
            filter: 'drop-shadow(0 0 20px rgba(255, 100, 150, 0.4))',
          }}
        >
          STARKNET AGENTIC
        </h1>

        {/* Chrome horizontal rule */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-16 h-[2px]"
            style={{
              background: 'linear-gradient(90deg, transparent, #ffffff, #c0c0c0)',
            }}
          />
          <div
            className="w-3 h-3 rotate-45 border"
            style={{
              borderColor: '#ff6090',
              boxShadow: '0 0 10px rgba(255, 96, 144, 0.6)',
            }}
          />
          <div
            className="w-16 h-[2px]"
            style={{
              background: 'linear-gradient(90deg, #c0c0c0, #ffffff, transparent)',
            }}
          />
        </div>

        {/* Tagline */}
        <p
          className="text-sm md:text-base mb-6 text-center max-w-md tracking-wider"
          style={{
            color: '#c0a0b0',
            fontFamily: '"Courier New", monospace',
            textShadow: '0 0 10px rgba(255, 100, 150, 0.3)',
          }}
        >
          Autonomous agents with{' '}
          <span style={{ color: '#ff80c0' }}>wallets</span>,{' '}
          <span style={{ color: '#00ffff' }}>identity</span>, and{' '}
          <span style={{ color: '#ffcc60' }}>DeFi</span> on Starknet
        </p>

        {/* Retro Buttons */}
        <div className="flex flex-wrap gap-4 justify-center">
          {/* Primary - Sunset gradient with chrome border */}
          <button
            className="px-6 py-2.5 uppercase tracking-widest text-xs font-bold text-white transition-all duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #ff6090, #ff9040)',
              border: '2px solid transparent',
              borderImage: 'linear-gradient(135deg, #ffffff, #c0c0c0) 1',
              boxShadow: '0 0 20px rgba(255, 100, 100, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
            }}
          >
            Initialize
          </button>

          {/* Secondary - Chrome outline */}
          <button
            className="px-6 py-2.5 uppercase tracking-widest text-xs font-bold bg-transparent transition-all duration-300 hover:scale-105"
            style={{
              border: '2px solid',
              borderImage: 'linear-gradient(135deg, #c0c0c0, #ffffff, #909090) 1',
              color: '#e0e0e0',
              textShadow: '0 0 10px rgba(255,255,255,0.3)',
            }}
          >
            Documentation
          </button>
        </div>

        {/* Feature Tags */}
        <div className="flex gap-3 mt-6">
          <div
            className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 0, 255, 0.2), rgba(255, 0, 255, 0.1))',
              border: '1px solid rgba(255, 0, 255, 0.5)',
              color: '#ff80ff',
              boxShadow: '0 0 10px rgba(255, 0, 255, 0.2)',
            }}
          >
            MCP Server
          </div>
          <div
            className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold"
            style={{
              background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.2), rgba(0, 255, 255, 0.1))',
              border: '1px solid rgba(0, 255, 255, 0.5)',
              color: '#80ffff',
              boxShadow: '0 0 10px rgba(0, 255, 255, 0.2)',
            }}
          >
            ERC-8004
          </div>
          <div
            className="px-3 py-1 text-[10px] uppercase tracking-widest font-bold"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 204, 96, 0.2), rgba(255, 204, 96, 0.1))',
              border: '1px solid rgba(255, 204, 96, 0.5)',
              color: '#ffdd80',
              boxShadow: '0 0 10px rgba(255, 204, 96, 0.2)',
            }}
          >
            DeFi Skills
          </div>
        </div>
      </div>

      {/* Bottom chrome accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #ff00ff 25%, #00ffff 50%, #ff00ff 75%, transparent)',
          boxShadow: '0 0 15px rgba(255, 0, 255, 0.6)',
        }}
      />

      {/* Scanline overlay for CRT effect */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
        }}
      />

      {/* Bottom label */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div
          className="w-8 h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, #ff6090)' }}
        />
        <span
          className="text-[10px] uppercase tracking-[0.3em] font-bold"
          style={{
            background: 'linear-gradient(90deg, #ff6090, #ffcc60)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Retro Futurism
        </span>
        <div
          className="w-8 h-[1px]"
          style={{ background: 'linear-gradient(90deg, #ff6090, transparent)' }}
        />
      </div>
    </div>
  );
}
