# create-starknet-agent Technical Specification

Technical architecture and implementation specification for scaffolded Starknet agents.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Configuration System](#configuration-system)
5. [Agent Runtime](#agent-runtime)
6. [MCP Integration](#mcp-integration)
7. [Skill System](#skill-system)
8. [LLM Provider Layer](#llm-provider-layer)
9. [Web UI](#web-ui)
10. [Storage Layer](#storage-layer)
11. [API Specification](#api-specification)
12. [Security Model](#security-model)
13. [Deployment](#deployment)

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Scaffolded Agent Process                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│  │   Web UI    │◄──►│ HTTP/WS     │◄──►│   Agent     │                │
│  │  (Next.js)  │    │  Server     │    │   Runtime   │                │
│  └─────────────┘    └─────────────┘    └──────┬──────┘                │
│                                               │                         │
│                     ┌─────────────────────────┼─────────────────────┐  │
│                     │                         │                     │  │
│               ┌─────▼─────┐           ┌───────▼───────┐            │  │
│               │   Skill   │           │  LLM Provider │            │  │
│               │  Loader   │           │   (Claude/    │            │  │
│               │           │           │  OpenAI/etc)  │            │  │
│               └───────────┘           └───────────────┘            │  │
│                     │                         │                     │  │
│               ┌─────▼─────┐           ┌───────▼───────┐            │  │
│               │  Skills   │           │ Claude Code   │            │  │
│               │ Registry  │           │ CLI (optional)│            │  │
│               └───────────┘           └───────────────┘            │  │
│                                                                     │  │
├─────────────────────────────────────────────────────────────────────┤  │
│                         MCP Client Layer                            │  │
├─────────────────────────────────────────────────────────────────────┤  │
│                              │ stdio                                │  │
└──────────────────────────────┼──────────────────────────────────────┘  │
                               │                                         │
                    ┌──────────▼──────────┐                             │
                    │  MCP Server Sidecar │                             │
                    │ (starknet-mcp-server)│                             │
                    └──────────┬──────────┘                             │
                               │                                         │
                    ┌──────────▼──────────┐                             │
                    │   Starknet RPC      │                             │
                    │   (Mainnet/Sepolia) │                             │
                    └─────────────────────┘                             │
```

### Design Principles

1. **Single Process Deployment**: Agent, server, and UI run in one process for simplicity
2. **MCP Sidecar Pattern**: MCP server runs as subprocess, communicating via stdio
3. **Provider Agnostic**: LLM layer abstracts Claude, OpenAI, Ollama, and Claude Code CLI
4. **Skill-Driven Behavior**: Agent capabilities determined by loaded skills
5. **Event-Driven Loop**: Agent reacts to events (chat, on-chain, scheduled) not polling
6. **Local-First Storage**: SQLite for persistence, no external database required
7. **Configuration as Code**: `agent.config.ts` is the single source of truth

---

## Project Structure

### Directory Layout

```
my-agent/
├── src/
│   ├── index.ts                    # Application entry point
│   │
│   ├── agent/
│   │   ├── index.ts                # Agent module exports
│   │   ├── runtime.ts              # Agent lifecycle (init, start, stop)
│   │   ├── loop.ts                 # Event loop and task scheduler
│   │   ├── reasoning.ts            # LLM-based decision making
│   │   ├── actions.ts              # Action execution (MCP tool calls)
│   │   ├── state.ts                # Agent state machine
│   │   └── types.ts                # Agent-specific types
│   │
│   ├── server/
│   │   ├── index.ts                # Server initialization
│   │   ├── app.ts                  # Express/Fastify app setup
│   │   ├── routes/
│   │   │   ├── api.ts              # REST API routes (/api/*)
│   │   │   ├── ws.ts               # WebSocket handlers
│   │   │   └── wellknown.ts        # /.well-known/agent.json
│   │   └── middleware/
│   │       ├── auth.ts             # Authentication (optional)
│   │       ├── logging.ts          # Request logging
│   │       └── error.ts            # Error handling
│   │
│   ├── mcp/
│   │   ├── index.ts                # MCP module exports
│   │   ├── client.ts               # MCP client implementation
│   │   ├── sidecar.ts              # Subprocess management
│   │   └── types.ts                # MCP-specific types
│   │
│   ├── skills/
│   │   ├── index.ts                # Skills module exports
│   │   ├── loader.ts               # Skill discovery and loading
│   │   ├── registry.ts             # Active skill management
│   │   ├── parser.ts               # SKILL.md frontmatter parser
│   │   └── installed/              # Downloaded skills
│   │       └── .gitkeep
│   │
│   ├── llm/
│   │   ├── index.ts                # LLM module exports
│   │   ├── provider.ts             # Provider interface
│   │   ├── factory.ts              # Provider factory
│   │   ├── providers/
│   │   │   ├── claude.ts           # Anthropic Claude provider
│   │   │   ├── openai.ts           # OpenAI provider
│   │   │   ├── ollama.ts           # Ollama (local) provider
│   │   │   └── claude-code.ts      # Claude Code CLI provider
│   │   └── types.ts                # LLM-specific types
│   │
│   ├── storage/
│   │   ├── index.ts                # Storage module exports
│   │   ├── database.ts             # SQLite connection management
│   │   ├── repositories/
│   │   │   ├── conversations.ts    # Conversation CRUD
│   │   │   ├── messages.ts         # Message CRUD
│   │   │   ├── transactions.ts     # Transaction history
│   │   │   ├── skills.ts           # Skill metadata
│   │   │   └── events.ts           # Event log
│   │   └── migrations/
│   │       ├── 001_initial.sql     # Initial schema
│   │       └── index.ts            # Migration runner
│   │
│   ├── identity/
│   │   ├── index.ts                # Identity module exports
│   │   ├── registry.ts             # ERC-8004 registry client
│   │   ├── a2a.ts                  # A2A agent card generation
│   │   └── types.ts                # Identity types
│   │
│   └── utils/
│       ├── config.ts               # Configuration loader
│       ├── logger.ts               # Structured logger
│       ├── starknet.ts             # Starknet helpers
│       └── env.ts                  # Environment variable helpers
│
├── ui/                             # Next.js 15 application
│   ├── app/
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Dashboard (/)
│   │   ├── chat/
│   │   │   └── page.tsx            # Chat interface
│   │   ├── transactions/
│   │   │   └── page.tsx            # Transaction history
│   │   ├── skills/
│   │   │   └── page.tsx            # Skill management
│   │   ├── settings/
│   │   │   └── page.tsx            # Settings
│   │   └── api/                    # Next.js API routes (proxy)
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── MessageList.tsx
│   │   │   └── MessageInput.tsx
│   │   ├── dashboard/
│   │   │   ├── BalanceCard.tsx
│   │   │   ├── StatusIndicator.tsx
│   │   │   └── RecentTransactions.tsx
│   │   └── shared/
│   │       ├── Sidebar.tsx
│   │       ├── Header.tsx
│   │       └── Button.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useAgent.ts
│   │   └── useBalances.ts
│   ├── lib/
│   │   ├── api.ts                  # API client
│   │   └── ws.ts                   # WebSocket client
│   ├── public/
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── data/                           # Runtime data (gitignored)
│   ├── agent.db                    # SQLite database
│   ├── logs/
│   │   └── agent.log               # Application logs
│   └── sessions/                   # Claude Code CLI sessions
│
├── agent.config.ts                 # Agent configuration
├── .env.example                    # Environment template
├── .env                            # Local environment (gitignored)
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── CLAUDE.md                       # Customization guide
└── README.md                       # Getting started
```

---

## Core Components

### Entry Point (`src/index.ts`)

```typescript
import { createAgent, createServer, loadConfig } from './lib';

async function main() {
  // Load and validate configuration
  const config = await loadConfig();

  // Initialize agent runtime
  const agent = await createAgent(config);

  // Create HTTP/WebSocket server
  const server = await createServer(config, agent);

  // Start agent loop
  await agent.start();

  // Start server
  await server.listen(config.server.port);

  console.log(`Agent running at http://localhost:${config.server.port}`);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await agent.stop();
    await server.close();
    process.exit(0);
  });
}

main().catch(console.error);
```

### Agent Runtime (`src/agent/runtime.ts`)

```typescript
import { EventEmitter } from 'events';
import type { AgentConfig, AgentState, AgentEvent } from './types';

export class AgentRuntime extends EventEmitter {
  private state: AgentState = 'idle';
  private eventQueue: AgentEvent[] = [];
  private mcpClient: MCPClient;
  private llmProvider: LLMProvider;
  private skillRegistry: SkillRegistry;
  private storage: Storage;

  constructor(config: AgentConfig) {
    super();
    // Initialize components
  }

  async start(): Promise<void> {
    // 1. Connect to MCP server
    await this.mcpClient.connect();

    // 2. Load enabled skills
    await this.skillRegistry.loadSkills(this.config.skills);

    // 3. Start event loop
    this.startEventLoop();

    // 4. Start scheduled tasks
    this.startScheduler();

    // 5. Register on-chain identity (if configured)
    if (this.config.identity?.autoRegister) {
      await this.registerIdentity();
    }

    this.state = 'running';
    this.emit('started');
  }

  async stop(): Promise<void> {
    this.state = 'stopping';
    await this.mcpClient.disconnect();
    this.emit('stopped');
  }

  async handleEvent(event: AgentEvent): Promise<void> {
    this.state = 'thinking';
    this.emit('thinking', event);

    try {
      // 1. Get relevant skill context
      const skillContext = await this.skillRegistry.getContextForEvent(event);

      // 2. Query LLM for decision
      const decision = await this.llmProvider.decide({
        event,
        skillContext,
        agentState: this.getState(),
        availableTools: this.mcpClient.listTools(),
      });

      // 3. Execute actions
      this.state = 'executing';
      this.emit('executing', decision);

      for (const action of decision.actions) {
        const result = await this.mcpClient.callTool(action.tool, action.args);
        await this.storage.logAction(action, result);
      }

      // 4. Generate response
      const response = await this.llmProvider.generateResponse({
        event,
        decision,
        results: decision.actions.map(a => a.result),
      });

      this.emit('response', response);
    } catch (error) {
      this.state = 'error';
      this.emit('error', error);
    } finally {
      this.state = 'idle';
    }
  }

  // Queue management
  pushEvent(event: AgentEvent): void {
    this.eventQueue.push(event);
    this.emit('event', event);
  }

  getState(): AgentState {
    return this.state;
  }
}
```

---

## Configuration System

### Schema Definition (`agent.config.ts`)

```typescript
import { z } from 'zod';

// Network configuration
const NetworkConfigSchema = z.object({
  name: z.enum(['mainnet', 'sepolia', 'custom']).default('sepolia'),
  rpcUrl: z.string().url(),
  chainId: z.string().optional(),
});

// Wallet configuration
const WalletConfigSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{1,64}$/),
  privateKey: z.string().regex(/^0x[a-fA-F0-9]{1,64}$/),
});

// LLM provider configuration
const LLMConfigSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('claude'),
    model: z.string().default('claude-sonnet-4-20250514'),
    apiKey: z.string(),
    maxTokens: z.number().default(4096),
  }),
  z.object({
    provider: z.literal('openai'),
    model: z.string().default('gpt-4-turbo'),
    apiKey: z.string(),
    maxTokens: z.number().default(4096),
  }),
  z.object({
    provider: z.literal('ollama'),
    model: z.string().default('llama3'),
    baseUrl: z.string().url().default('http://localhost:11434'),
  }),
  z.object({
    provider: z.literal('claude-code'),
    sessionDir: z.string().default('./data/sessions'),
    allowedTools: z.array(z.string()).default(['Read', 'Grep', 'Glob']),
  }),
]);

// Skill configuration
const SkillConfigSchema = z.union([
  z.string(), // Skill name (from starknet-agentic)
  z.object({
    name: z.string(),
    url: z.string().url(), // GitHub URL
    config: z.record(z.unknown()).optional(),
  }),
]);

// Identity configuration
const IdentityConfigSchema = z.object({
  enabled: z.boolean().default(false),
  registryAddress: z.string().optional(),
  autoRegister: z.boolean().default(false),
  metadata: z.object({
    agentType: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
  }).optional(),
}).optional();

// A2A configuration
const A2AConfigSchema = z.object({
  enabled: z.boolean().default(true),
  endpoint: z.string().url().optional(),
}).optional();

// Server configuration
const ServerConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('0.0.0.0'),
  cors: z.object({
    enabled: z.boolean().default(true),
    origins: z.array(z.string()).default(['*']),
  }).optional(),
});

