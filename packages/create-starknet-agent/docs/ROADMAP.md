# create-starknet-agent Roadmap

Feature roadmap for the `create-starknet-agent` CLI tool, providing Starknet capabilities to AI agents across all platforms.

> **Vision**: Any AI agent—whether running on OpenClaw, Claude Code, Daydreams, or a custom runtime—can get Starknet capabilities with a single command. The tool adapts to where you're building.

---

## Prompt Initialization

Hey, I am working to implement features for create-starknet-agent from the roadmap.
After finishing implementing a feature, please provide a concise step-by-step instructions of how I can test it out.
Let's continue with implementing:

---

## Strategic Direction

### Two User Paths

```
┌─────────────────────────────────────────────────────────────────────┐
│              How to get Starknet for your agent                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Already using OpenClaw/MoltBook/Claude Code?  (PRIMARY PATH)       │
│  ──────────────────────────────────────────────                     │
│  → Lightweight integration: skills + MCP config                     │
│  → No scaffolding needed, just config files                         │
│  → Agent can self-install via npx create-starknet-agent             │
│                                                                     │
│  Building a new agent from scratch?  (SECONDARY PATH)               │
│  ─────────────────────────────────────                              │
│  → Full platform scaffold with UI, runtime, skills                  │
│  → For power users who want complete control                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Current State (v0.4.0)

The CLI now provides platform-aware setup with non-interactive mode for agent self-setup and secure credential configuration.

**Completed in v0.2.0**:
- Platform detection (0.1): OpenClaw, Claude Code, Cursor, Daydreams, Generic MCP
- Platform-specific wizards (0.2): Interactive setup for each platform

**Completed in v0.3.0**:
- Agent-initiated setup (0.3): Non-interactive mode with JSON output for agents

**Completed in v0.4.0**:
- Credential setup helpers (0.4): Secure `credentials` subcommand with platform-aware storage

The CLI also scaffolds standalone TypeScript projects with 3 templates:

| Template | Features | Lines |
|----------|----------|-------|
| `minimal` | Balance checks, transfers | 445 |
| `defi` | Minimal + AVNU swaps, monitoring loop | 693 |
| `full` | DeFi + ERC-8004 identity client | 1,091 |

**What's Missing**:
- Platform detection and lightweight integration paths
- Agent-initiated self-setup capability
- Web UI for agent chat/management (standalone mode)
- MCP server integration
- Skill loading/configuration system
- Autonomous agent loop with event handling
- LLM provider integration (Claude, OpenAI, local)
- Claude Code CLI integration for reasoning
- A2A discovery endpoints
- Session key helpers
- Persistence layer (SQLite)
- Docker deployment
- Detailed CLAUDE.md for customization

---

# Phase 0: Platform-Aware Setup (HIGH PRIORITY)

Enable the CLI to detect the user's agent platform and provide the appropriate lightweight setup, including agent-initiated installation.

**Definition of Done**: An OpenClaw agent can run `npx create-starknet-agent@latest` and automatically configure itself with Starknet capabilities.

---

### 0.4 Credential Setup Helpers ✓ COMPLETE (v0.4.0)

**Description**: Provide secure credential setup without exposing private keys in CLI history.

**Requirements**:
- [x] Create `npx create-starknet-agent credentials` subcommand
- [x] Implement secure input mode (no echo, no history)
- [x] Support multiple credential storage backends:
  - OpenClaw: `~/.openclaw/secrets/starknet/<address>.json`
  - Claude Code/Cursor: `.env` file (gitignored)
  - Generic: `.env` or environment variables
- [x] Validate credentials before saving:
  - Check address format (0x + 1-64 hex chars)
  - Check private key format
  - Check RPC URL format
- [x] Add `--from-env` flag to copy from current environment
- [x] Add `--from-ready` / `--from-braavos` with wallet export guide
- [x] Add RPC endpoint input as part of credentials
- [x] Add link to docs for account setup before prompts

**Credential Flow**:
```
$ npx create-starknet-agent credentials

  Don't have a Starknet account? Follow the guide:
  https://www.starknet-agentic.com/docs/getting-started/quick-start#getting-your-credentials

? Starknet RPC URL: https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/YOUR_API_KEY
? Starknet account address: 0x1234...
? Private key: ********** (hidden)

Validating credentials...
✓ Address format valid
✓ Private key format valid
✓ RPC URL format valid

✓ Credentials saved to ~/.openclaw/secrets/starknet/0x1234.json

Your agent can now execute Starknet transactions.
```

---

### 0.5 Verification and Health Check

**Description**: Provide commands to verify the setup is working correctly.

**Requirements**:
- [ ] Create `npx create-starknet-agent verify` subcommand
- [ ] Check MCP server is configured and reachable
- [ ] Check credentials are present (not valid—we don't read private keys)
- [ ] Check skills are installed
- [ ] Attempt a read-only operation (get balance) to verify end-to-end
- [ ] Output detailed status report
- [ ] Return exit code 0 only if fully operational

**Verification Output**:
```
$ npx create-starknet-agent verify

