# Starknet Agent Skills

Official Starknet Agentic skill catalog for developer-facing agent hosts. Public install and usage flows in this repo are verified on Codex, Claude Code, and Agent Skills CLI.

Use the root router when an agent host imports the whole bundle:

- [`../SKILL.md`](../SKILL.md)

Use this catalog when installing or invoking individual skills.

## Choose a Skill

### Starknet App and Agent Skills

| Skill | Use for | Status |
|---|---|---|
| [`starknet-js`](./starknet-js/) | Starknet.js v9 application code, account APIs, transactions, wallet integration, paymaster flows | Available |
| [`starknet-wallet`](./starknet-wallet/) | Wallet setup, balances, transfers, account deployment, contract invokes, session keys | Available |
| [`starknet-defi`](./starknet-defi/) | Swaps, DCA, staking, lending, AVNU routing, DeFi execution | Available |
| [`starknet-identity`](./starknet-identity/) | ERC-8004 agent registration, metadata, reputation, validation | Available |
| [`snip-36`](./snip-36/) | Virtual block proving, off-chain proof generation, Cairo verification, proof server and starknet.js integration | Available |
| [`starknet-mini-pay`](./starknet-mini-pay/) | Payment links, QR codes, invoices, simple ETH/STRK/USDC transfers | Available |
| [`starknet-tongo`](./starknet-tongo/) | Confidential ERC20 payments, encrypted balances, private transfers | Available |
| [`starknet-anonymous-wallet`](./starknet-anonymous-wallet/) | Privacy-focused Typhoon wallet creation and anonymous operations | Available |
| [`controller-cli`](./controller-cli/) | Cartridge Controller CLI sessions, scoped policy, JSON execution/recovery | Available |
| [`huginn-onboard`](./huginn-onboard/) | Bridge an EVM agent to Starknet and register with Huginn | Incubating |
| [`starkzap-sdk`](./starkzap-sdk/) | keep-starknet-strange/starkzap SDK, onboarding, wallet, staking, transaction builder workflows | Project-specific |

### Cairo Contract Skills

| Skill | Use for | Status |
|---|---|---|
| [`cairo-contract-authoring`](./cairo-contract-authoring/) | Writing or modifying Cairo contracts, storage, events, interfaces, components | Available |
| [`cairo-testing`](./cairo-testing/) | `snforge` unit, integration, fuzz, fork, and regression tests | Available |
| [`cairo-optimization`](./cairo-optimization/) | Profile-driven gas/step optimization after correctness is established | Available |
| [`cairo-deploy`](./cairo-deploy/) | Build, declare, deploy, verify, and operate Cairo contracts with `sncast` | Available |
| [`cairo-auditor`](./cairo-auditor/) | Cairo/Starknet security review with deterministic preflight and FP gating | Demo-ready |
| [`account-abstraction`](./account-abstraction/) | Account validation, nonces, signatures, session policy, execute path risks | Available |
| [`starknet-network-facts`](./starknet-network-facts/) | Starknet protocol constraints: tx versions, fees, timing, sequencer assumptions | Available |

## Recommended Flows

For new Cairo contract work:

1. [`cairo-contract-authoring`](./cairo-contract-authoring/)
2. [`cairo-testing`](./cairo-testing/)
3. [`cairo-optimization`](./cairo-optimization/) if performance matters
4. [`cairo-auditor`](./cairo-auditor/)
5. [`cairo-deploy`](./cairo-deploy/) after tests and review gates pass

For an application or agent integration:

1. [`starknet-js`](./starknet-js/) for SDK/API shape
2. [`starknet-wallet`](./starknet-wallet/) for account operations
3. Add [`starknet-defi`](./starknet-defi/), [`starknet-identity`](./starknet-identity/), or payment/privacy skills only when the user intent requires that surface

For SNIP-36 virtual block proving:

1. [`snip-36`](./snip-36/) for the virtual contract, proof server, starknet.js orchestration, and verification pattern
2. Add [`cairo-contract-authoring`](./cairo-contract-authoring/) when implementing verifier contracts
3. Add [`starknet-js`](./starknet-js/) when integrating proof request and signing flows into a TypeScript application

For wallet or session-policy work:

- Start with [`starknet-wallet`](./starknet-wallet/)
- Add [`account-abstraction`](./account-abstraction/) when validation, signatures, nonces, or spending policies are involved

## Install and First Use

### First useful result in less than or equal to 2 minutes

Use the deterministic quickstart:

- [`./QUICKSTART_2MIN.md`](./QUICKSTART_2MIN.md)

### Fastest Path: `cairo-auditor`

Use one command path, then run one audit.

**Codex public GitHub install:**

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
python3 "$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo keep-starknet-strange/starknet-agentic \
  --path skills/cairo-auditor \
  --ref main
# Restart Codex, open /skills, then invoke cairo-auditor
```

**Codex reproducible install:**

```bash
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
python3 "$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo keep-starknet-strange/starknet-agentic \
  --path skills/cairo-auditor \
  --ref <commit-sha>
```

Use immutable commit SHAs for reproducible installs until a release tag exists for the current auditor version.

**Claude Code plugin marketplace:**

```bash
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
/reload-plugins
/starknet-agentic-skills:cairo-auditor
```

`--scope user` is the recommended Claude Code scope. Use `--scope local` only when you intentionally want repo-local plugin state.

**Agent Skills CLI:**

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor
```

Install any other individual skill by replacing the final path segment:

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/<skill-name>
```

### Install All Skills

```bash
npx skills add keep-starknet-strange/starknet-agentic
```

### Clone-and-Use

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git
cd starknet-agentic
```

