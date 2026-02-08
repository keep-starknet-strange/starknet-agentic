# @starknet-agentic/skill-wallet

Starknet Wallet skill for AI agents. Create and manage Starknet wallets with native Account Abstraction support — transfer tokens, check balances, manage session keys, and use gasless transactions via paymaster.

## Install

```bash
npm install @starknet-agentic/skill-wallet
```

## What's Included

- **SKILL.md** — Full skill documentation with code examples for wallet operations
- **scripts/** — Runnable example scripts (check-balance, check-balances)
- **.env.example** — Environment variable template

## Quick Start

```bash
cp .env.example .env
# Edit .env with your RPC URL and account address
npx tsx scripts/check-balance.ts
```

## Features

- Single and batch token balance queries
- Token transfers with gasless mode (paymaster)
- Contract read/write operations
- Multi-call batch transactions
- Session key management for agent autonomy
- Token resolution via avnu SDK

## Related

- [@starknet-agentic/skill-defi](https://www.npmjs.com/package/@starknet-agentic/skill-defi) — DeFi operations
- [@starknet-agentic/skill-identity](https://www.npmjs.com/package/@starknet-agentic/skill-identity) — On-chain identity
- [starknet-agentic](https://github.com/Bitsage-Network/starknet-agentic) — Full infrastructure repo