Starknet Agent Setup Verification
══════════════════════════════════

Platform: OpenClaw (MoltBook)

MCP Server
  ✓ Config exists: ~/.openclaw/mcp/starknet.json
  ✓ Server binary: @starknet-agentic/mcp-server@1.2.0
  ✓ Server responds to ping

Credentials
  ✓ Account address configured: 0x1234...abcd
  ✓ Private key present (not validated)
  ✓ RPC URL: https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/YOUR_API_KEY

Skills
  ✓ starknet-wallet (v1.0.0)
  ✓ starknet-defi (v1.0.0)

End-to-End Test
  ✓ Balance query successful
    ETH: 0.1
    STRK: 100.0

Status: READY ✓

Your agent can now use Starknet. Try asking:
  "What's my ETH balance on Starknet?"
  "Swap 0.01 ETH for STRK"
```

---

# Phase 1: MVP (Working E2E)

Core infrastructure to get a basic agent with UI, MCP, and one skill working end-to-end.

**Definition of Done**: User runs `npx create-starknet-agent@latest my-agent`, answers prompts, runs `pnpm start`, and can chat with an autonomous agent that executes Starknet transactions via MCP tools.

---

### 1.1 Project Architecture Overhaul

**Description**: Restructure scaffolded projects from standalone scripts to a proper agent platform with server, UI, and modular components.

**Requirements**:
- [ ] Design new project structure (see target structure below)
- [ ] Create base agent runtime with lifecycle hooks (init, start, stop)
- [ ] Implement HTTP server (Express/Fastify) for API + WebSocket
- [ ] Add process management (graceful shutdown, signal handling)
- [ ] Create configuration system (agent.config.ts with Zod validation)
- [ ] Implement environment variable loading with validation
- [ ] Add startup banner with agent info, network, enabled skills

**Target Project Structure**:
```
my-agent/
├── src/
│   ├── index.ts              # Entry point (starts server + agent)
│   ├── agent/
│   │   ├── runtime.ts        # Agent lifecycle management
│   │   ├── loop.ts           # Event-driven + scheduled task loop
│   │   ├── reasoning.ts      # LLM provider abstraction
│   │   └── actions.ts        # Action execution (MCP tool calls)
│   ├── server/
│   │   ├── index.ts          # HTTP + WebSocket server
│   │   ├── routes/
│   │   │   ├── api.ts        # REST API routes
│   │   │   ├── ws.ts         # WebSocket handlers
│   │   │   └── wellknown.ts  # /.well-known/agent.json
│   │   └── middleware/       # Auth, logging, error handling
│   ├── mcp/
│   │   ├── client.ts         # MCP sidecar management
│   │   └── tools.ts          # Tool registry and execution
│   ├── skills/
│   │   ├── loader.ts         # Skill discovery and loading
│   │   ├── registry.ts       # Active skill management
│   │   └── installed/        # Local skill installations
│   ├── storage/
│   │   ├── index.ts          # Storage abstraction
│   │   ├── sqlite.ts         # SQLite implementation
│   │   └── migrations/       # Database migrations
│   └── utils/
│       ├── logger.ts         # Structured JSON logging
│       ├── config.ts         # Configuration loading
│       └── starknet.ts       # Starknet helpers
├── ui/                       # Next.js 15 Web UI (see 1.3)
├── data/                     # SQLite database, logs
├── agent.config.ts           # Agent configuration
├── .env.example              # Environment template
├── .env                      # Local environment (gitignored)
├── Dockerfile                # Production container
├── docker-compose.yml        # Local development
├── package.json
├── tsconfig.json
├── CLAUDE.md                 # Agent customization guide
└── README.md                 # Getting started
```

**Implementation Notes**:
- Single `pnpm start` command starts everything (server, agent loop, MCP sidecar)
- Server runs on configurable port (default 3000)
- WebSocket for real-time chat and status updates
- Process exits cleanly on SIGINT/SIGTERM

---

### 1.2 MCP Server Sidecar Integration

**Description**: Integrate starknet-mcp-server as a stdio subprocess (sidecar pattern) that the agent uses for Starknet operations.

**Requirements**:
- [ ] Create MCP client that spawns `@starknet-agentic/mcp-server` as child process
- [ ] Implement stdio transport for MCP protocol communication
- [ ] Add tool discovery (list available tools from MCP server)
- [ ] Implement tool execution with timeout and error handling
- [ ] Add connection health monitoring and auto-restart
- [ ] Create tool result parsing and type-safe responses
- [ ] Handle MCP server environment variables (pass through from agent)
- [ ] Add graceful shutdown of MCP subprocess

**MCP Client Interface**:
```typescript
interface MCPClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<Tool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  isConnected(): boolean;
}
```

**Implementation Notes**:
- Use `@modelcontextprotocol/sdk` client for protocol handling
- MCP server binary resolved from node_modules or global install
- Environment variables (RPC_URL, PRIVATE_KEY, etc.) passed to subprocess
- Timeout default: 60 seconds per tool call (configurable)
- Auto-restart on crash with exponential backoff

---

### 1.3 Web UI Foundation (Next.js 15)

**Description**: Create the Web UI for agent chat and management using Next.js 15 with App Router and Tailwind CSS.

**Requirements**:
- [ ] Initialize Next.js 15 app in `ui/` directory
- [ ] Set up Tailwind CSS with dark mode support
- [ ] Create layout with sidebar navigation
- [ ] Implement chat interface component
  - [ ] Message input with send button
  - [ ] Message history display (user + agent messages)
  - [ ] Typing indicators and loading states
  - [ ] Auto-scroll to latest messages
- [ ] Create WebSocket connection manager for real-time updates
- [ ] Implement basic dashboard page showing:
  - [ ] Agent status (running/stopped)
  - [ ] Wallet address and network
  - [ ] Token balances (ETH, STRK, USDC)
  - [ ] Recent transactions (last 10)
- [ ] Add responsive design for mobile
- [ ] Configure proxy to backend API in development

**UI Routes**:
```
/                 # Dashboard (overview, balances, status)
/chat             # Chat interface with agent
/transactions     # Transaction history
/skills           # Installed skills (MVP: read-only list)
/settings         # Agent configuration
```

**Implementation Notes**:
- Use shadcn/ui components for consistent design
- WebSocket connection to `ws://localhost:3000/ws`
- API calls to `/api/*` routes (proxied to backend)
- Dark mode default, toggle in settings