// Scheduled task configuration
const ScheduledTaskSchema = z.object({
  name: z.string(),
  cron: z.string(), // Cron expression
  handler: z.string().optional(), // Custom handler function name
  enabled: z.boolean().default(true),
});

// Loop configuration
const LoopConfigSchema = z.object({
  scheduled: z.array(ScheduledTaskSchema).default([]),
  events: z.array(z.enum(['transfer', 'swap', 'contract_call'])).default([]),
  pollingInterval: z.number().default(60000), // ms
});

// Storage configuration
const StorageConfigSchema = z.object({
  type: z.enum(['sqlite', 'memory']).default('sqlite'),
  path: z.string().default('./data/agent.db'),
});

// Logging configuration
const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty']).default('json'),
  file: z.string().optional(),
});

// Full configuration schema
export const AgentConfigSchema = z.object({
  // Agent metadata
  agent: z.object({
    name: z.string(),
    description: z.string().optional(),
    version: z.string().default('1.0.0'),
  }),

  // Core configuration
  network: NetworkConfigSchema,
  wallet: WalletConfigSchema,
  llm: LLMConfigSchema,

  // Features
  skills: z.array(SkillConfigSchema).default([]),
  identity: IdentityConfigSchema,
  a2a: A2AConfigSchema,

  // Infrastructure
  server: ServerConfigSchema,
  loop: LoopConfigSchema,
  storage: StorageConfigSchema,
  logging: LoggingConfigSchema,
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// Helper for type-safe config definition
export function defineConfig(config: AgentConfig): AgentConfig {
  return AgentConfigSchema.parse(config);
}
```

### Environment Variable Mapping

| Config Path | Environment Variable | Required | Default |
|-------------|---------------------|----------|---------|
| `network.rpcUrl` | `STARKNET_RPC_URL` | Yes | - |
| `wallet.address` | `STARKNET_ACCOUNT_ADDRESS` | Yes | - |
| `wallet.privateKey` | `STARKNET_PRIVATE_KEY` | Yes | - |
| `llm.apiKey` (Claude) | `ANTHROPIC_API_KEY` | If Claude | - |
| `llm.apiKey` (OpenAI) | `OPENAI_API_KEY` | If OpenAI | - |
| `identity.registryAddress` | `IDENTITY_REGISTRY_ADDRESS` | No | Deployed address |
| `server.port` | `PORT` | No | 3000 |

### Config Presets

```typescript
// presets/minimal.ts
export const minimalPreset: Partial<AgentConfig> = {
  skills: ['starknet-wallet'],
  loop: {
    scheduled: [
      { name: 'balance-check', cron: '*/10 * * * *' },
    ],
    events: ['transfer'],
  },
};

// presets/defi.ts
export const defiPreset: Partial<AgentConfig> = {
  skills: ['starknet-wallet', 'starknet-defi'],
  loop: {
    scheduled: [
      { name: 'balance-check', cron: '*/5 * * * *' },
      { name: 'price-monitor', cron: '* * * * *' },
      { name: 'arb-scan', cron: '*/2 * * * *' },
    ],
    events: ['transfer', 'swap'],
  },
};

// presets/researcher.ts
export const researcherPreset: Partial<AgentConfig> = {
  skills: ['starknet-wallet', 'starknet-identity'],
  loop: {
    scheduled: [
      { name: 'data-collection', cron: '0 * * * *' },
    ],
    events: [],
  },
};
```

---

## Agent Runtime

### State Machine

```
                    ┌─────────┐
                    │  INIT   │
                    └────┬────┘
                         │ start()
                         ▼
          ┌──────────────────────────────┐
          │                              │
          │  ┌────────┐     ┌────────┐  │
    ┌────►│  │  IDLE  │◄───►│THINKING│  │◄────┐
    │     │  └───┬────┘     └────┬───┘  │     │
    │     │      │               │      │     │
    │     │      │   ┌───────────┘      │     │
    │     │      │   │                  │     │
    │     │      ▼   ▼                  │     │
    │     │  ┌──────────┐               │     │
    │     │  │EXECUTING │               │     │
    │     │  └────┬─────┘               │     │
    │     │       │                     │     │
    │     └───────┼─────────────────────┘     │
    │             │                           │
    │             │ error                     │ recovery
    │             ▼                           │
    │       ┌─────────┐                       │
    │       │  ERROR  │───────────────────────┘
    │       └─────────┘
    │
    │ stop()
    │
    ▼
┌─────────┐
│ STOPPED │
└─────────┘
```

### Event Types

```typescript
// Chat message from user
interface ChatEvent {
  type: 'chat';
  conversationId: string;
  message: string;
  userId?: string;
  timestamp: number;
}

// Scheduled task trigger
interface ScheduledEvent {
  type: 'scheduled';
  taskId: string;
  taskName: string;
  timestamp: number;
}

// On-chain event (detected via RPC polling or subscription)
interface OnChainEvent {
  type: 'onchain';
  eventType: 'transfer' | 'swap' | 'contract_call';
  blockNumber: number;
  transactionHash: string;
  data: {
    from?: string;
    to?: string;
    amount?: string;
    token?: string;
  };
  timestamp: number;
}

// External webhook
interface WebhookEvent {
  type: 'webhook';
  source: string;
  endpoint: string;
  payload: unknown;
  timestamp: number;
}

type AgentEvent = ChatEvent | ScheduledEvent | OnChainEvent | WebhookEvent;
```

### Decision Flow

```typescript
interface DecisionContext {
  event: AgentEvent;
  skillContext: string;        // Combined SKILL.md content
  agentState: AgentSnapshot;   // Current balances, pending tx, etc.
  availableTools: Tool[];      // MCP tools filtered by skill permissions
  conversationHistory: Message[];
}

interface Decision {
  reasoning: string;           // Agent's thought process
  actions: Action[];           // MCP tool calls to execute
  response: string;            // Message to show user
  confidence: number;          // 0-1 confidence score
}

interface Action {
  tool: string;                // MCP tool name
  args: Record<string, unknown>;
  expectedOutcome: string;
}
```

---

## MCP Integration

### Sidecar Management

```typescript
import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class MCPSidecar {
  private process: ChildProcess | null = null;
  private client: Client | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(private config: MCPConfig) {}

  async connect(): Promise<void> {
    // Spawn MCP server process
    this.process = spawn('npx', ['@starknet-agentic/mcp-server'], {
      env: {
        ...process.env,
        STARKNET_RPC_URL: this.config.rpcUrl,
        STARKNET_ACCOUNT_ADDRESS: this.config.accountAddress,
        STARKNET_PRIVATE_KEY: this.config.privateKey,
      },
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    // Create MCP client with stdio transport
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['@starknet-agentic/mcp-server'],
      env: { /* ... */ },
    });

    this.client = new Client({
      name: 'starknet-agent',
      version: '1.0.0',
    }, {
      capabilities: {},
    });

    await this.client.connect(transport);

    // Handle process exit
    this.process.on('exit', (code) => {
      if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnect();
      }
    });
  }

  async disconnect(): Promise<void> {
    await this.client?.close();
    this.process?.kill();
  }

  async listTools(): Promise<Tool[]> {
    const response = await this.client!.listTools();
    return response.tools;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const response = await this.client!.callTool({
      name,
      arguments: args,
    });

    return {
      success: !response.isError,
      content: response.content,
      error: response.isError ? response.content[0]?.text : undefined,
    };
  }

  private async reconnect(): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();
  }
}
```

### Available Tools

The MCP server exposes these tools (from `@starknet-agentic/mcp-server`):

| Tool | Description | Arguments |
|------|-------------|-----------|
| `starknet_get_balance` | Get single token balance | `token`, `address?` |
| `starknet_get_balances` | Get multiple token balances | `tokens`, `address?` |
| `starknet_transfer` | Transfer tokens | `recipient`, `token`, `amount`, `gasfree?` |
| `starknet_call_contract` | Read-only contract call | `contract`, `method`, `args` |
| `starknet_invoke_contract` | State-changing call | `contract`, `method`, `args`, `gasfree?` |
| `starknet_swap` | Token swap via AVNU | `sellToken`, `buyToken`, `amount`, `slippage?` |
| `starknet_get_quote` | Get swap quote | `sellToken`, `buyToken`, `amount` |
| `starknet_estimate_fee` | Estimate transaction fee | `calls` |
| `starknet_deploy_agent_account` | Deploy agent account | `publicKey`, `salt?` |
| `starknet_register_agent` | Register on ERC-8004 | `tokenUri`, `metadata?` |
| `starknet_set_agent_metadata` | Set agent metadata | `agentId`, `key`, `value` |
| `starknet_get_agent_metadata` | Get agent metadata | `agentId`, `key` |

---

## Skill System

### Skill Manifest Format

```yaml
# SKILL.md
---
name: starknet-custom-skill
description: Description of what this skill enables
license: Apache-2.0
metadata:
  author: your-name
  version: "1.0.0"
  org: your-org
