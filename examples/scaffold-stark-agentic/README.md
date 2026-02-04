# Scaffold-Stark x Starknet Agentic (reference app plan)

Goal: use Scaffold-Stark as the fastest frontend chassis for Starknet Agentic primitives.

This is a starter blueprint you can fork to ship an agent-facing dapp quickly.

## Why Scaffold-Stark is useful for Starknet Agentic

- Burner wallet + mainnetFork support (v2.1.0) makes it safe to test realistic flows.
- Built-in write UX (now shows tx receipts) reduces debugging friction.
- Hooks/components accelerate on-chain read/write and event history.

## What we should ship as the first reference app (MVP)

A minimal "Agent Console" that proves the full agent stack:
1) Register identity (ERC-8004 IdentityRegistry)
2) Show reputation/validation summary
3) Execute a swap via avnu (optional paymaster)
4) Show tx receipt + events

## Minimal integration outline

### Contracts
- Use `packages/starknet-identity/erc8004-cairo` (already production-grade).
- Deploy to Sepolia for demo.

### Frontend
- Use Scaffold-Stark 2 (Next.js app) and configure:
  - network: Sepolia or mainnetFork
  - RPC URLs in env
  - externalContracts: ERC-8004 registry addresses + ABIs

### Data model
- Read identity metadata keys (agentName, agentType, capabilities, a2aEndpoint, etc).
- Display feedback summary from ReputationRegistry.

### Acceptance test
- Fresh clone + 3 terminal workflow:
  - `yarn chain` (or fork)
  - `yarn deploy` (deploy ERC-8004 demo addresses)
  - `yarn start`
- In UI:
  - register agent
  - perform a swap quote + swap
  - receipt appears, events visible

## References
- Scaffold-Stark repo: https://github.com/Scaffold-Stark/scaffold-stark-2
- Scaffold-Stark releases: https://github.com/Scaffold-Stark/scaffold-stark-2/releases
- AVNU docs: https://docs.avnu.fi/