---

### 1.4 LLM Provider Abstraction

**Description**: Create provider-agnostic LLM integration supporting Claude API, OpenAI, local models (Ollama), and Claude Code CLI.

**Requirements**:
- [ ] Design LLMProvider interface with common methods
- [ ] Implement Claude API provider (Anthropic SDK)
- [ ] Implement OpenAI API provider (OpenAI SDK)
- [ ] Implement Ollama provider (local models)
- [ ] Implement Claude Code CLI provider (subprocess with session files)
- [ ] Create provider factory with configuration-based selection
- [ ] Add streaming response support for real-time chat
- [ ] Implement conversation history management
- [ ] Add token counting and cost tracking
- [ ] Handle rate limiting and retries

**LLMProvider Interface**:
```typescript
interface LLMProvider {
  name: string;

  // Core methods
  chat(messages: Message[], options?: ChatOptions): Promise<Response>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<Chunk>;

  // Tool/function calling
  chatWithTools(
    messages: Message[],
    tools: Tool[],
    options?: ChatOptions
  ): Promise<ToolCallResponse>;

  // Session management (for Claude Code CLI)
  createSession?(): Promise<string>;
  resumeSession?(sessionId: string): Promise<void>;
}
```

**Claude Code CLI Integration**:
```typescript
// Spawn Claude Code for complex reasoning
const result = await claudeCodeProvider.chat([
  { role: 'user', content: 'Analyze this arbitrage opportunity and decide if we should execute' }
], {
  sessionId: 'agent-reasoning-session',
  allowedTools: ['Read', 'Bash(curl*)'],  // Restricted tools
});
```

**Implementation Notes**:
- Configuration selects default provider: `llm.provider: 'claude' | 'openai' | 'ollama' | 'claude-code'`
- Claude Code CLI spawned via `claude -p "message" --session-id <id> --output-format json`
- Session files stored in `data/sessions/` for continuations
- Fallback chain: try primary provider, fall back to secondary on failure

---

### 1.5 Basic Agent Loop (Event-Driven + Scheduled)

**Description**: Implement the autonomous agent loop that processes events and runs scheduled tasks.

**Requirements**:
- [ ] Create event queue for incoming tasks (chat messages, on-chain events)
- [ ] Implement scheduled task runner (cron-like intervals)
- [ ] Add agent decision loop:
  1. Receive event/task
  2. Load relevant skill context
  3. Query LLM for decision
  4. Execute MCP tools based on decision
  5. Store result and update state
- [ ] Implement chat message handling (user -> agent -> response)
- [ ] Add basic on-chain event subscription (balance changes, incoming transfers)
- [ ] Create action execution pipeline with confirmation
- [ ] Add error recovery and retry logic
- [ ] Implement agent state machine (idle, thinking, executing, error)

**Event Types**:
```typescript
type AgentEvent =
  | { type: 'chat'; message: string; userId?: string }
  | { type: 'scheduled'; taskId: string; taskName: string }
  | { type: 'onchain'; eventType: 'transfer' | 'swap'; data: unknown }
  | { type: 'webhook'; source: string; payload: unknown };
```

**Implementation Notes**:
- Event queue uses in-memory queue (upgrade to Redis in Phase 2 if needed)
- Default scheduled tasks: balance check (every 5 min), price check (every 1 min for DeFi agents)
- On-chain events via RPC polling initially (WebSocket subscription in Phase 2)
- Action confirmations stored in SQLite for audit trail