keywords:
  - starknet
  - custom
  - feature
allowed-tools:
  - starknet_get_balance
  - starknet_transfer
  - starknet_swap
user-invocable: true
---

# Skill Title

Skill content in markdown...

## When to Use This Skill

Use this skill when the user wants to...

## Available Operations

### Operation 1
Description and examples...

### Operation 2
Description and examples...

## Error Handling

Common errors and how to handle them...
```

### Skill Registry

```typescript
interface Skill {
  name: string;
  description: string;
  version: string;
  keywords: string[];
  allowedTools: string[];
  content: string;          // Full markdown content
  source: 'local' | 'github';
  sourceUrl?: string;
  installedAt: Date;
  enabled: boolean;
}

export class SkillRegistry {
  private skills: Map<string, Skill> = new Map();
  private storage: Storage;

  async loadSkills(skillConfigs: SkillConfig[]): Promise<void> {
    for (const config of skillConfigs) {
      const skill = await this.loadSkill(config);
      this.skills.set(skill.name, skill);
    }
  }

  async loadSkill(config: SkillConfig): Promise<Skill> {
    if (typeof config === 'string') {
      // Load from starknet-agentic repo
      return this.loadFromStarknetAgentic(config);
    } else {
      // Load from custom URL
      return this.loadFromGitHub(config.url);
    }
  }

