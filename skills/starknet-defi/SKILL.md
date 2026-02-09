---
name: starknet-defi
description: Execute DeFi operations on Starknet: token swaps via avnu aggregator, DCA recurring buys, STRK staking, lending/borrowing, and liquidity provision. Supports gasless and gasfree transactions.
keywords:
  - starknet
  - defi
  - swap
  - dca
  - staking
  - lending
  - avnu
  - ekubo
  - jediswap
  - zklend
  - nostra
  - aggregator
  - yield
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - Task
user-invocable: true
---

# Starknet DeFi Skill

Execute DeFi operations on Starknet using avnu aggregator and native protocols.

## Overview

starknet-defi provides DeFi operations on Starknet: token swaps via avnu aggregator, DCA recurring buys, STRK staking, lending/borrowing, and liquidity provision. Supports gasless and gasfree transactions.

### Key Features
- Best-price swap aggregation (avnu, Ekubo, Jediswap)
- DCA order creation and management
- STRK staking with rewards
- Lending and borrowing protocols
- Gasless transactions via paymaster

## Prerequisites

```bash
npm install starknet@^8.9.1 @avnu/avnu-sdk@^4.0.1
```

## Quick Start

### 1. Setup

Configure environment variables:
- `STARKNET_RPC_URL` - Starknet JSON-RPC endpoint
- `STARKNET_ACCOUNT_ADDRESS` - Agent's account address  
- `STARKNET_PRIVATE_KEY` - Agent's signing key

### 2. Get Quote

```typescript
import { getQuotes } from "@avnu/avnu-sdk";
```

### 3. Execute Swap

```typescript
import { executeSwap } from "@avnu/avnu-sdk";
```

## Python CLI Scripts

**WARNING:** The Python scripts in `scripts/` are CLI wrappers that require additional configuration:
- DEX contract addresses and ABIs
- Proper starknet-py setup
- Valid RPC endpoints

These scripts demonstrate the API structure but are not functional stubs.

## References

- [avnu SDK Documentation](https://docs.avnu.fi/)
- [Ekubo Protocol](https://docs.ekubo.org/)
- [zkLend Documentation](https://docs.zklend.com/)
- [Nostra Finance](https://docs.nostra.finance/)
