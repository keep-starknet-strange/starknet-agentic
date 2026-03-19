# Starknet Agent Skills

Production-ready skills for AI agents operating on Starknet. Built for the Agent Skills specification, compatible with 35+ agent platforms including Claude Code, Cursor, GitHub Copilot, and more.

## Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| [starknet-wallet](./starknet-wallet/) | Wallet management, transfers, session keys, gasless transactions | Complete |
| [starknet-defi](./starknet-defi/) | Token swaps, DCA, staking, lending via avnu aggregator | Complete |
| [starknet-identity](./starknet-identity/) | ERC-8004 on-chain identity and reputation | Complete |
| [starknet-mini-pay](./starknet-mini-pay/) | P2P payments, QR codes, Telegram bot | Complete |
| [starknet-anonymous-wallet](./starknet-anonymous-wallet/) | Anonymous wallet creation via Typhoon | Complete |
| [starkzap-sdk](./starkzap-sdk/) | End-to-end workflows for keep-starknet-strange/starkzap (SDK, onboarding, wallets, ERC20, staking, tests) | Complete |
| [huginn-onboard](./huginn-onboard/) | Bridge to Starknet and register with Huginn | Complete |
| [controller-cli](./controller-cli/) | Cartridge Controller CLI sessions + scoped execution (JSON-only, explicit network, paymaster, error recovery) | Complete |
| [cairo-contract-authoring](./cairo-contract-authoring/) | Workflow-first Cairo contract authoring with language guidance, anti-pattern pairs, and audit handoff | Complete |
| [cairo-testing](./cairo-testing/) | snforge test patterns, cheatcodes, fuzzing, fork testing | Complete |
| [cairo-deploy](./cairo-deploy/) | sncast deployment, account setup, network config, verification | Complete |
| [cairo-optimization](./cairo-optimization/) | Profile-driven optimization with BoundedInt and benchmarking guidance (post-test pass) | Complete |
| [cairo-auditor](./cairo-auditor/) | 4-turn Cairo audit orchestrator with vector specialists and strict FP gating | Complete |
| [account-abstraction](./account-abstraction/) | Starknet account validation/session-key correctness and risk patterns | Complete |
| [starknet-network-facts](./starknet-network-facts/) | Network-level protocol constraints that affect contract safety decisions | Complete |
| [starknet-js](./starknet-js/) | starknet.js v9.x SDK guide for dApps, accounts, transactions, paymaster | Complete |
| [starknet-tongo](./starknet-tongo/) | Confidential ERC20 payments with encrypted balances and ZK-proven transfers | Complete |

## Install and First Use

### First useful result in <= 2 minutes

Use the deterministic quickstart page:

- [`skills/QUICKSTART_2MIN.md`](./QUICKSTART_2MIN.md)

### Fastest Path: `cairo-auditor`

Use one command path, then run one audit.

**Codex (public GitHub install):**

```bash
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor
# Restart Codex, open /skills, then invoke cairo-auditor
```

**Codex (reproducible pin):**

```bash
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/v0.2.2/skills/cairo-auditor
```

Pinned ref policy: use released tags (or immutable commit SHAs) for reproducible installs.

**Claude Code plugin marketplace:**

```bash
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local
/reload-plugins
/starknet-agentic-skills:cairo-auditor
```

Scope guidance:

- `--scope local` (recommended): install for current project only.
- `--scope user`: install globally across projects.

**Agent Skills CLI:**

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor
```

### Install All Skills

```bash
npx skills add keep-starknet-strange/starknet-agentic
```

### Clone-and-Use (Codex repository discovery)

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git
cd starknet-agentic
```

Codex discovers repository skills from `.agents/skills/`, which symlink to canonical skill content under `skills/`.

Install troubleshooting and recovery commands:

- [`skills/TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)

Claude official marketplace submission runbook:

- [`docs/CLAUDE_MARKETPLACE_SUBMISSION.md`](../docs/CLAUDE_MARKETPLACE_SUBMISSION.md)

## Machine-Readable Index

For agent platforms (including OpenClaw/MoltBook) and tooling that want to index skills programmatically, see:
- `skills/manifest.json` (generated, stable format)
- Cairo cutover and legacy mapping: `../docs/CAIRO_SKILLS_MIGRATION.md`

## Updating Skills

Installed skills don't auto-update. To get the latest version:

```bash
# GitHub - reinstall
npx skills add keep-starknet-strange/starknet-agentic --force

# Claude Code - update plugin
/plugin marketplace update keep-starknet-strange/starknet-agentic
/plugin update starknet-agentic-skills@starknet-agentic-skills
/reload-plugins

# Git clone - pull latest
git pull origin main
```

## Prerequisites

All skills require a Starknet RPC endpoint and account credentials:

```bash
# Required environment variables
export STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY"
export STARKNET_ACCOUNT_ADDRESS="0x..."
export STARKNET_PRIVATE_KEY="0x..."

# Optional: For gasless transactions
export AVNU_PAYMASTER_URL="https://starknet.paymaster.avnu.fi"
export AVNU_PAYMASTER_API_KEY="your_key"
```

### Dependencies

```bash
# TypeScript skills (wallet, defi, identity, starknet-js)
# Use starknet v9 to match the project standard.
npm install starknet@^9.2.1 @avnu/avnu-sdk@^4.0.1

# Python skills (mini-pay)
pip install starknet-py qrcode[pil] python-telegram-bot

# Cairo optimization skill (BoundedInt calculator — no external deps, stdlib only)
# python3 skills/cairo-optimization/scripts/bounded_int_calc.py --help

# Anonymous wallet skill
npm install starknet@^8.9.1 typhoon-sdk@^1.1.13
```

## MCP Server Integration

These skills complement the Starknet MCP Server which provides direct tool access:

```json
{
  "mcpServers": {
    "starknet": {
      "command": "npx",
      "args": ["@starknet-agentic/mcp-server"],
      "env": {
        "STARKNET_RPC_URL": "https://...",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

Available MCP tools:
- `starknet_get_balance` / `starknet_get_balances`
- `starknet_transfer`
- `starknet_swap` / `starknet_get_quote`
- `starknet_call_contract` / `starknet_invoke_contract`
- `starknet_estimate_fee`

## Skill Format

All skills follow the [Agent Skills specification](https://agentskills.io/):

```yaml
---
name: skill-name
description: What this skill does and when to use it.
license: Apache-2.0
metadata:
  author: starknet-agentic
  version: "1.0.0"
keywords: [starknet, ...]
allowed-tools: [Bash, Read, Write, ...]
user-invocable: true
---

# Skill Title

Skill instructions and documentation...
```

## Platform Compatibility

| Surface | Install Path | Status | Last Verified (UTC) |
| --- | --- | --- | --- |
| Codex | `skill-installer install .../tree/v0.2.2/skills/cairo-auditor` | Supported | 2026-03-19 |
| Claude Code | `/plugin marketplace add ...` + `/plugin install ... --scope local` | Supported | 2026-03-15 |
| Agent Skills CLI | `npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor` | Supported | 2026-03-15 |
| Cursor / Copilot / OpenClaw / custom Agent Skills hosts | Agent Skills spec package import | Supported | 2026-03-15 |

## Contributing

See the main [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

### Adding a New Skill

1. Create `skills/<skill-name>/SKILL.md`
2. Follow the frontmatter format above
3. Include code examples with starknet.js patterns
4. Add error handling documentation
5. Submit PR for review

## Resources

- [Starknet Agentic Docs](https://starknet-agentic.xyz)
- [Agent Skills Specification](https://agentskills.io/)
- [Starknet Documentation](https://docs.starknet.io/)
- [avnu SDK](https://docs.avnu.fi/)
- [ERC-8004 Standard](https://eips.ethereum.org/EIPS/eip-8004)

## License

Apache-2.0
