# @starknet-agentic/skill-identity

Starknet Identity skill for AI agents. Register agents on-chain using the ERC-8004 Trustless Agents standard, manage reputation through feedback, and request third-party validation.

## Install

```bash
npm install @starknet-agentic/skill-identity
```

## What's Included

- **SKILL.md** — Full skill documentation with code examples for identity operations
- **scripts/** — Runnable examples (register-agent, query-reputation, set-metadata)
- **.env.example** — Environment variable template

## Quick Start

```bash
cp .env.example .env
# Edit .env with your RPC URL, account, and registry addresses
npx tsx scripts/register-agent.ts "MyAgent" "defi" "1.0"
npx tsx scripts/query-reputation.ts 1
npx tsx scripts/set-metadata.ts 1 status "active"
```

## Features

- Agent registration as ERC-721 NFTs with metadata
- Reputation system with cryptographic feedback authorization
- Third-party validation request/response lifecycle
- Agent Passport capability publishing via `caps` metadata
- Full metadata schema (agentName, agentType, version, model, status, etc.)
- A2A Agent Card integration

## Related

- [@starknet-agentic/agent-passport](https://www.npmjs.com/package/@starknet-agentic/agent-passport) — Passport client
- [@starknet-agentic/skill-wallet](https://www.npmjs.com/package/@starknet-agentic/skill-wallet) — Wallet management
- [starknet-agentic](https://github.com/Bitsage-Network/starknet-agentic) — Full infrastructure repo