  getContextForEvent(event: AgentEvent): string {
    // Find relevant skills based on event type and keywords
    const relevantSkills = this.findRelevantSkills(event);

    // Combine skill content
    return relevantSkills
      .map(s => `## Skill: ${s.name}\n\n${s.content}`)
      .join('\n\n---\n\n');
  }

  getAllowedTools(): string[] {
    // Union of all enabled skills' allowed tools
    return [...new Set(
      Array.from(this.skills.values())
        .filter(s => s.enabled)
        .flatMap(s => s.allowedTools)
    )];
  }

  private findRelevantSkills(event: AgentEvent): Skill[] {
    const keywords = this.extractKeywords(event);
    return Array.from(this.skills.values())
      .filter(s => s.enabled)
      .filter(s => s.keywords.some(k => keywords.includes(k)))
      .slice(0, 3); // Limit to top 3 relevant skills
  }

  private extractKeywords(event: AgentEvent): string[] {
    if (event.type === 'chat') {
      return event.message.toLowerCase().split(/\s+/);
    }
    // Extract keywords from other event types
    return [];
  }
}
```

### Skill Loader

```typescript
export class SkillLoader {
  private cache: Map<string, { skill: Skill; hash: string }> = new Map();

  async loadFromStarknetAgentic(skillName: string): Promise<Skill> {
    const url = `https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/${skillName}/SKILL.md`;
    return this.loadFromUrl(url);
  }

