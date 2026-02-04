export default function GradientMesh() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Base gradient mesh background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 20%, rgba(251, 207, 232, 0.8) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 30%, rgba(196, 181, 253, 0.7) 0%, transparent 45%),
            radial-gradient(ellipse at 40% 80%, rgba(167, 243, 208, 0.6) 0%, transparent 50%),
            radial-gradient(ellipse at 90% 80%, rgba(254, 215, 170, 0.7) 0%, transparent 45%),
            radial-gradient(ellipse at 10% 60%, rgba(219, 234, 254, 0.5) 0%, transparent 40%),
            linear-gradient(135deg, #fdf2f8 0%, #faf5ff 25%, #f0fdf4 50%, #fffbeb 75%, #fdf2f8 100%)
          `,
        }}
      />

      {/* Floating gradient orbs */}
      <div
        className="absolute top-8 left-1/4 w-40 h-40 rounded-full blur-2xl opacity-60"
        style={{
          background: 'radial-gradient(circle, rgba(244, 114, 182, 0.6) 0%, rgba(244, 114, 182, 0) 70%)',
        }}
      />
      <div
        className="absolute top-16 right-1/4 w-48 h-48 rounded-full blur-3xl opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(167, 139, 250, 0.7) 0%, rgba(167, 139, 250, 0) 70%)',
        }}
      />
      <div
        className="absolute bottom-12 left-1/3 w-56 h-56 rounded-full blur-3xl opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(52, 211, 153, 0.5) 0%, rgba(52, 211, 153, 0) 70%)',
        }}
      />
      <div
        className="absolute bottom-20 right-1/5 w-36 h-36 rounded-full blur-2xl opacity-50"
        style={{
          background: 'radial-gradient(circle, rgba(251, 191, 36, 0.5) 0%, rgba(251, 191, 36, 0) 70%)',
        }}
      />
      <div
        className="absolute top-1/2 left-8 w-32 h-32 rounded-full blur-2xl opacity-40"
        style={{
          background: 'radial-gradient(circle, rgba(147, 197, 253, 0.6) 0%, rgba(147, 197, 253, 0) 70%)',
        }}
      />

      {/* Overlapping decorative shapes */}
      <div
        className="absolute top-12 right-8 w-20 h-20 rounded-full opacity-30"
        style={{
          background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.8), rgba(167, 139, 250, 0.8))',
        }}
      />
      <div
        className="absolute bottom-16 left-12 w-16 h-16 rounded-full opacity-25"
        style={{
          background: 'linear-gradient(45deg, rgba(52, 211, 153, 0.8), rgba(147, 197, 253, 0.8))',
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 py-6">
        {/* Soft badge */}
        <div
          className="mb-4 px-4 py-1.5 rounded-full backdrop-blur-sm"
          style={{
            background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.3), rgba(167, 139, 250, 0.3))',
            border: '1px solid rgba(255, 255, 255, 0.5)',
          }}
        >
          <span className="text-sm font-medium tracking-wide" style={{ color: '#6b21a8' }}>
            Ethereal AI Infrastructure
          </span>
        </div>

        {/* Heading with gradient text */}
        <h1
          className="text-4xl md:text-5xl font-light tracking-tight mb-3 text-center"
          style={{
            background: 'linear-gradient(135deg, #be185d 0%, #7c3aed 50%, #059669 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Starknet Agentic
        </h1>

        {/* Soft tagline */}
        <p className="text-base md:text-lg font-light mb-8 text-center max-w-md" style={{ color: '#78716c' }}>
          Where autonomous agents flow seamlessly through Starknet
        </p>

        {/* Gradient-filled buttons */}
        <div className="flex flex-wrap gap-4 justify-center">
          <button
            className="px-6 py-2.5 rounded-full font-medium text-white text-sm shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #f472b6 0%, #a78bfa 100%)',
              boxShadow: '0 10px 40px rgba(167, 139, 250, 0.3)',
            }}
          >
            Begin Journey
          </button>
          <button
            className="px-6 py-2.5 rounded-full font-medium text-sm backdrop-blur-sm transition-all duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.6), rgba(255,255,255,0.4))',
              border: '1px solid rgba(167, 139, 250, 0.3)',
              color: '#7c3aed',
            }}
          >
            Explore Docs
          </button>
        </div>

        {/* Feature badges */}
        <div className="flex gap-3 mt-8">
          <div
            className="px-3 py-1.5 rounded-full backdrop-blur-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(147, 197, 253, 0.2))',
              border: '1px solid rgba(52, 211, 153, 0.3)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: '#047857' }}>MCP Server</span>
          </div>
          <div
            className="px-3 py-1.5 rounded-full backdrop-blur-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(244, 114, 182, 0.2), rgba(251, 191, 36, 0.2))',
              border: '1px solid rgba(244, 114, 182, 0.3)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: '#be185d' }}>ERC-8004</span>
          </div>
          <div
            className="px-3 py-1.5 rounded-full backdrop-blur-sm"
            style={{
              background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(147, 197, 253, 0.2))',
              border: '1px solid rgba(167, 139, 250, 0.3)',
            }}
          >
            <span className="text-xs font-medium" style={{ color: '#7c3aed' }}>DeFi Skills</span>
          </div>
        </div>
      </div>

      {/* Bottom ethereal accent */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: 'linear-gradient(135deg, #f472b6, #a78bfa)' }}
        />
        <div
          className="w-16 h-0.5 rounded-full"
          style={{ background: 'linear-gradient(90deg, rgba(244, 114, 182, 0.5), rgba(167, 139, 250, 0.5))' }}
        />
        <span className="text-xs font-light tracking-widest" style={{ color: '#a78bfa' }}>
          DREAMY
        </span>
        <div
          className="w-16 h-0.5 rounded-full"
          style={{ background: 'linear-gradient(90deg, rgba(167, 139, 250, 0.5), rgba(52, 211, 153, 0.5))' }}
        />
        <div
          className="w-2 h-2 rounded-full"
          style={{ background: 'linear-gradient(135deg, #a78bfa, #34d399)' }}
        />
      </div>

      {/* Soft vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(253, 242, 248, 0.3) 100%)',
        }}
      />
    </div>
  );
}