---

### 1.6 Skill Loading System

**Description**: Implement skill discovery, loading, and runtime management.

**Requirements**:
- [ ] Create skill manifest parser (SKILL.md YAML frontmatter)
- [ ] Implement local skill loading from `src/skills/installed/`
- [ ] Add GitHub skill fetching (download SKILL.md from repo URL)
- [ ] Create skill registry with activation/deactivation
- [ ] Implement skill context injection into LLM prompts
- [ ] Add skill-specific tool permissions (from `allowed-tools` frontmatter)
- [ ] Create CLI command to add skills: `pnpm skill add <github-url>`
- [ ] Store skill metadata in SQLite

**Skill Loading Flow**:
```
1. Read skills from agent.config.ts (list of skill names/URLs)
2. For each skill:
   a. Check local cache in src/skills/installed/
   b. If missing, fetch from GitHub (parse manifest.json or direct URL)
   c. Parse SKILL.md frontmatter + content
   d. Register in skill registry
3. On agent task:
   a. Determine relevant skills based on task keywords
   b. Inject skill content into LLM system prompt
   c. Filter available MCP tools based on skill permissions
```

**Implementation Notes**:
- Skills stored as `src/skills/installed/<skill-name>/SKILL.md`
- Skill cache invalidation based on GitHub commit hash or manual refresh
- Default skills based on config preset (minimal, defi, etc.)

---

### 1.7 SQLite Persistence Layer

**Description**: Implement SQLite-based storage for agent state, transactions, and logs.

**Requirements**:
- [ ] Set up better-sqlite3 or sql.js for SQLite
- [ ] Create database schema:
  - `conversations` (id, created_at, updated_at)
  - `messages` (id, conversation_id, role, content, tool_calls, created_at)
  - `transactions` (id, hash, type, status, from, to, amount, token, gas, created_at)
  - `skills` (id, name, source_url, content_hash, enabled, installed_at)
  - `events` (id, type, payload, processed, created_at)
  - `config` (key, value, updated_at)
- [ ] Implement migration system for schema changes
- [ ] Create repository pattern for data access
- [ ] Add transaction history queries (with pagination)
- [ ] Implement conversation history retrieval
- [ ] Add data export functionality (JSON dump)

**Implementation Notes**:
- Database file at `data/agent.db`
- Migrations in `src/storage/migrations/`
- Use transactions for multi-table operations
- Index on frequently queried columns (created_at, conversation_id, hash)

---

### 1.8 Interactive CLI Wizard Enhancement

**Description**: Enhance the CLI scaffolder with comprehensive interactive prompts for all new features.

**Requirements**:
- [ ] Redesign prompt flow for new architecture
- [ ] Add config preset selection:
  - `minimal` - Wallet operations only
  - `defi` - DeFi trading, swaps, arbitrage
  - `nft-artist` - NFT minting, marketplace interactions
  - `researcher` - On-chain analysis, data collection
  - `custom` - Pick individual features
- [ ] Add LLM provider selection:
  - Claude API (requires ANTHROPIC_API_KEY)
  - OpenAI API (requires OPENAI_API_KEY)
  - Ollama (local, specify model)
  - Claude Code CLI (requires claude installed)
- [ ] Add skill selection (multi-select based on preset)
- [ ] Add on-chain identity prompt:
  - "Do you want to register your agent on-chain (ERC-8004)?"
  - If yes: collect agent name, description, capabilities
- [ ] Add network selection (mainnet, sepolia, custom RPC)
- [ ] Generate agent.config.ts based on selections
- [ ] Display post-scaffold instructions

**CLI Flow**:
```
$ npx create-starknet-agent@latest my-agent

? Project name: my-agent
? Select a preset:
  > defi - DeFi trading, swaps, arbitrage
    minimal - Wallet operations only
    nft-artist - NFT minting, marketplace
    researcher - On-chain analysis
    custom - Pick individual features

? Select your LLM provider:
  > Claude API
    OpenAI API
    Ollama (local)
    Claude Code CLI

? Select skills to enable: (defi preset defaults)
  [x] starknet-wallet
  [x] starknet-defi
  [ ] starknet-identity
  [ ] starknet-anonymous-wallet

? Register agent on-chain (ERC-8004)? Yes
? Agent name: My DeFi Agent
? Agent description: Autonomous DeFi agent for Starknet

? Network:
  > Sepolia (testnet)
    Mainnet
    Custom RPC

Creating my-agent...
✓ Project structure created
✓ Dependencies installed
✓ Configuration generated
✓ Skills installed

Next steps:
  cd my-agent
  cp .env.example .env
  # Edit .env with your credentials
  pnpm start

Your agent will be available at http://localhost:3000
```

**Implementation Notes**:
- Keep backward compatibility: `--yes` flag uses minimal preset with defaults
- `--preset <name>` flag skips preset prompt
- `--provider <name>` flag skips LLM provider prompt
- Store selections in agent.config.ts, not scattered across files