  async loadFromGitHub(url: string): Promise<Skill> {
    // Convert GitHub URL to raw content URL
    const rawUrl = this.toRawUrl(url);
    return this.loadFromUrl(rawUrl);
  }

  private async loadFromUrl(url: string): Promise<Skill> {
    const response = await fetch(url);
    const content = await response.text();

    // Parse frontmatter
    const { frontmatter, body } = this.parseFrontmatter(content);

    return {
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.metadata?.version || '1.0.0',
      keywords: frontmatter.keywords || [],
      allowedTools: frontmatter['allowed-tools'] || [],
      content: body,
      source: 'github',
      sourceUrl: url,
      installedAt: new Date(),
      enabled: true,
    };
  }

  private parseFrontmatter(content: string): { frontmatter: any; body: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      return { frontmatter: {}, body: content };
    }

    const yaml = require('yaml');
    return {
      frontmatter: yaml.parse(match[1]),
      body: match[2].trim(),
    };
  }

  private toRawUrl(url: string): string {
    // github.com/owner/repo/blob/main/path -> raw.githubusercontent.com/owner/repo/main/path
    return url
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');
  }
}
```

---

## LLM Provider Layer

### Provider Interface

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tools?: Tool[];
  toolChoice?: 'auto' | 'required' | 'none';
}

export interface ChatResponse {
  message: Message;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason: 'stop' | 'tool_use' | 'max_tokens';
}

export interface LLMProvider {
  name: string;

  // Basic chat
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;

  // Streaming chat
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<string>;

  // Chat with tool calling
  chatWithTools(
    messages: Message[],
    tools: Tool[],
    options?: ChatOptions
  ): Promise<ChatResponse>;

  // Session management (for Claude Code CLI)
  createSession?(): Promise<string>;
  resumeSession?(sessionId: string): Promise<void>;
  getSessionId?(): string | undefined;
}
```

### Claude Code CLI Provider

