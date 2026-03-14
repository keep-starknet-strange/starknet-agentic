<p align="center">
  <img alt="cairo-auditor hero" src="../assets/cairo-auditor-hero.svg" width="100%" />
</p>

# cairo-auditor

A security agent for Cairo/Starknet — findings in minutes, not weeks.

Built for:

- **Cairo devs** who want a security check before every commit
- **Security researchers** looking for fast wins before a manual review
- **Anyone** deploying on Starknet who wants an extra pair of eyes

Not a substitute for a formal audit — but the check you should never skip.

<p>
  <img alt="mode default" src="https://img.shields.io/badge/mode-default-0969da" />
  <img alt="mode deep" src="https://img.shields.io/badge/mode-deep-7c3aed" />
  <img alt="fp gate" src="https://img.shields.io/badge/false--positive-gated-2ea043" />
  <img alt="deterministic smoke" src="https://img.shields.io/badge/deterministic%20smoke-pass-2ea043" />
</p>

<!-- TODO: add demo GIF once recorded -->
<!-- ## Demo -->
<!-- ![Running cairo-auditor in terminal](assets/demo.gif) -->

## Install

**Claude Code CLI:**

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git \
  && mkdir -p ~/.claude/commands/cairo-auditor \
  && cp -R starknet-agentic/skills/cairo-auditor/. ~/.claude/commands/cairo-auditor/
```

**Cursor (manual guidance only):**

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git \
  && mkdir -p docs/cairo-auditor \
  && cp -R starknet-agentic/skills/cairo-auditor/references/. docs/cairo-auditor/
```

Cursor does not execute this package as a runnable `/cairo-auditor` command. Use Claude Code CLI or Plugin Marketplace for the executable orchestrator flow. In Cursor, treat these files as reference guidance only.
There is no official global `~/.cursor/skills` install path for this package.

**Claude Code Plugin Marketplace:**

```bash
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install cairo-auditor@keep-starknet-strange-starknet-agentic
```

**Update to latest:**

```bash
cd starknet-agentic && git pull
# Claude Code CLI:
cp -R skills/cairo-auditor/. ~/.claude/commands/cairo-auditor/
# Cursor docs refresh (manual guidance only):
cp -R skills/cairo-auditor/references/. docs/cairo-auditor/
```

## Usage

```bash
# Scan the full repo (default — 4 parallel agents)
/cairo-auditor

# Full repo + adversarial reasoning agent (slower, more thorough)
/cairo-auditor deep

# Review specific file(s)
/cairo-auditor src/contracts/account.cairo
/cairo-auditor src/contracts/account.cairo src/contracts/factory.cairo

# Write report to a markdown file (terminal-only by default)
/cairo-auditor --file-output
```

### Deterministic local scan (no AI)

```bash
python3 scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id my-audit
```

## Example output

```text
[P0] 1. Ungated Upgrade Path
  NO_ACCESS_CONTROL_MUTATION · src/contracts/account.cairo:42 · Confidence: 92

  Description
  External upgrade() calls replace_class_syscall without caller gate.
  Any account can replace the contract class, leading to full takeover.

  Fix
  - fn upgrade(ref self: ContractState, new_class: ClassHash) {
  + fn upgrade(ref self: ContractState, new_class: ClassHash) {
  +     self.ownable.assert_only_owner();

  Required Tests
  - Unauthorized caller reverts on upgrade
  - Owner successfully upgrades and new class hash persists
```

## How it works

The skill orchestrates a **4-turn pipeline**:

1. **Discover** — find in-scope `.cairo` files, run deterministic preflight
2. **Prepare** — build 4 code bundles, each with a different attack-vector partition
3. **Spawn** — 4 parallel vector specialists (`model: sonnet`), optionally + 1 adversarial (`model: opus` in deep mode)
4. **Report** — merge, deduplicate by root cause, sort by confidence, emit findings

Each agent scans the full codebase against 30 attack vectors from its partition (120 total), applies a strict false-positive gate, and formats findings with exploit paths and fix diffs.

## Known limitations

**Codebase size.** Works best under ~5,000 lines of Cairo. Past that, triage accuracy and mid-bundle recall degrade. For large codebases, run per-module rather than everything at once.

**What AI misses.** AI catches pattern-based vulnerabilities reliably: missing access controls, CEI violations, unsafe upgrades, zero-address initialization. It struggles with: multi-transaction state setups, specification/invariant bugs, cross-protocol composability, game-theoretic attacks, and off-chain oracle assumptions. AI catches what humans forget to check. Humans catch what AI cannot reason about. You need both.

## Benchmarks

Deterministic scorecards are smoke/regression gates, not final independent proof.

| Suite | Cases | Precision | Recall | Scorecard |
| --- | ---: | ---: | ---: | --- |
| Core deterministic | 42 | 1.000 | 1.000 | [v0.2.0-cairo-auditor-benchmark.md](../../evals/scorecards/v0.2.0-cairo-auditor-benchmark.md) |
| Real-world corpus | 42 | 1.000 | 1.000 | [v0.2.0-cairo-auditor-realworld-benchmark.md](../../evals/scorecards/v0.2.0-cairo-auditor-realworld-benchmark.md) |

Additional quality signals:

- External triage: [v0.2.0-cairo-auditor-external-triage.md](../../evals/scorecards/v0.2.0-cairo-auditor-external-triage.md)
- Manual gold: [v0.2.0-cairo-auditor-manual-19-gold-recall.md](../../evals/scorecards/v0.2.0-cairo-auditor-manual-19-gold-recall.md)

## Structure

```text
cairo-auditor/
  SKILL.md                     # 4-turn orchestration contract
  agents/
    vector-scan.md             # vector specialist instructions
    adversarial.md             # adversarial specialist instructions
  references/
    attack-vectors/            # 120 vectors in 4 partitions
    vulnerability-db/          # 13 canonical vulnerability classes
    judging.md                 # FP gate + confidence scoring
    report-formatting.md       # finding template + priority mapping
    semgrep/                   # optional Semgrep auxiliary rules
  scripts/                    # runnable TypeScript/Python examples (e.g., quality/audit_local_repo.py)
  workflows/
    default.md                 # 4-agent pipeline reference
    deep.md                    # + adversarial agent details
```