---

### 1.9 Configuration System (agent.config.ts)

**Description**: Create a centralized, type-safe configuration system for all agent settings.

**Requirements**:
- [ ] Design agent.config.ts schema with Zod
- [ ] Implement config loading with environment variable overrides
- [ ] Add config validation on startup
- [ ] Create default configs for each preset
- [ ] Document all configuration options

**Configuration Schema**:
```typescript
// agent.config.ts
import { defineConfig } from '@starknet-agentic/agent';

export default defineConfig({
  // Agent identity
  agent: {
    name: 'My DeFi Agent',
    description: 'Autonomous DeFi agent for Starknet',
    version: '1.0.0',
  },

  // Network configuration
  network: {
    name: 'sepolia',
    rpcUrl: process.env.STARKNET_RPC_URL,
  },

  // Wallet configuration
  wallet: {
    address: process.env.STARKNET_ACCOUNT_ADDRESS,
    privateKey: process.env.STARKNET_PRIVATE_KEY,
  },

  // LLM provider
  llm: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
    // Alternative: Claude Code CLI
    // provider: 'claude-code',
    // sessionDir: './data/sessions',
  },

  // Enabled skills
  skills: [
    'starknet-wallet',
    'starknet-defi',
    // Custom skill from GitHub
    { url: 'https://github.com/user/repo/skills/custom-skill' },
  ],

  // On-chain identity (optional)
  identity: {
    enabled: true,
    registryAddress: '0x...',
    autoRegister: true,
    metadata: {
      agentType: 'defi',
      capabilities: ['swap', 'transfer', 'monitor'],
    },
  },

  // A2A discovery
  a2a: {
    enabled: true,
    endpoint: 'https://my-agent.example.com',
  },

  // Server configuration
  server: {
    port: 3000,
    host: '0.0.0.0',
  },

  // Agent loop settings
  loop: {
    // Scheduled tasks
    scheduled: [
      { name: 'balance-check', cron: '*/5 * * * *' },  // Every 5 min
      { name: 'price-monitor', cron: '* * * * *' },   // Every minute
    ],
    // Event subscriptions
    events: ['transfer', 'swap'],
  },

  // Storage
  storage: {
    type: 'sqlite',
    path: './data/agent.db',
  },

  // Logging
  logging: {
    level: 'info',
    format: 'json',
    file: './data/logs/agent.log',
  },
});
```

**Implementation Notes**:
- Zod schema provides runtime validation and TypeScript types
- Environment variables override config file values
- `defineConfig` helper provides type inference and defaults

---

### 1.10 Basic README and CLAUDE.md Generation

**Description**: Generate comprehensive documentation for scaffolded projects.

**Requirements**:
- [ ] Create README.md template with:
  - Quick start instructions
  - Configuration overview
  - Available commands
  - Skill management
  - Deployment instructions
  - Troubleshooting
- [ ] Create CLAUDE.md template focused on:
  - Project structure explanation
  - How to modify agent behavior
  - How to create custom skills
  - How to add new MCP tools
  - How to customize the UI
  - Common customization patterns

**CLAUDE.md Sections**:
```markdown
# Agent Customization Guide

## Quick Reference
- Agent config: `agent.config.ts`
- Add skill: `pnpm skill add <url>`
- View logs: `data/logs/agent.log`

## Modifying Agent Behavior
### Decision Logic
### Adding Scheduled Tasks
### Custom Event Handlers

## Creating Custom Skills
### Skill Structure
### SKILL.md Format
### Testing Skills Locally

## Extending MCP Tools
### Adding Custom Tools
### Tool Permissions

## Customizing the UI
### Adding New Pages
### Modifying Chat Interface
### Custom Dashboard Widgets
```

**Implementation Notes**:
- Templates use Handlebars or template literals
- Interpolate project name, selected skills, network, etc.
- CLAUDE.md targets developers using Claude Code to customize their agent

---

# Phase 2: Enhanced Features

Features that complete the full dashboard vision and add polish.

---

### 2.1 Full Dashboard UI

**Description**: Expand the Web UI with complete dashboard features.

**Requirements**:
- [ ] Transaction history page with filtering and search
  - [ ] Filter by type (transfer, swap, contract call)
  - [ ] Filter by status (pending, confirmed, failed)
  - [ ] Filter by date range
  - [ ] Search by hash or address
  - [ ] Pagination
- [ ] Detailed transaction view (gas, timestamps, logs)
- [ ] Token balance charts (historical via on-chain data)
- [ ] Agent activity timeline (decisions, actions, errors)
- [ ] Reputation dashboard (if ERC-8004 enabled)
  - [ ] Current reputation score
  - [ ] Feedback history
  - [ ] Validation status
- [ ] Settings page:
  - [ ] Edit agent.config.ts values
  - [ ] Restart agent
  - [ ] View logs
  - [ ] Export data

