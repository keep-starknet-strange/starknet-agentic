# @starknet-agentic/skill-defi

Starknet DeFi skill for AI agents. Execute token swaps, staking, lending, and DCA operations on Starknet using the avnu aggregator and native DeFi protocols.

## Install

```bash
npm install @starknet-agentic/skill-defi
```

## What's Included

- **SKILL.md** — Full skill documentation with code examples for all DeFi operations
- **scripts/** — Runnable examples (check-price, swap-quote, pool-info)
- **.env.example** — Environment variable template

## Quick Start

```bash
cp .env.example .env
# Edit .env with your RPC URL
npx tsx scripts/check-price.ts ETH USDC
npx tsx scripts/swap-quote.ts ETH USDC 0.1
npx tsx scripts/pool-info.ts ETH/STRK
```

## Features

- Token swaps with best-price routing via avnu
- STRK staking (stake, claim rewards, unstake)
- DCA (Dollar Cost Averaging) orders
- Lending/borrowing via zkLend
- Gasless swaps via paymaster
- Market data and price feeds
- Token address reference (mainnet + Sepolia)

## Related

- [@starknet-agentic/skill-wallet](https://www.npmjs.com/package/@starknet-agentic/skill-wallet) — Wallet management
- [@starknet-agentic/skill-identity](https://www.npmjs.com/package/@starknet-agentic/skill-identity) — On-chain identity
- [starknet-agentic](https://github.com/Bitsage-Network/starknet-agentic) — Full infrastructure repo
