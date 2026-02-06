
import { useState, useEffect } from 'react'

// Mock Data Types
type MarketSignal = {
  metric: string
  value: number
  trend: 'up' | 'down' | 'neutral'
  timestamp: string
}

type StarknetTx = {
  hash: string
  action: string
  status: 'pending' | 'success' | 'failed'
}

function App() {
  const [signals, setSignals] = useState<MarketSignal[]>([])
  const [txs, setTxs] = useState<StarknetTx[]>([])
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/signals.json')
        const data = await res.json()
        if (data.signals) setSignals(data.signals)
        if (data.txs) setTxs(data.txs)
      } catch (e) {
        console.error("Failed to fetch signals", e)
      }
    }

    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-[#050b14] text-slate-200 font-sans selection:bg-cyan-500/30">
      <div className="fixed inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>

      {/* Glow Effects */}
      <div className="fixed top-[-10%] left-[-10%] w-[40vw] h-[40vw] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] bg-cyan-600/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="max-w-7xl mx-auto p-6 md:p-12 relative z-10">

        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16 border-b border-white/5 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/30 border border-cyan-500/20 text-cyan-400 text-xs font-medium tracking-wider mb-4">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              LIVE AGENT PROTOCOL
            </div>
            <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-500 tracking-tight">
              Alpha Hunter.
            </h1>
            <p className="mt-4 text-xl text-slate-400 max-w-xl leading-relaxed">
              An autonomous DeFi predator operating on <span className="text-white font-medium">Starknet</span>.
              Powered by <span className="text-white font-medium">Token Terminal</span> intelligence.
            </p>
          </div>

          <div className="flex gap-4">
            <div className="bg-white/5 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/5 shadow-2xl hover:border-white/10 transition-colors group">
              <span className="text-xs text-slate-500 uppercase tracking-widest font-semibold group-hover:text-cyan-400 transition-colors">Treasury</span>
              <div className="text-2xl font-mono mt-1 text-white">4.20 <span className="text-sm text-slate-500">ETH</span></div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Main Console */}
          <div className="lg:col-span-8 space-y-8">

            {/* Strategy Card */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-3xl p-8 border border-white/5 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" /></svg>
              </div>

              <h2 className="text-2xl font-semibold text-white mb-6 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">🧠</span>
                How It Works
              </h2>

              <div className="grid md:grid-cols-3 gap-6 relative">
                {/* Connecting Lines (Desktop) */}
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-y-1/2"></div>

                <div className="relative bg-[#0a1120] p-6 rounded-2xl border border-white/5 hover:-translate-y-1 transition-transform duration-300 z-10">
                  <div className="text-indigo-400 font-mono text-xs mb-2">STEP 01</div>
                  <h3 className="text-lg font-medium text-white mb-2">Watch</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Continuously scans <strong>Token Terminal</strong> for on-chain metrics (DAU, Revenue) on Starknet.
                  </p>
                </div>

                <div className="relative bg-[#0a1120] p-6 rounded-2xl border border-white/5 hover:-translate-y-1 transition-transform duration-300 z-10">
                  <div className="text-purple-400 font-mono text-xs mb-2">STEP 02</div>
                  <h3 className="text-lg font-medium text-white mb-2">Think</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Analyzes trends. If <span className="text-green-400">DAU &gt; 100k</span>, it identifies a <strong>Bullish</strong> accumulation signal.
                  </p>
                </div>

                <div className="relative bg-[#0a1120] p-6 rounded-2xl border border-white/5 hover:-translate-y-1 transition-transform duration-300 z-10">
                  <div className="text-cyan-400 font-mono text-xs mb-2">STEP 03</div>
                  <h3 className="text-lg font-medium text-white mb-2">Act</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Autonomously executes swaps (ETH → STRK) on <strong>AVNU/JediSwap</strong> via account abstraction.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Feed */}
            <div className="bg-[#0a1120]/50 backdrop-blur-md rounded-3xl p-8 border border-white/5">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center justify-between">
                <span className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400">📡</span>
                  Live Intelligence
                </span>
                <span className="text-xs font-mono text-slate-500 py-1 px-3 bg-white/5 rounded-full">polling: 5s</span>
              </h2>

              <div className="space-y-4">
                {signals.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 animate-pulse">Waiting for first signal pulse...</div>
                ) : signals.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl transition-colors group">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Signal Source</div>
                      <div className="font-medium text-slate-200">{s.metric}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-mono font-bold text-white flex items-center justify-end gap-3">
                        {s.value > 0 ? s.value.toLocaleString() : "---"}
                        <span className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/5 ${s.trend === 'up' ? 'text-green-400' :
                            s.trend === 'down' ? 'text-red-400' : 'text-slate-400'
                          }`}>
                          {s.trend === 'up' ? '↗' : s.trend === 'down' ? '↘' : '→'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{s.timestamp}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-8">
            <div className="bg-black/40 backdrop-blur-xl rounded-3xl p-6 border border-white/5 h-full min-h-[500px]">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <span className="animate-pulse w-2 h-2 rounded-full bg-cyan-500"></span>
                Execution Log
              </h2>

              <div className="space-y-4 font-mono text-sm relative">
                {/* Timeline Line */}
                <div className="absolute left-[19px] top-4 bottom-4 w-px bg-white/10"></div>

                {txs.length === 0 ? (
                  <div className="pl-12 py-4 text-slate-600 italic">No transactions executed yet.System is watching...</div>
                ) : txs.map((tx, i) => (
                  <div key={i} className="relative pl-12 group">
                    {/* Dot */}
                    <div className={`absolute left-[15px] top-1.5 w-2 h-2 rounded-full border-2 border-[#0a1120] ${tx.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                      } z-10`}></div>

                    <div className="bg-white/5 rounded-lg p-3 border border-white/5 hover:border-white/20 transition-colors">
                      <div className="text-slate-300 font-medium">{tx.action}</div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{tx.hash}</div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${tx.status === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

export default App