**Implementation Notes**:
- Use recharts or chart.js for visualizations
- Real-time updates via WebSocket
- Settings changes require agent restart (show confirmation)

---

### 2.2 Skill Marketplace Browser

**Description**: Add skill discovery and installation from GitHub-based registry.

**Requirements**:
- [ ] Create skill browser page in UI
- [ ] Implement GitHub API client for skill discovery
  - [ ] Fetch starknet-agentic skills manifest
  - [ ] Fetch skills from configured GitHub repos/orgs
  - [ ] Parse SKILL.md frontmatter for metadata
- [ ] Display skill cards with:
  - [ ] Name, description, author
  - [ ] Keywords/tags
  - [ ] Install status (installed, available, update available)
  - [ ] Star count / popularity
- [ ] Implement one-click skill installation
- [ ] Show skill details modal (full SKILL.md content)
- [ ] Add skill update checking and one-click update
- [ ] Implement skill removal

**Skill Discovery Sources**:
```typescript
const skillSources = [
  // Official starknet-agentic skills
  'github:keep-starknet-strange/starknet-agentic/skills',
  // Community skills
  'github:starknet-community/agent-skills',
  // User-configured sources
  ...config.skillSources,
];
```

**Implementation Notes**:
- Cache skill metadata in SQLite (refresh on demand or daily)
- GitHub API rate limiting: use token if provided, otherwise unauthenticated
- Skill updates detected by comparing content hash

---

### 2.3 On-Chain Identity Registration Flow

**Description**: Implement automatic ERC-8004 registration for agents that opt-in.

**Requirements**:
- [ ] Create identity registration workflow:
  1. Check if wallet has sufficient balance
  2. Check if already registered
  3. Call IdentityRegistry.register() with metadata
  4. Store registration receipt
- [ ] Add registration status to dashboard
- [ ] Implement metadata update flow
- [ ] Add reputation display (fetch from ReputationRegistry)
- [ ] Create identity card component showing:
  - [ ] Agent ID (NFT token ID)
  - [ ] On-chain metadata
  - [ ] Reputation score
  - [ ] Validation badges
- [ ] Add "Register Now" button if not registered

**Implementation Notes**:
- Use MCP tool `starknet_register_agent` if available
- Fallback to direct contract call via starknet.js
- Store agent_id in SQLite after registration
- Sync metadata periodically (or on-demand)

---

### 2.4 A2A Discovery Endpoint

**Description**: Implement `/.well-known/agent.json` endpoint for agent discovery.

**Requirements**:
- [ ] Create A2A Agent Card generator from config + on-chain data
- [ ] Implement `/.well-known/agent.json` route
- [ ] Add capability advertisement based on enabled skills
- [ ] Include reputation score if available
- [ ] Add task endpoint for A2A task protocol
- [ ] Implement basic task lifecycle (submitted -> working -> completed)
- [ ] Create A2A status page in UI

**Agent Card Schema**:
```json
{
  "name": "My DeFi Agent",
  "description": "Autonomous DeFi agent for Starknet",
  "version": "1.0.0",
  "url": "https://my-agent.example.com",
  "capabilities": [
    {
      "name": "swap",
      "description": "Execute token swaps via AVNU",
      "inputSchema": { ... }
    },
    {
      "name": "transfer",
      "description": "Send tokens to addresses",
      "inputSchema": { ... }
    }
  ],
  "identity": {
    "chain": "starknet",
    "registry": "0x...",
    "tokenId": "123"
  },
  "reputation": {
    "score": 4.8,
    "feedbackCount": 42
  }
}
```

**Implementation Notes**:
- A2A endpoint only enabled if `config.a2a.enabled = true`
- Capabilities derived from enabled skills + MCP tools
- Task endpoint at `/api/a2a/tasks`

---

### 2.5 Docker Deployment

**Description**: Add production-ready Docker configuration.

**Requirements**:
- [ ] Create multi-stage Dockerfile:
  - Stage 1: Build TypeScript + Next.js
  - Stage 2: Production runtime (node:20-slim)
- [ ] Create docker-compose.yml for local development
- [ ] Add docker-compose.prod.yml for production
- [ ] Include health check endpoint
- [ ] Document environment variable configuration
- [ ] Add volume mounts for:
  - [ ] SQLite database (`./data:/app/data`)
  - [ ] Logs (`./logs:/app/logs`)
  - [ ] SSL certificates (optional)
- [ ] Create `.dockerignore` file

