# Roadmap (working)

Goal: consolidate the minimum infra needed to make Starknet a great place for agents.

## Milestone 0: repo hygiene
- CONTRIBUTING + clear local dev commands
- A small set of “good first issues” with acceptance tests

## Milestone 1: identity
- On-chain agent registry (ERC-8004-aligned)
- Off-chain identity format + URI support
- Minimal verifier story (signatures + allowlists)

## Milestone 2: wallet
- Agent account contract (session keys, spend limits, allowlists)
- TS SDK for common operations (deploy, call, invoke, approvals)
- End-to-end demo: create agent wallet -> send tx -> verify receipt

## Milestone 3: messaging + payments
- Agent-to-agent messaging integration hooks (XMTP/Matrix adapters are fine)
- Payments primitive (x402-style headers or on-chain payment intents)

## Milestone 4: tool surface
- MCP server package: small, stable tool set
- Skills marketplace: 3 core skills (wallet, defi, identity)

## Milestone 5: evals
- Reproducible eval harness for agent actions
- Security and policy gating tests
