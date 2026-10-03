export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>SISNA — Starknet Sign-In With Agent</h1>
      <p>Example Next.js integration. See <code>examples/next-app/</code> for usage.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>GET /api/auth/nonce</code> — Request a nonce</li>
        <li><code>POST /api/auth/verify</code> — Verify signature</li>
      </ul>
    </main>
  );
}
