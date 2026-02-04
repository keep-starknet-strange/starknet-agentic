## [Type]: Scaffold-Stark Agent Console (reference app)

**Complexity:** M
**Component:** TypeScript + Docs

### Problem
We need a Starknet-native, forkable reference app that demonstrates the Starknet Agentic stack end-to-end.

### Context
- Scaffold-Stark provides the fastest Next.js Starknet UX baseline, now with mainnetFork + burner wallet support and receipt UX fixed.
- Starknet Agentic already has production ERC-8004 Cairo contracts.

### Implementation Plan
1) Create a minimal scaffold-stark based app under `examples/scaffold-stark-agentic/app/` (or a separate repo) using create-stark.
2) Add ERC-8004 externalContracts wiring (identity/reputation/validation).
3) Add one page: register agent + display metadata.
4) Add one page: avnu quote + swap + receipt display.
5) Document a deterministic Sepolia demo path.

### Acceptance Criteria
- [ ] New contributor can run the app and complete the two flows in <15 minutes
- [ ] Receipts/events shown for register + swap tx
- [ ] Code stays minimal, no custom wallet infra

### Out of Scope
- Execution bots, strategy logic, perps
- Production deployment
