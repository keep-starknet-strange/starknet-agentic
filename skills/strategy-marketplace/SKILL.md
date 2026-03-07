---
name: strategy-marketplace
description: Register agents, track outcomes, and publish or purchase reusable strategy listings.
keywords:
  - strategy
  - marketplace
  - agents
  - performance
  - trading
allowed-tools:
  - bash
  - node
  - bun
  - typescript
user-invocable: true
---

# Strategy Marketplace Skill

This skill helps agents become reusable products by exposing six core flows:
registration, performance tracking, strategy publishing, service offering,
strategy discovery, and strategy purchase.

## Quick Reference

| Function | Purpose | Returns |
| --- | --- | --- |
| `registerAgent` | Creates an agent registry entry. | `Promise<RegisteredAgent>` |
| `trackPerformance` | Stores one game outcome and ROI. | `Promise<void>` |
| `publishStrategy` | Creates a purchasable strategy listing. | `Promise<StrategyListing>` |
| `offerService` | Creates a purchasable service offering. | `Promise<ServiceOffering>` |
| `discoverStrategies` | Filters and sorts strategy listings. | `Promise<StrategyListing[]>` |
| `purchaseStrategy` | Validates buyer and returns access payload. | `Promise<PurchaseResult>` |

## Installation

```bash
pnpm --dir skills/strategy-marketplace install
pnpm --dir skills/strategy-marketplace run build
```

## Capabilities

### Register Agent

```typescript
import { registerAgent } from "@aircade/strategy-marketplace";

const agent = await registerAgent({
  name: "loot-survivor-pro",
  description: "Loot Survivor endgame specialist",
  capabilities: ["gaming", "strategy"],
  games: ["loot-survivor"],
  network: "SN_MAIN",
});
```

### Track Performance

```typescript
import { trackPerformance } from "@aircade/strategy-marketplace";

await trackPerformance({
  agentId: "0x...",
  game: "loot-survivor",
  result: "win",
  roi: 2.5,
  strategy: "aggressive-grind",
  duration: 3600,
});
```

### Publish Strategy

```typescript
import { publishStrategy } from "@aircade/strategy-marketplace";

const listing = await publishStrategy({
  agentId: "0x...",
  name: "Late-Game Survivor",
  description: "Optimized for day-30+ play",
  price: "0.001",
  game: "loot-survivor",
  parameters: {
    riskLevel: "high",
    playStyle: "aggressive",
    minCapital: "10",
  },
  trackRecord: {
    wins: 45,
    losses: 12,
    avgRoi: 1.8,
    totalGames: 57,
  },
});
```

### Offer Service

```typescript
import { offerService } from "@aircade/strategy-marketplace";

await offerService({
  agentId: "0x...",
  serviceName: "strategy-consultation",
  description: "State review + next action recommendation",
  price: "0.0001",
  capacity: 100,
});
```

### Discover Strategies

```typescript
import { discoverStrategies } from "@aircade/strategy-marketplace";

const listings = await discoverStrategies({
  game: "loot-survivor",
  minRoi: 1.5,
  maxPrice: 0.01,
  sortBy: "roi",
  limit: 20,
});
```

### Purchase Strategy

```typescript
import { purchaseStrategy } from "@aircade/strategy-marketplace";

const access = await purchaseStrategy({
  strategyId: "strat_abc123",
  buyerAgentId: "0x...",
});
```

## starknet.js Example

Use this pattern when you need wallet-backed execution tied to listing flow.

```typescript
import { Account, RpcProvider } from "starknet";
import { registerAgent, purchaseStrategy } from "@aircade/strategy-marketplace";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL! });
const account = new Account({
  provider,
  address: process.env.AGENT_ADDRESS!,
  signer: process.env.AGENT_PRIVATE_KEY!,
});

const agent = await registerAgent({
  name: "wallet-backed-agent",
  description: "Signs marketplace purchases",
  capabilities: ["execution"],
  games: ["loot-survivor"],
  network: "SN_MAIN",
});

const access = await purchaseStrategy({
  strategyId: "strat_abc123",
  buyerAgentId: agent.id,
});

console.log(access.accessId);
```

## Error Codes & Recovery

| Error Code | Meaning | Recovery |
| --- | --- | --- |
| `AGENT_NOT_FOUND` | Agent ID does not exist in registry. | Re-check `agentId`, register first if needed. |
| `BUYER_AGENT_NOT_FOUND` | Purchase request uses unknown buyer agent. | Register buyer agent before purchase. |
| `INVALID_PRICE` | Strategy/service price is non-numeric or negative. | Send a non-negative numeric price. |
| `STRATEGY_NOT_FOUND` | Requested listing ID does not exist. | Refresh discovery results and retry. |
| `STRATEGY_NOT_AVAILABLE` | Listing was removed or unavailable at execution time. | Re-query listings and choose another strategy. |
| `INSUFFICIENT_FUNDS` | Wallet cannot cover payment and gas. | Top up account and retry purchase. |
| `INVALID_SIGNATURE` | Signed request payload is invalid/expired. | Re-sign payload with current account nonce. |

## Architecture

```text
skills/strategy-marketplace/
├── README.md
├── SKILL.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── marketplace.ts
│   ├── registry.ts
│   ├── tracking.ts
│   ├── types.ts
│   └── strategy-marketplace.test.ts
├── references/
│   ├── api-spec.md
│   ├── certification-criteria.md
│   └── design-notes.md
└── scripts/
    ├── publishStrategy.ts
    ├── registerAgent.ts
    └── trackPerformance.ts
```

## Use Cases

### For Strategy Creators

1. Register an agent identity.
2. Track gameplay outcomes over time.
3. Publish high-performing strategies.
4. Monetize strategies via listing purchases.

### For Strategy Consumers

1. Discover strategies by ROI, price, and game.
2. Purchase strategies that match risk profile.
3. Integrate returned parameters into agent logic.

### For Vault/Portfolio Operators

1. Aggregate strategies from multiple agents.
2. Compare track records using unified metrics.
3. Build managed products around top listings.

## Integration Points

- `ERC-8004`: identity and registry semantics.
- `x402`: payment rails for strategy/service access.
- `A2A`: agent-to-agent strategy discovery and exchange.
- `Daydreams`: gameplay loop where outcomes are produced.
- `Cartridge Controller`: execution path for on-chain actions.

## Next Steps

- [ ] Add concrete docs to `references/` (`api-spec.md`, `design-notes.md`).
- [ ] Add runnable examples in `scripts/` (`registerAgent.ts`, `publishStrategy.ts`, `trackPerformance.ts`).
- [ ] Replace in-memory stores with contract-backed persistence.
- [ ] Add settlement flow for real on-chain purchases.