```typescript
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

export class ClaudeCodeProvider implements LLMProvider {
  name = 'claude-code';
  private sessionId?: string;
  private sessionDir: string;
  private allowedTools: string[];

  constructor(config: ClaudeCodeConfig) {
    this.sessionDir = config.sessionDir;
    this.allowedTools = config.allowedTools;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      throw new Error('Last message must be from user');
    }

    const args = [
      '-p', lastMessage.content,
      '--output-format', 'json',
    ];

    if (this.sessionId) {
      args.push('--session-id', this.sessionId);
    }

    if (this.allowedTools.length > 0) {
      args.push('--allowedTools', this.allowedTools.join(','));
    }

    const result = await this.runClaudeCode(args);
    return this.parseResponse(result);
  }

  async chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<string> {
    const lastMessage = messages[messages.length - 1];

    const args = [
      '-p', lastMessage.content,
      '--output-format', 'stream-json',
    ];

    if (this.sessionId) {
      args.push('--session-id', this.sessionId);
    }

    yield* this.streamClaudeCode(args);
  }

  async createSession(): Promise<string> {
    this.sessionId = randomUUID();
    return this.sessionId;
  }

  async resumeSession(sessionId: string): Promise<void> {
    this.sessionId = sessionId;
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  private async runClaudeCode(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', args, {
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Claude Code exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private async *streamClaudeCode(args: string[]): AsyncIterable<string> {
    const proc = spawn('claude', args, {
      env: { ...process.env },
    });

    for await (const chunk of proc.stdout) {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'text') {
              yield parsed.content;
            }
          } catch {
            yield line;
          }
        }
      }
    }
  }

  private parseResponse(output: string): ChatResponse {
    const parsed = JSON.parse(output);
    return {
      message: {
        role: 'assistant',
        content: parsed.result || parsed.content || '',
      },
      usage: {
        inputTokens: parsed.usage?.input_tokens || 0,
        outputTokens: parsed.usage?.output_tokens || 0,
      },
      finishReason: 'stop',
    };
  }
}
```

### Provider Factory

```typescript
export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'claude':
      return new ClaudeProvider({
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
      });

    case 'openai':
      return new OpenAIProvider({
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
      });

    case 'ollama':
      return new OllamaProvider({
        baseUrl: config.baseUrl,
        model: config.model,
      });

    case 'claude-code':
      return new ClaudeCodeProvider({
        sessionDir: config.sessionDir,
        allowedTools: config.allowedTools,
      });

    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
```

---

## Web UI

### Component Structure

```
ui/
├── app/
│   ├── layout.tsx          # Root layout with sidebar
│   ├── page.tsx            # Dashboard
│   ├── chat/page.tsx       # Chat interface
│   ├── transactions/page.tsx
│   ├── skills/page.tsx
│   └── settings/page.tsx
│
├── components/
│   ├── chat/
│   │   ├── ChatInterface.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── MessageInput.tsx
│   │   └── TypingIndicator.tsx
│   │
│   ├── dashboard/
│   │   ├── BalanceCard.tsx
│   │   ├── StatusIndicator.tsx
│   │   ├── RecentTransactions.tsx
│   │   ├── ActivityTimeline.tsx
│   │   └── QuickActions.tsx
│   │
│   ├── skills/
│   │   ├── SkillCard.tsx
│   │   ├── SkillList.tsx
│   │   ├── SkillDetails.tsx
│   │   └── SkillMarketplace.tsx
│   │
│   └── shared/
│       ├── Sidebar.tsx
│       ├── Header.tsx
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Modal.tsx
│       └── Loading.tsx
│
├── hooks/
│   ├── useWebSocket.ts     # WebSocket connection
│   ├── useAgent.ts         # Agent state and actions
│   ├── useBalances.ts      # Token balances
│   ├── useTransactions.ts  # Transaction history
│   └── useSkills.ts        # Skill management
│
└── lib/
    ├── api.ts              # REST API client
    ├── ws.ts               # WebSocket client
    └── types.ts            # Shared types
```

### WebSocket Protocol

```typescript
// Client -> Server messages
type ClientMessage =
  | { type: 'chat'; message: string; conversationId?: string }
  | { type: 'subscribe'; channels: string[] }
  | { type: 'unsubscribe'; channels: string[] }
  | { type: 'ping' };

// Server -> Client messages
type ServerMessage =
  | { type: 'chat_response'; message: string; conversationId: string }
  | { type: 'agent_state'; state: AgentState }
  | { type: 'balance_update'; balances: TokenBalance[] }
  | { type: 'transaction'; transaction: Transaction }
  | { type: 'log'; level: string; message: string; timestamp: number }
  | { type: 'error'; error: string }
  | { type: 'pong' };

// Channels
type Channel =
  | 'agent'        // Agent state changes
  | 'balances'     // Balance updates
  | 'transactions' // New transactions
  | 'logs';        // Log stream
```

### Chat Interface Component

```tsx
// ui/components/chat/ChatInterface.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubscribe = subscribe('chat_response', (data) => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        timestamp: Date.now(),
      }]);
      setIsTyping(false);
    });

    return unsubscribe;
  }, [subscribe]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (content: string) => {
    setMessages(prev => [...prev, {
      role: 'user',
      content,
      timestamp: Date.now(),
    }]);
    setIsTyping(true);
    sendMessage({ type: 'chat', message: content });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={messages} />
        {isTyping && <TypingIndicator />}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-4">
        <MessageInput onSend={handleSend} disabled={isTyping} />
      </div>
    </div>
  );
}
```

