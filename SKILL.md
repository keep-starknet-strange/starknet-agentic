---
name: starknet-agentic-skills
description: Routes Starknet agent, wallet, DeFi, identity, SDK, and Cairo contract work to the smallest focused skill module.
license: Apache-2.0
metadata: {"author":"keep-starknet-strange","version":"1.0.4","source":"starknet-agentic"}
keywords: [starknet, cairo, agents, wallets, defi, identity, mcp, skills]
user-invocable: true
---

# Starknet Agentic Skills Router

Use this router to choose the smallest relevant Starknet Agentic skill. Load one child skill first, then add a second only when the task crosses a real boundary.

## Routing Rules

- Prefer the most specific skill over this router once intent is clear.
- Keep context narrow: read the selected `SKILL.md` before loading its references.
- Do not combine operational wallet/DeFi skills with Cairo authoring skills unless the task needs both.
- Treat keys, signer custody, paymasters, approvals, spending policy, upgrades, and identity/reputation writes as security-sensitive.

## Starknet App and Agent Skills

| User intent | Route to |
|---|---|
| Starknet.js application code, account APIs, transaction handling, paymaster integration, wallet integration | [starknet-js](skills/starknet-js/SKILL.md) |
| Agent wallet setup, balances, transfers, account deployment, contract invokes, session keys, gasless wallet operations | [starknet-wallet](skills/starknet-wallet/SKILL.md) |
| Swaps, DCA, staking, lending, AVNU routing, protocol-specific DeFi execution | [starknet-defi](skills/starknet-defi/SKILL.md) |
| ERC-8004 agent registration, metadata, reputation, validation, on-chain identity | [starknet-identity](skills/starknet-identity/SKILL.md) |
| SNIP-36 virtual block proving, off-chain proofs, anonymous voting, heavy private computation, proof-backed verification | [snip-36](skills/snip-36/SKILL.md) |
| Payment links, invoices, QR codes, Telegram payment UX, simple P2P ETH/STRK/USDC transfers | [starknet-mini-pay](skills/starknet-mini-pay/SKILL.md) |
| Confidential ERC20 payments, encrypted balances, private transfers, Tongo protocol flows | [starknet-tongo](skills/starknet-tongo/SKILL.md) |
| Privacy-focused Typhoon wallet creation and anonymous wallet operations | [starknet-anonymous-wallet](skills/starknet-anonymous-wallet/SKILL.md) |
| Cartridge Controller CLI sessions, scoped policies, explicit network/paymaster execution, JSON recovery | [controller-cli](skills/controller-cli/SKILL.md) |
| Bridging an agent from EVM to Starknet and registering with Huginn | [huginn-onboard](skills/huginn-onboard/SKILL.md) |
| Maintaining apps built with keep-starknet-strange/starkzap | [starkzap-sdk](skills/starkzap-sdk/SKILL.md) |

## Cairo Contract Skills

| User intent | Route to |
|---|---|
| Write or modify Cairo contracts, storage, events, interfaces, components, or project structure | [cairo-contract-authoring](skills/cairo-contract-authoring/SKILL.md) |
| Add unit, integration, fuzz, fork, or regression tests with Starknet Foundry | [cairo-testing](skills/cairo-testing/SKILL.md) |
| Improve Cairo gas/step performance after behavior is tested and locked | [cairo-optimization](skills/cairo-optimization/SKILL.md) |
| Build, declare, deploy, verify, or operate Cairo contracts with sncast | [cairo-deploy](skills/cairo-deploy/SKILL.md) |
| Review Cairo/Starknet code for vulnerabilities and false positives | [cairo-auditor](skills/cairo-auditor/SKILL.md) |
| Reason about account abstraction validation, nonces, signatures, execution paths, or session policy | [account-abstraction](skills/account-abstraction/SKILL.md) |
| Check Starknet protocol constraints: tx versions, fees, block timing, sequencer assumptions | [starknet-network-facts](skills/starknet-network-facts/SKILL.md) |

## Recommended Cairo Flow

For new contract work, use this sequence:

1. [cairo-contract-authoring](skills/cairo-contract-authoring/SKILL.md)
2. [cairo-testing](skills/cairo-testing/SKILL.md)
3. [cairo-optimization](skills/cairo-optimization/SKILL.md) (if performance matters)
4. [cairo-auditor](skills/cairo-auditor/SKILL.md)

Use [cairo-deploy](skills/cairo-deploy/SKILL.md) only after tests and review gates are satisfied.

## Common Combinations

- New account or wallet feature: [starknet-wallet](skills/starknet-wallet/SKILL.md) plus [account-abstraction](skills/account-abstraction/SKILL.md) when validation, session keys, or policies are involved.
- Agent identity with runtime code: [starknet-identity](skills/starknet-identity/SKILL.md) plus [starknet-js](skills/starknet-js/SKILL.md).
- SNIP-36 app flow: [snip-36](skills/snip-36/SKILL.md) plus [cairo-contract-authoring](skills/cairo-contract-authoring/SKILL.md) for verifier contracts or [starknet-js](skills/starknet-js/SKILL.md) for TypeScript orchestration.
- DeFi agent using wallet operations: start with [starknet-defi](skills/starknet-defi/SKILL.md), then add [starknet-wallet](skills/starknet-wallet/SKILL.md) only for account/session/paymaster details.
- Contract audit after implementation: [cairo-testing](skills/cairo-testing/SKILL.md) first if regression coverage is missing, then [cairo-auditor](skills/cairo-auditor/SKILL.md).
