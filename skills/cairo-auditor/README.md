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

## Install

Pick **one** path that matches your host:

### Claude Code (recommended)

Inside Claude Code, run:

```text
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope local
```

Then restart Claude Code or run `/reload-plugins`.

### Codex

`skill-installer` is a third-party CLI. Install it first if you don't have it:

```bash
npm install -g skill-installer
```

Then install the skill:

```bash
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor
```

Restart Codex, open `/skills`, then invoke `cairo-auditor`.

For reproducible installs, pin to a release tag or commit SHA:

```bash
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/v0.1.0-beta.1/skills/cairo-auditor
```

### Agent Skills CLI

```bash
npx skills add keep-starknet-strange/starknet-agentic/skills/cairo-auditor
```

### Manual (any host)

Clone the repo and point your agent's skill config at the local path:

```bash
git clone https://github.com/keep-starknet-strange/starknet-agentic.git
# Then configure your host to load skills/cairo-auditor/SKILL.md
```

Related docs:

- [2-minute quickstart](../QUICKSTART_2MIN.md)
- [troubleshooting matrix](../TROUBLESHOOTING.md)

## Usage

```bash
# Claude Code plugin invocation
/starknet-agentic-skills:cairo-auditor
```

```text
# Codex invocation pattern
Audit this repository with cairo-auditor in default mode.
Audit src/contracts/account.cairo with cairo-auditor deep mode.
```

## Deep mode reliability

Deep mode needs 5 specialist agents (4 vector + 1 adversarial).

- On hosts with deep-mode enforcement enabled, specialist unavailability returns `CAUD-006` and stops before findings unless `--allow-degraded` is explicitly set.
- On hosts with preflight enforcement enabled, failed capability preflight returns `CAUD-007` and stops before findings unless `--allow-degraded` is explicitly set.
- On non-enforcing hosts, fail-closed is not guaranteed; degraded execution may proceed based on host behavior.
- Use `--allow-degraded` only when you intentionally accept reduced coverage.
- For Codex stability, keep CLI updated (`npm i -g @openai/codex`).

Model routing is host-aware:

- `claude-code`: vector specialists use `sonnet`, adversarial specialist uses `opus` (host runtime aliases).
- `codex`: vector + adversarial specialists prefer `gpt-5.4` (fallback `gpt-5.2` when probe fails and strict mode is off).
- execution trace always records observed runtime model labels.

Large-file behavior:

- If the largest in-scope file exceeds `1000` lines **or** any bundle exceeds `1400` lines, deep mode runs in two waves (Agents 1-4, then Agent 5) and uses longer stall timeouts.
- This preserves full-power coverage while reducing transport drop risk.

Optional threat-intel enrichment (deep mode):

- pulls bounded primary-source security signals into `{workdir}/cairo-audit-threat-intel.md`,
- is passed to specialists as prioritization hints (never as direct findings),
- never creates findings by itself (local in-scope FP-gated proof is still required).

### Full-power verification

Use these checks after any deep run to confirm specialist fanout and report artifact quality.

**Codex**

```bash
cat /tmp/cairo-audit-host-capabilities.json
wc -l /tmp/cairo-audit-agent-*-bundle.md
ls -lt security-review-*.md | head -n 1
```

Expected:

- capability file exists and reports `agent_tool` available,
- four bundle files exist with non-zero lines,
- latest `security-review-*.md` has `Execution Integrity: FULL` and at least one finding on vulnerable fixtures.

**Claude Code**

Verify the plugin is loaded by running inside Claude Code:

```text
/starknet-agentic-skills:cairo-auditor deep
```

Then verify the generated report includes:

- `Execution Trace` rows for Agents 1-4 and Agent 5 adversarial,
- observed model labels (`sonnet` vectors, `opus` adversarial),
- `Execution Integrity: FULL` (or explicit degraded warning if `--allow-degraded` was intentionally used).

### Deterministic local scan (no AI)

Run this from a clone of `keep-starknet-strange/starknet-agentic` at repository root, since this helper script ships with the repository.

```bash
python3 scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id my-audit
```

### Release sync (maintainers)

```bash
python3 scripts/quality/sync_cairo_auditor_release.py \
  --skill-version 0.2.2 \
  --plugin-version 1.0.4
```

This updates:

- `skills/cairo-auditor/VERSION`
- `skills/cairo-auditor/SKILL.md` metadata version
- `.claude-plugin/plugin.json` version
- `.claude-plugin/marketplace.json` metadata/plugin versions

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
3. **Spawn** — 4 parallel vector specialists + optional adversarial specialist with host-aware model routing
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
    vulnerability-db/          # canonical vulnerability classes
    judging.md                 # FP gate + confidence scoring
    report-formatting.md       # finding template + priority mapping
    threat-intel-sources.md    # source policy for optional web enrichment
    semgrep/                   # optional Semgrep auxiliary rules
  scripts/
    README.md                  # runnable helpers and script entrypoints
  workflows/
    default.md                 # 4-agent pipeline reference
    deep.md                    # + adversarial agent details
```