**Dockerfile Structure**:
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production stage
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/ui/.next ./ui/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "dist/index.js"]
```

**Implementation Notes**:
- Use pnpm for smaller node_modules
- SQLite database persisted via volume mount
- Environment variables passed via docker-compose or -e flags

---

### 2.6 Structured Logging and Log Viewer

**Description**: Implement comprehensive logging with UI-based log viewer.

**Requirements**:
- [ ] Create structured logger (pino or winston)
- [ ] Configure JSON log format with fields:
  - timestamp, level, message, component, requestId, duration
- [ ] Add log rotation (daily, max 7 days)
- [ ] Create log viewer page in UI:
  - [ ] Real-time log streaming via WebSocket
  - [ ] Filter by level (debug, info, warn, error)
  - [ ] Filter by component (agent, mcp, server, ui)
  - [ ] Search by message content
  - [ ] Auto-scroll toggle
- [ ] Add basic metrics display:
  - [ ] Request count, error count
  - [ ] Transaction count, success rate
  - [ ] Gas spent (total, last 24h)

**Implementation Notes**:
- Logs written to `data/logs/agent.log` (current) and `data/logs/agent.log.1` (rotated)
- WebSocket endpoint `/ws/logs` for real-time streaming
- Metrics stored in SQLite, updated on each event

---

### 2.7 Session Key Management UI

**Description**: Add UI for managing Agent Account session keys.

**Requirements**:
- [ ] Create session key list page showing:
  - [ ] Active session keys
  - [ ] Policy details (spending limit, time bounds, allowed contracts)
  - [ ] Usage statistics (amount spent, transactions)
- [ ] Implement session key creation form:
  - [ ] Spending limit input (with token selector)
  - [ ] Time bounds (start date, end date)
  - [ ] Contract whitelist (optional)
  - [ ] Generate new keypair or import existing
- [ ] Add session key revocation flow
- [ ] Show warnings for expiring keys
- [ ] Display emergency revoke button

**Implementation Notes**:
- Requires Agent Account contract deployed (not standard Argent/Braavos)
- Use MCP tools or direct contract calls
- Store session key metadata locally (private keys never leave device)

---

### 2.8 Additional Config Presets

**Description**: Add more config presets for common agent use cases.

**Requirements**:
- [ ] Create `nft-artist` preset:
  - Skills: starknet-wallet, (future: starknet-nft)
  - Loop: Monitor floor prices, list/buy NFTs
  - UI theme: Art-focused
- [ ] Create `researcher` preset:
  - Skills: starknet-wallet, starknet-identity
  - Loop: Data collection, on-chain analysis
  - Extra: Export tools, data visualization
- [ ] Create `trader` preset:
  - Skills: starknet-wallet, starknet-defi, prediction-arb (if available)
  - Loop: Aggressive price monitoring, arb detection
  - Extra: PnL tracking, risk metrics
- [ ] Create `social` preset:
  - Skills: starknet-wallet, starknet-identity, (future: starknet-messaging)
  - Loop: Social interactions, reputation building
  - A2A: Enabled by default
- [ ] Document each preset in README

**Implementation Notes**:
- Presets configure: skills, loop settings, UI theme, default LLM prompts
- Users can still customize after scaffolding
- Consider preset marketplace for community presets

---

# Phase 3: Future / Community

Long-term features and community-driven enhancements.

---

### 3.1 Multi-Agent Coordination

**Description**: Enable scaffolded agents to discover and collaborate with other agents.

**Requirements**:
- [ ] Implement agent discovery via A2A endpoint scanning
- [ ] Add agent-to-agent task delegation
- [ ] Create shared task queue for multi-agent workflows
- [ ] Implement payment channels for agent-to-agent payments
- [ ] Add trust scoring based on reputation
- [ ] Document multi-agent patterns

**Implementation Notes**:
- Builds on A2A protocol (Phase 2)
- May require shared state or message broker
- Consider using Starknet events for coordination

---

### 3.2 Plugin System

**Description**: Allow community-created plugins to extend agent functionality.

**Requirements**:
- [ ] Design plugin interface (lifecycle hooks, UI extensions, tool additions)
- [ ] Create plugin loader with sandboxing
- [ ] Implement plugin marketplace integration
- [ ] Add plugin configuration in agent.config.ts
- [ ] Document plugin development guide

**Plugin Types**:
- **UI Plugins**: Add dashboard widgets, new pages
- **Action Plugins**: Add new agent capabilities
- **Integration Plugins**: Connect to external services (Telegram, Discord, etc.)

---

### 3.3 Mobile App (React Native)

**Description**: Create mobile companion app for agent monitoring.

**Requirements**:
- [ ] React Native app with Expo
- [ ] Real-time notifications (push via FCM/APNs)
- [ ] Agent status monitoring
- [ ] Quick actions (stop agent, approve transactions)
- [ ] Chat interface

**Implementation Notes**:
- Lower priority (web UI is responsive)
- Consider after core features stable

---

### 3.4 Advanced Security Features

**Description**: Add enterprise-grade security options.

**Requirements**:
- [ ] Hardware wallet support (Ledger, Trezor)
- [ ] Multi-sig approval workflows
- [ ] Encrypted keystore files
- [ ] Audit logging with tamper detection
- [ ] Rate limiting and anomaly detection

---

### 3.5 Framework Integrations

**Description**: Native integrations with popular agent frameworks.

**Requirements**:
- [ ] LangChain adapter (use scaffolded agent as LangChain tool)
- [ ] CrewAI integration (agent as CrewAI agent)
- [ ] AutoGPT plugin
- [ ] Daydreams extension (as documented in main roadmap)

**Implementation Notes**:
- May be separate packages published to npm
- Document integration patterns

---

### 3.6 Hosted Agent Service (Optional)

**Description**: Offer managed hosting for scaffolded agents.

**Requirements**:
- [ ] One-click deploy to managed infrastructure
- [ ] Dashboard for managing multiple agents
- [ ] Usage-based pricing
- [ ] Automatic updates and security patches

**Implementation Notes**:
- This is a product decision, not just code
- May partner with cloud providers
- Consider self-hosted-first philosophy

---

## Implementation Priority Summary

| Phase | Target | Key Deliverables |
|-------|--------|------------------|
| **Platform Integration (v0.5)** | **NOW** | Platform detection, OpenClaw/Claude Code setup, agent self-install, verification |
| **Standalone MVP (v1.0)** | Q2 2026 | Full scaffold for custom agents: UI + MCP + skill loading + basic chat |
| **Enhanced (v1.x)** | Q3 2026 | Full dashboard, skill marketplace, A2A, Docker, logging |
| **Future (v2.0+)** | 2026+ | Multi-agent, plugins, mobile app, advanced security |

### Phase 0 Priority Order

1. **0.1 Platform Detection** ✓ COMPLETE (v0.2.0)
2. **0.2 Platform-Specific Wizards** ✓ COMPLETE (v0.2.0)
3. **0.3 Agent-Initiated Setup** ✓ COMPLETE (v0.3.0)
4. **0.4 Credential Helpers** ✓ COMPLETE (v0.4.0)
5. **0.5 Verification (Enhanced)** — TODO: Full end-to-end verification with balance query

---

## Technical Dependencies

| Feature | Depends On |
|---------|------------|
| Platform Detection (0.1) | Knowledge of OpenClaw/Claude Code config file locations |
| Agent Self-Install (0.3) | `@starknet-agentic/mcp-server` published to npm |
| MCP Sidecar | `@starknet-agentic/mcp-server` published to npm |
| Skills Installation | `skills/manifest.json` or individual SKILL.md files in repo |
| On-chain Identity | ERC-8004 contracts deployed (Sepolia done, Mainnet pending) |
| A2A Discovery | `@starknet-agentic/a2a` package |
| Session Keys | Agent Account contract deployed |
| Skill Marketplace | GitHub API access, skills manifest.json |

### External Platform Documentation Needed

| Platform | Documentation Source | Status |
|----------|---------------------|--------|
| OpenClaw/MoltBook | OpenClaw docs, reverse engineering | TODO - need to verify config paths |
| Claude Code | Anthropic docs, CLI source | Partially known |
| Cursor | Cursor docs | TODO |
| Daydreams | Daydreams repo | TODO |

---

## Status Legend

- `[ ]` Not started
- `[x]` Complete
- `[~]` In progress

*Last updated: 2026-02-11 (v0.4.0 - Credential Setup Helpers)*

---

## Appendix: Agent Self-Install UX Example

This is the target user experience for agent-initiated Starknet setup:

```
┌──────────────────────────────────────────────────────────────────────┐
│  User (talking to their OpenClaw agent)                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User: "I want you to be able to use Starknet for DeFi"              │
│                                                                      │
│  Agent: I'll set up Starknet capabilities now.                       │
│                                                                      │
│  *Agent executes:*                                                   │
│  npx create-starknet-agent@latest \                                  │
│    --skills starknet-wallet,starknet-defi \                          │
│    --network sepolia \                                               │
│    --non-interactive --json                                          │
│                                                                      │
│  Agent: Done! I've configured Starknet integration with these        │
│         capabilities:                                                │
│                                                                      │
│         • Check token balances (ETH, STRK, USDC, USDT)              │
│         • Transfer tokens to any address                             │
│         • Swap tokens via AVNU aggregator                            │
│         • Get swap quotes before executing                           │
│                                                                      │
│         Before I can execute transactions, you'll need to add        │
│         your Starknet wallet credentials. Would you like me to       │
│         walk you through that?                                       │
│                                                                      │
│  User: "Yes"                                                         │
│                                                                      │
│  Agent: To set up your wallet:                                       │
│                                                                      │
│         1. Open Ready or Braavos wallet                           │
│         2. Go to Settings → Export Private Key                       │
│         3. Run this command and paste when prompted:                 │
│            npx create-starknet-agent credentials                     │
│                                                                      │
│         4. Restart me (or wait 30 seconds for auto-reload)           │
│                                                                      │
│         After that, try: "What's my ETH balance on Starknet?"       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

This flow enables:
1. **Zero friction** — User describes intent, agent handles setup
2. **Security** — Private keys never pass through the agent; user enters directly
3. **Verification** — Agent can confirm setup worked with a balance check
4. **Progressive disclosure** — Start with read-only, add write access when ready
