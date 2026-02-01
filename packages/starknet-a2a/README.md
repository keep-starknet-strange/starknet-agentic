# Starknet A2A Adapter

An implementation of the [A2A (Agent-to-Agent) Protocol](https://a2a-protocol.org/) for Starknet-native AI agents.

## Features

- **Agent Card Generation**: Create A2A-compliant agent cards from on-chain ERC-8004 identity
- **On-Chain Identity**: Integrate with Starknet's Agent Registry (ERC-8004)
- **Reputation Integration**: Include on-chain reputation scores in agent cards
- **Task Management**: Map A2A tasks to Starknet transactions
- **Agent Discovery**: Generate `/.well-known/agent.json` for discovery
- **Type-Safe**: Full TypeScript types for all A2A structures

## Installation

```bash
cd packages/starknet-a2a
npm install
npm run build
```

## Usage

### Initialize the Adapter

```typescript
import { createStarknetA2AAdapter } from "@starknet-agentic/a2a";

const adapter = createStarknetA2AAdapter({
  rpcUrl: "https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY",
  identityRegistryAddress: "0x...",  // ERC-8004 Identity Registry
  reputationRegistryAddress: "0x...", // Optional: Reputation Registry
  validationRegistryAddress: "0x...", // Optional: Validation Registry
});
```

### Generate an Agent Card

```typescript
// Get agent card from on-chain identity
const agentCard = await adapter.generateAgentCard("123"); // agent ID

console.log(agentCard);
// {
//   name: "DeFi Expert Agent",
//   description: "Specialized in Starknet DeFi operations",
//   url: "https://agent.example.com",
//   version: "1.0",
//   skills: ["swap", "stake", "lend"],
//   starknetIdentity: {
//     registryAddress: "0x...",
//     agentId: "123",
//     reputationScore: 95,
//     validationCount: 42
//   }
// }
```

### Register a New Agent

```typescript
import { Account, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: RPC_URL });
const account = new Account(provider, ADDRESS, PRIVATE_KEY);

const txHash = await adapter.registerAgent(account, {
  name: "My Agent",
  description: "A helpful AI agent on Starknet",
  a2aEndpoint: "https://myagent.com",
  capabilities: ["swap", "transfer", "analyze"],
});

console.log("Agent registered:", txHash);
```

### Task Management

```typescript
// Create task from transaction
const task = adapter.createTaskFromTransaction(
  "0x123abc...",
  "Swap 1 ETH for STRK"
);

// Check task status
const status = await adapter.getTaskStatus(task.id);
console.log(status.state); // "completed", "working", "failed"
```

### Generate /.well-known/agent.json

```typescript
const wellKnown = await adapter.generateWellKnownAgentJson(
  "123", // agent ID
  "https://myagent.com"
);

// Serve this at https://myagent.com/.well-known/agent.json
```

## A2A Protocol Integration

The adapter implements the A2A protocol spec with Starknet-specific extensions:

### Agent Card Structure

```typescript
{
  name: string;
  description: string;
  url?: string;
  version: string;
  skills: string[];
  starknetIdentity?: {
    registryAddress: string;
    agentId: string;
    reputationScore?: number;
    validationCount?: number;
    walletAddress?: string;
  };
}
```

### Task States Mapping

| A2A State | Starknet Equivalent |
|-----------|---------------------|
| `submitted` | Transaction sent to mempool |
| `working` | Transaction pending confirmation |
| `completed` | Transaction succeeded |
| `failed` | Transaction reverted |
| `canceled` | Not applicable (immutable blockchain) |

## ERC-8004 Integration

The adapter reads from three ERC-8004 registry contracts:

1. **Identity Registry**: Agent names, descriptions, capabilities
2. **Reputation Registry**: Feedback scores and counts
3. **Validation Registry**: Third-party validations

All data is fetched on-chain, making agent cards verifiable and trustless.

## API Reference

### `StarknetA2AAdapter`

#### `generateAgentCard(agentId: string): Promise<AgentCard>`

Generate an A2A agent card from on-chain identity.

#### `registerAgent(account: Account, metadata: AgentMetadata): Promise<string>`

Register a new agent on-chain. Returns transaction hash.

#### `createTaskFromTransaction(txHash: string, prompt: string): Task`

Create a task tracker for a Starknet transaction.

#### `getTaskStatus(taskId: string): Promise<Task>`

Get current status of a task by checking transaction state.

#### `generateWellKnownAgentJson(agentId: string, baseUrl: string): Promise<object>`

Generate /.well-known/agent.json content for agent discovery.

## Example: Express Server

```typescript
import express from "express";
import { createStarknetA2AAdapter } from "@starknet-agentic/a2a";

const app = express();
const adapter = createStarknetA2AAdapter({ ... });

// Serve agent card
app.get("/.well-known/agent.json", async (req, res) => {
  const agentJson = await adapter.generateWellKnownAgentJson(
    process.env.AGENT_ID,
    "https://myagent.com"
  );
  res.json(agentJson);
});

// Task status endpoint
app.get("/api/tasks/:id", async (req, res) => {
  const task = await adapter.getTaskStatus(req.params.id);
  res.json(task);
});

app.listen(3000);
```

## Future Enhancements

- [ ] Agent discovery via indexer integration
- [ ] Streaming task updates via Server-Sent Events
- [ ] Multi-agent task coordination
- [ ] Payment channel integration for A2A micropayments
- [ ] Cross-chain agent identity bridging

## Resources

- [A2A Protocol Specification](https://a2a-protocol.org/latest/)
- [ERC-8004 Standard](https://eips.ethereum.org/EIPS/eip-8004)
- [Starknet Documentation](https://docs.starknet.io/)

## License

MIT
