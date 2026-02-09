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
| [huginn-onboard](./huginn-onboard/) | Bridge to Starknet and register with Huginn | Complete |

## Installation

### Option 1: GitHub (Recommended)

Install all skills or specific ones using the skills CLI:

```bash
# Install all Starknet skills
npx skills add keep-starknet-strange/starknet-agentic

# Install specific skill
npx skills add keep-starknet-strange/starknet-agentic/skills/starknet-wallet
npx skills add keep-starknet-strange/starknet-agentic/skills/starknet-defi
```

### Option 2: Claude Code Plugin Marketplace

```bash
# Register the marketplace
/plugin marketplace add keep-starknet-strange/starknet-agentic

# Install all skills
/plugin install starknet-skills@keep-starknet-strange-starknet-agentic

# Or install individual skill plugins
/plugin install starknet-wallet@keep-starknet-strange-starknet-agentic
/plugin install starknet-defi@keep-starknet-strange-starknet-agentic
/plugin install starknet-identity@keep-starknet-strange-starknet-agentic
/plugin install starknet-payments@keep-starknet-strange-starknet-agentic
/plugin install starknet-privacy@keep-starknet-strange-starknet-agentic
```

### Option 3: Direct Git Clone

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git
cd starknet-agentic/skills

# Skills are in individual directories
ls -la
```

### Option 4: ClawHub (Coming Soon)

ClawHub integration is planned for OpenClaw and MoltBook users. Publishing workflow is not yet publicly documented - check [clawhub.ai](https://clawhub.ai) for updates.

## Updating Skills

Installed skills don't auto-update. To get the latest version:

```bash
# GitHub - reinstall
npx skills add keep-starknet-strange/starknet-agentic --force

# Claude Code - update plugin
/plugin update starknet-skills@keep-starknet-strange-starknet-agentic

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
# TypeScript skills (wallet, defi, identity)
npm install starknet@^8.9.1 @avnu/avnu-sdk@^4.0.1

# Python skills (mini-pay)
pip install starknet-py qrcode[pil] python-telegram-bot

# Anonymous wallet skill
npm install starknet@^9.2.1 typhoon-sdk@^1.1.13
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

These skills work with:
- **Claude Code** - Full support via plugin marketplace
- **Cursor** - Via skills CLI
- **GitHub Copilot** - Via skills integration
- **OpenClaw / MoltBook** - Via ClawHub
- **Goose, Roo Code, Windsurf** - Via Agent Skills format
- **Custom agents** - Any agent supporting the Agent Skills spec

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