---

## Storage Layer

### Database Schema

```sql
-- 001_initial.sql

-- Conversations
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_calls TEXT, -- JSON array of tool calls
  tool_call_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);

-- Transactions
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  hash TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('transfer', 'swap', 'invoke', 'deploy')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'failed')),
  from_address TEXT NOT NULL,
  to_address TEXT,
  amount TEXT,
  token TEXT,
  gas_used TEXT,
  gas_price TEXT,
  block_number INTEGER,
  error TEXT,
  metadata TEXT, -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  confirmed_at INTEGER
);

CREATE INDEX idx_transactions_hash ON transactions(hash);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at);

-- Skills
CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('local', 'github')),
  source_url TEXT,
  content_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT, -- JSON
  installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Events
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload TEXT NOT NULL, -- JSON
  processed INTEGER NOT NULL DEFAULT 0,
  result TEXT, -- JSON
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  processed_at INTEGER
);

CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_processed ON events(processed);

-- Agent state (key-value store)
CREATE TABLE agent_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Logs
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  component TEXT,
  metadata TEXT, -- JSON
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_logs_level ON logs(level);
CREATE INDEX idx_logs_created ON logs(created_at);
```

### Repository Pattern

```typescript
// src/storage/repositories/transactions.ts
import type { Database } from 'better-sqlite3';

export interface Transaction {
  id: string;
  hash: string;
  type: 'transfer' | 'swap' | 'invoke' | 'deploy';
  status: 'pending' | 'confirmed' | 'failed';
  fromAddress: string;
  toAddress?: string;
  amount?: string;
  token?: string;
  gasUsed?: string;
  gasPrice?: string;
  blockNumber?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  confirmedAt?: Date;
}

export class TransactionRepository {
  constructor(private db: Database) {}

  create(tx: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const id = randomUUID();
    const createdAt = Date.now();

    this.db.prepare(`
      INSERT INTO transactions (id, hash, type, status, from_address, to_address, amount, token, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      tx.hash,
      tx.type,
      tx.status,
      tx.fromAddress,
      tx.toAddress,
      tx.amount,
      tx.token,
      JSON.stringify(tx.metadata),
      createdAt
    );

    return this.findById(id)!;
  }

  findById(id: string): Transaction | null {
    const row = this.db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    return row ? this.mapRow(row) : null;
  }

  findByHash(hash: string): Transaction | null {
    const row = this.db.prepare('SELECT * FROM transactions WHERE hash = ?').get(hash);
    return row ? this.mapRow(row) : null;
  }

  findAll(options: { limit?: number; offset?: number; status?: string } = {}): Transaction[] {
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    return this.db.prepare(query).all(...params).map(this.mapRow);
  }

  updateStatus(hash: string, status: string, extra?: Partial<Transaction>): void {
    const updates = ['status = ?'];
    const params: any[] = [status];

    if (status === 'confirmed') {
      updates.push('confirmed_at = ?');
      params.push(Date.now());
    }

    if (extra?.blockNumber) {
      updates.push('block_number = ?');
      params.push(extra.blockNumber);
    }

    if (extra?.gasUsed) {
      updates.push('gas_used = ?');
      params.push(extra.gasUsed);
    }

    if (extra?.error) {
      updates.push('error = ?');
      params.push(extra.error);
    }

    params.push(hash);

    this.db.prepare(`UPDATE transactions SET ${updates.join(', ')} WHERE hash = ?`).run(...params);
  }

  private mapRow(row: any): Transaction {
    return {
      id: row.id,
      hash: row.hash,
      type: row.type,
      status: row.status,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      amount: row.amount,
      token: row.token,
      gasUsed: row.gas_used,
      gasPrice: row.gas_price,
      blockNumber: row.block_number,
      error: row.error,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at * 1000),
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at * 1000) : undefined,
    };
  }
}
```

---

## API Specification

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Agent status and info |
| `GET` | `/api/balances` | Token balances |
| `GET` | `/api/transactions` | Transaction history |
| `GET` | `/api/transactions/:hash` | Single transaction |
| `GET` | `/api/conversations` | Conversation list |
| `GET` | `/api/conversations/:id` | Single conversation with messages |
| `POST` | `/api/conversations` | Start new conversation |
| `GET` | `/api/skills` | Installed skills |
| `POST` | `/api/skills` | Install skill |
| `DELETE` | `/api/skills/:name` | Remove skill |
| `GET` | `/api/skills/marketplace` | Browse available skills |
| `GET` | `/api/logs` | Recent logs |
| `GET` | `/api/config` | Current configuration (sensitive fields redacted) |
| `PUT` | `/api/config` | Update configuration |
| `POST` | `/api/agent/start` | Start agent loop |
| `POST` | `/api/agent/stop` | Stop agent loop |
| `GET` | `/.well-known/agent.json` | A2A Agent Card |
| `GET` | `/health` | Health check |

### Request/Response Examples

```typescript
// GET /api/status
interface StatusResponse {
  agent: {
    name: string;
    version: string;
    state: 'idle' | 'thinking' | 'executing' | 'error' | 'stopped';
    uptime: number; // seconds
  };
  network: {
    name: string;
    chainId: string;
    blockNumber: number;
  };
  wallet: {
    address: string;
    // No private key!
  };
  identity?: {
    registered: boolean;
    agentId?: string;
    reputationScore?: number;
  };
  skills: {
    enabled: number;
    total: number;
  };
}

