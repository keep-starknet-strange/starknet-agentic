import { CORPORATE_MODEL, SOVEREIGN_MODEL } from "@/data/vision";

export function Vision() {
  return (
    <section id="vision" className="section-padding bg-neo-dark text-white">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Text */}
          <div>
            <span className="neo-badge bg-neo-yellow text-neo-dark mb-6 inline-block">
              The Stakes
            </span>
            <h2 className="font-heading font-black text-4xl md:text-5xl lg:text-6xl mb-8 leading-[1.05]">
              AI Will Either
              <br />
              <span className="text-neo-pink">Concentrate Power</span>
              <br />
              Or Set Us Free
            </h2>
            <div className="space-y-6 font-body text-white/80 text-lg leading-relaxed">
              <p>
                The agentic era is coming whether we&apos;re ready or not. AI
                agents will manage finances, negotiate deals, and run businesses.
                The question is:{" "}
                <strong className="text-white">who controls them?</strong>
              </p>
              <p>
                Corporate AI locks you in. Your agent&apos;s wallet is their
                wallet. Your agent&apos;s data is their data. Your agent&apos;s
                decisions serve their interests.
              </p>
              <p>
                <strong className="text-neo-yellow">
                  Sovereign agents change everything.
                </strong>{" "}
                When your agent&apos;s wallet is a smart contract you control,
                when its reputation lives on-chain, when its computations are
                ZK-verified -- you stay in control. Not a corporation. Not a
                platform. You.
              </p>
              <p>
                Starknet&apos;s ZK-STARKs make this possible. Verifiable
                computation means you can prove what your agent did without
                trusting anyone. That&apos;s not just privacy. That&apos;s{" "}
                <strong className="text-neo-green">sovereignty</strong>.
              </p>
            </div>
          </div>

          {/* Right: Visual comparison */}
          <div className="space-y-6">
            {/* Corporate model */}
            <div className="border-2 border-neo-pink/50 bg-neo-pink/10 p-8 relative">
              <div className="absolute -top-3 left-6">
                <span className="neo-badge bg-neo-pink text-white text-xs">
                  ✕ Centralized AI
                </span>
              </div>
              <ul className="space-y-4 mt-3 font-body text-white/70">
                {CORPORATE_MODEL.map((point) => (
                  <li key={point.text} className="flex items-start gap-3">
                    <span className="text-neo-pink mt-1" aria-hidden="true">
                      {point.icon}
                    </span>
                    <span>{point.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Sovereign model */}
            <div className="border-2 border-neo-green bg-neo-green/10 p-8 relative">
              <div className="absolute -top-3 left-6">
                <span className="neo-badge bg-neo-green text-neo-dark text-xs">
                  ✓ Sovereign Agents on Starknet
                </span>
              </div>
              <ul className="space-y-4 mt-3 font-body text-white/90">
                {SOVEREIGN_MODEL.map((point) => (
                  <li key={point.text} className="flex items-start gap-3">
                    <span className="text-neo-green mt-1" aria-hidden="true">
                      {point.icon}
                    </span>
                    <span>
                      {point.emphasis && (
                        <strong>{point.emphasis} </strong>
                      )}
                      {point.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