Codex discovers repository skills from `.agents/skills/`, which symlink to canonical skill content under `skills/`.

Troubleshooting and recovery:

- [`./TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
- [`../docs/CLAUDE_MARKETPLACE_SUBMISSION.md`](../docs/CLAUDE_MARKETPLACE_SUBMISSION.md)

## Machine-Readable Index

Agent platforms and tooling should use:

- [`./manifest.json`](./manifest.json)

Generated manifest entries include skill names, descriptions, repo paths, raw `SKILL.md` URLs, and `npx skills add` install commands.

Related migration notes:

- [`../docs/CAIRO_SKILLS_MIGRATION.md`](../docs/CAIRO_SKILLS_MIGRATION.md)

## Updating Skills

Installed skills do not auto-update. Use the update path for your host:

```bash
# Agent Skills CLI
npx skills add keep-starknet-strange/starknet-agentic --force

# Claude Code
/plugin marketplace update keep-starknet-strange/starknet-agentic
/plugin update starknet-agentic-skills@starknet-agentic-skills
/reload-plugins

# Git clone
git pull origin main
```

## Runtime Requirements

Networked wallet, DeFi, identity, payment, privacy, and controller flows need a Starknet RPC endpoint. Write operations also need signer configuration.

Local direct signer mode is for development only:

```bash
export STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY"
export STARKNET_ACCOUNT_ADDRESS="0x..."
export STARKNET_SIGNER_MODE="direct"
export STARKNET_PRIVATE_KEY="0x..."
```

Production runtimes should use a proxy signer boundary instead of raw in-process keys:

```bash
export STARKNET_RPC_URL="https://starknet-mainnet.g.alchemy.com/v2/YOUR_KEY"
export STARKNET_ACCOUNT_ADDRESS="0x..."
export STARKNET_SIGNER_MODE="proxy"
export KEYRING_PROXY_URL="https://signer.internal:8545"
export KEYRING_HMAC_SECRET="replace-with-long-random-secret"
export KEYRING_CLIENT_ID="starknet-agentic-skill-host"
```

Do not commit `.env` files, private keys, HMAC secrets, or funded credentials.

Optional AVNU paymaster configuration:

```bash
export AVNU_PAYMASTER_URL="https://starknet.paymaster.avnu.fi"
export AVNU_PAYMASTER_API_KEY="your_key"
```

Additional local tooling depends on the selected skill:

| Surface | Typical tools |
|---|---|
| Starknet app/runtime skills | Node.js, TypeScript, `starknet`, AVNU SDK when routing swaps/paymaster flows |
| Cairo contract skills | Scarb, Starknet Foundry, `snforge`, `sncast` |
| Python payment utilities | Python 3, `starknet-py`, QR/payment bot dependencies as documented by the child skill |
| Repository validation | Python deps from [`../requirements.txt`](../requirements.txt) |

## MCP Server Integration

These skills complement the Starknet MCP server. For local source checkouts, build the package and point your MCP-compatible host at the built entrypoint:

```bash
pnpm --filter @starknetfoundation/starknet-agentic-mcp-server build
```

```json
{
  "mcpServers": {
    "starknet": {
      "command": "node",
      "args": ["/path/to/starknet-agentic/packages/starknet-mcp-server/dist/index.js"],
      "env": {
        "STARKNET_RPC_URL": "https://...",
        "STARKNET_ACCOUNT_ADDRESS": "0x...",
        "STARKNET_SIGNER_MODE": "proxy",
        "KEYRING_PROXY_URL": "http://127.0.0.1:8545",
        "KEYRING_HMAC_SECRET": "replace-with-long-random-secret"
      }
    }
  }
}
```

Use proxy signer mode for production. Direct private-key mode is for local development only.

## Skill Format

Every skill directory contains one `SKILL.md` with YAML frontmatter:

```yaml
---
name: skill-name
description: Third-person trigger description.
license: Apache-2.0
metadata:
  author: starknet-agentic
  version: "1.0.0"
keywords: [starknet]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---
```

New skills must pass:

```bash
python3 scripts/quality/validate_skills.py
python3 scripts/skills_manifest.py --check
python3 scripts/quality/check_codex_distribution.py
python3 -m unittest scripts/quality/test_codex_distribution.py
python3 scripts/quality/validate_marketplace.py
```

Run these commands from the repository root. In a fresh Python environment, install the pinned validator dependencies first:

```bash
python3 -m pip install -r requirements.txt
```

## Platform Compatibility

Only surfaces explicitly tested in this repository are marked as supported.

| Surface | Install Path | Status |
|---|---|---|
| Codex | `install-skill-from-github.py --repo keep-starknet-strange/starknet-agentic --path skills/cairo-auditor --ref <commit-sha>` | Supported |
| Claude Code | `/plugin marketplace add keep-starknet-strange/starknet-agentic` plus `/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user` | Supported |
| Agent Skills CLI | `npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor` | Supported |
| Other Agent Skills-compatible hosts | Host-specific skill import | Not verified here |

## Contributing

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md). Keep `SKILL.md` content focused, update [`./manifest.json`](./manifest.json) when adding skills, and keep installation docs compatible with distribution validation.

## Resources

- [Agent Skills Specification](https://agentskills.io/)
- [Starknet Documentation](https://docs.starknet.io/)
- [Starknet Agentic repository](https://github.com/keep-starknet-strange/starknet-agentic)
- [GitHub Issues](https://github.com/keep-starknet-strange/starknet-agentic/issues)

## License

Apache-2.0