// GET /api/balances
interface BalancesResponse {
  balances: Array<{
    token: string;
    symbol: string;
    balance: string;
    decimals: number;
    usdValue?: number;
  }>;
  totalUsdValue?: number;
  lastUpdated: number;
}

// GET /api/transactions?limit=10&offset=0&status=confirmed
interface TransactionsResponse {
  transactions: Transaction[];
  total: number;
  limit: number;
  offset: number;
}

// POST /api/skills
interface InstallSkillRequest {
  url: string; // GitHub URL to SKILL.md
}

interface InstallSkillResponse {
  skill: Skill;
  installed: boolean;
}
```

### A2A Agent Card

```json
// GET /.well-known/agent.json
{
  "name": "My DeFi Agent",
  "description": "Autonomous DeFi agent for Starknet",
  "version": "1.0.0",
  "url": "https://my-agent.example.com",
  "provider": {
    "organization": "user",
    "url": "https://my-agent.example.com"
  },
  "capabilities": [
    {
      "name": "swap",
      "description": "Execute token swaps via AVNU aggregator",
      "inputSchema": {
        "type": "object",
        "properties": {
          "sellToken": { "type": "string" },
          "buyToken": { "type": "string" },
          "amount": { "type": "string" }
        },
        "required": ["sellToken", "buyToken", "amount"]
      }
    },
    {
      "name": "transfer",
      "description": "Send tokens to addresses",
      "inputSchema": {
        "type": "object",
        "properties": {
          "recipient": { "type": "string" },
          "token": { "type": "string" },
          "amount": { "type": "string" }
        },
        "required": ["recipient", "token", "amount"]
      }
    }
  ],
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "skills": [
    { "id": "starknet-wallet", "name": "Starknet Wallet" },
    { "id": "starknet-defi", "name": "Starknet DeFi" }
  ],
  "authentication": {
    "schemes": ["none"]
  },
  "identity": {
    "chain": "starknet",
    "network": "sepolia",
    "registry": "0x...",
    "tokenId": "123"
  }
}
```

---

## Security Model

### Private Key Handling

1. **Storage**: Private keys ONLY in environment variables, never in config files
2. **Transmission**: Never sent over network, only used in MCP sidecar
3. **Logging**: Never logged, even at debug level
4. **UI**: Never exposed to frontend, even in settings

### Environment Isolation

```typescript
// MCP sidecar receives minimal environment
const mcpEnv = {
  STARKNET_RPC_URL: config.network.rpcUrl,
  STARKNET_ACCOUNT_ADDRESS: config.wallet.address,
  STARKNET_PRIVATE_KEY: config.wallet.privateKey,
  // No other env vars passed through
};
```

### API Security

1. **CORS**: Configurable origins, default to localhost only
2. **Rate Limiting**: 100 requests/minute per IP (configurable)
3. **Input Validation**: Zod schemas on all endpoints
4. **Error Messages**: No stack traces in production

### Skill Sandboxing

1. **Tool Permissions**: Skills can only use tools in their `allowed-tools`
2. **No Code Execution**: Skills are documentation only, no executable code
3. **Content Validation**: SKILL.md frontmatter validated before loading

### Deployment Security

```yaml
# docker-compose.yml security settings
services:
  agent:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - ./data:/app/data:rw  # Only data directory writable
```

---

## Deployment

### Dockerfile

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY ui/package.json ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm build
RUN cd ui && pnpm build

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 agent && \
    adduser --system --uid 1001 agent

# Copy built files
COPY --from=builder --chown=agent:agent /app/dist ./dist
COPY --from=builder --chown=agent:agent /app/ui/.next ./ui/.next
COPY --from=builder --chown=agent:agent /app/ui/public ./ui/public
COPY --from=builder --chown=agent:agent /app/node_modules ./node_modules
COPY --from=builder --chown=agent:agent /app/package.json ./

# Create data directory
RUN mkdir -p /app/data && chown agent:agent /app/data

USER agent

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  agent:
    build: .
    ports:
      - "3000:3000"
    environment:
      - STARKNET_RPC_URL=${STARKNET_RPC_URL}
      - STARKNET_ACCOUNT_ADDRESS=${STARKNET_ACCOUNT_ADDRESS}
      - STARKNET_PRIVATE_KEY=${STARKNET_PRIVATE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped

# Production variant
# docker-compose.prod.yml
version: '3.8'

services:
  agent:
    image: ghcr.io/your-org/your-agent:latest
    ports:
      - "3000:3000"
    env_file:
      - .env.production
    volumes:
      - agent-data:/app/data
    restart: always
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

volumes:
  agent-data:
```

---

## Open Questions

1. **Session Key Integration**: How should we surface Agent Account session key management in the UI? Should it be a separate page or integrated into settings?

2. **Multi-Provider Fallback**: Should we support automatic fallback between LLM providers (e.g., Claude -> OpenAI if Claude fails)?

3. **Skill Versioning**: How should we handle skill version updates? Auto-update, notify user, or manual only?

4. **Plugin System**: Should we allow third-party plugins to extend the UI and agent behavior? If so, what's the sandboxing model?

5. **Hosted Service**: Is there interest in a managed hosting option? How would that affect the architecture?

---

*Last updated: 2026-02-11*
