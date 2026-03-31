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

## 30-Second Happy Path

Install one skill, run one deep audit, verify execution integrity.

```bash
# 1) Install (Codex)
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/main/skills/cairo-auditor
```

```text
# 2) Prompt
Codex: Run cairo-auditor deep on src/lib.cairo with --file-output. Output only the final report.
Claude Code: /starknet-agentic-skills:cairo-auditor deep src/lib.cairo --file-output
```

```bash
# 3) Verify full-power execution markers
cat /tmp/cairo-audit-host-capabilities.json
wc -l /tmp/cairo-audit-agent-*-bundle.md
ls -lt security-review-*.md | head -n 1
```

Expected markers: `Execution Integrity: FULL`, `## Execution Trace`, Agent 1-4 vector rows, and Agent 5 adversarial row.

If you are running from a local clone of this repository, you can also use:

```bash
bash skills/cairo-auditor/scripts/doctor.sh --report-dir .
```

## Example output

Every finding includes a vulnerability class, file location, confidence score, exploit description, fix diff, and required tests.

```text
Signal Summary

| Critical | High | Medium | Low | Total |
|----------|------|--------|-----|-------|
| 1        | 0    | 1      | 0   | 2     |

---

[P0] 1. Ungated Upgrade Path

  Class: NO_ACCESS_CONTROL_MUTATION · src/contracts/account.cairo:42 · Confidence: 92 · Severity: Critical · `[CODE-TRACE] [PREFLIGHT-HIT]`

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

---
                                        Below Confidence Threshold

[P2] 2. Stale Snapshot in View Function

  Class: STALE-SNAPSHOT-READ · src/contracts/registry.cairo:187 · Confidence: 62 · Severity: Medium · `[CODE-TRACE]`

  Description
  get_metadata reads a snapshot that may lag behind the latest write in the
  same block when called after set_metadata in a multicall.

---

Findings Index

| # | Priority | Confidence | Severity | Evidence | Title |
|---|----------|------------|----------|----------|-------|
| 1 | P0       | 92         | Critical | `[CODE-TRACE] [PREFLIGHT-HIT]` | Ungated Upgrade Path |
|   |          |            |          |          | **Below Confidence Threshold** |
| 2 | P2       | 62         | Medium   | `[CODE-TRACE]` | Stale Snapshot in View Function |
```

Findings above the confidence threshold (default 75) include a fix diff and required tests. Findings below get a description only.

Evidence tags tell you _how_ each finding was validated:

| Tag | Meaning |
|-----|---------|
| `[CODE-TRACE]` | Concrete path traced through in-scope source code |
| `[PREFLIGHT-HIT]` | Deterministic scanner also flagged this pattern |
| `[CROSS-AGENT]` | Independently confirmed by 2+ specialist agents |
| `[ADVERSARIAL]` | Found or confirmed by the adversarial specialist (deep mode) |

More tags = stronger signal. Findings with only `[CODE-TRACE]` are valid but lower priority for review.

## Modes

| | Default | Deep | Targeted | Local (no AI) |
|---|---|---|---|---|
| **Agents** | 4 vector scan | 4 vector + 1 adversarial | 4 vector scan | 0 (deterministic rules) |
| **Vectors checked** | 170 across 4 partitions | 170 + free-form exploit reasoning | 170 across 4 partitions | Pattern-match only |
| **Time** | ~2 min | ~5-7 min | ~1-2 min | <30s |
| **Best for** | Pre-commit check | Pre-deployment review | Reviewing specific files | CI gate, offline envs |
| **Invocation** | `/starknet-agentic-skills:cairo-auditor` | `/starknet-agentic-skills:cairo-auditor deep` | `/starknet-agentic-skills:cairo-auditor src/vault.cairo` | `python3 /path/to/cairo-auditor/scripts/quality/audit_local_repo.py` |

**Default** scans the full codebase with 4 parallel agents, each covering a different attack-vector partition (access control, external calls, math/economics, storage/trust). Good for fast iteration.

**Deep** adds a 5th adversarial agent that reads all source files and constructs multi-step exploit chains across function and contract boundaries. Use this before deployments or when default mode returns only low-confidence results.

**Targeted** scans one or more specific files instead of the full repo. It runs the same 4 vector specialists on only the paths you provide and skips deterministic preflight to keep context scoped. Use this for fast, focused review of a single contract or module.

**Local** runs a deterministic preflight scanner with no AI calls. Catches obvious patterns (ungated upgrades, missing non-zero guards, commented-out access control). Useful as a CI gate or when offline.

## Install

Pick **one** path that matches your host:

### Claude Code (recommended)

Inside Claude Code, run:

```text
/plugin marketplace add keep-starknet-strange/starknet-agentic
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
```

Then restart Claude Code or run `/reload-plugins`.

Note: Claude plugin bundle versions (for example `starknet-agentic-skills 1.0.4`) are intentionally separate from this skill's internal version (`cairo-auditor 0.2.2`).

If your install looks stale after a new release, force-refresh marketplace metadata and reinstall:

```text
/plugin marketplace update keep-starknet-strange/starknet-agentic
/plugin uninstall starknet-agentic-skills@starknet-agentic-skills --scope local
/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user
/reload-plugins
/plugin list
```

Expected: installed plugin shows the latest bundle version and `/starknet-agentic-skills:cairo-auditor` resolves.

Use `--scope local` only when you intentionally want a repo-specific pinned plugin state.

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
skill-installer install https://github.com/keep-starknet-strange/starknet-agentic/tree/v0.2.2/skills/cairo-auditor
```

If your mirror does not yet expose `v0.2.2`, use `tree/main` temporarily.

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

```text
# Claude Code
/starknet-agentic-skills:cairo-auditor              # default mode, full repo
/starknet-agentic-skills:cairo-auditor deep          # deep mode, full repo
/starknet-agentic-skills:cairo-auditor src/vault.cairo  # targeted file(s)
/starknet-agentic-skills:cairo-auditor deep --file-output  # deep + write report to file
/starknet-agentic-skills:cairo-auditor deep --proven-only  # deep + conservative severity cap
```

```text
# Codex
Audit this repository with cairo-auditor in default mode.
Audit src/contracts/account.cairo with cairo-auditor deep mode.
Run cairo-auditor deep with --file-output on this repo.
Audit src/contracts/account.cairo with cairo-auditor deep mode and --proven-only.
```

```bash
# Local deterministic scan (no AI, no cost)
python3 /path/to/cairo-auditor/scripts/quality/audit_local_repo.py \
  --repo-root /path/to/your/cairo-repo \
  --scan-id my-audit
```

Run this from the installed cairo-auditor skill directory, or keep using an absolute script path as shown above.

### Proven-only mode

Use `--proven-only` when you want severity to reflect executed proof strength:

- findings with strong evidence tags (`[PREFLIGHT-HIT]`, `[CROSS-AGENT]`, `[ADVERSARIAL]`) keep normal severity,
- findings backed only by `[CODE-TRACE]` are capped at `Low`.

This is useful for conservative release gates and benchmark runs.

## Known limitations

**Codebase size.** Works best under ~5,000 lines of Cairo. Past that, triage accuracy and mid-bundle recall degrade. For large codebases, audit per-module:

```text
/starknet-agentic-skills:cairo-auditor src/vault.cairo src/token.cairo
```

**What AI catches well.** Missing access controls, CEI violations, unsafe upgrades, zero-address initialization, unbounded loops, stale reads, type confusion.

**What AI misses.** Multi-transaction state setups, specification/invariant bugs, cross-protocol composability, game-theoretic attacks, off-chain oracle assumptions.

AI catches what humans forget to check. Humans catch what AI cannot reason about. You need both.

## How it works

The skill orchestrates a **4-turn pipeline**:

1. **Discover** — find in-scope `.cairo` files, run deterministic preflight scan
2. **Prepare** — build 4 code bundles, each paired with a different attack-vector partition
3. **Spawn** — launch 4 parallel vector specialists (+ optional adversarial in deep mode)
4. **Report** — merge findings, deduplicate by root cause, sort by confidence, apply formatting

Each vector agent scans the full codebase against ~30 attack vectors from its assigned partition (access control, external calls, math/economics, storage/trust). Every candidate finding goes through a strict false-positive gate requiring: (1) a concrete attack path, (2) a reachable entry point, and (3) confirmation that no existing guard blocks the exploit.

Confidence starts at 100 and is reduced by: privileged caller requirement (-25), partial attack path (-20), self-contained impact (-15), narrow preconditions (-10). Only findings passing the FP gate are reported.

## After the audit

1. **Triage by priority.** Fix P0 (Critical) findings first — these represent direct loss, permanent lock, or upgrade takeover.
2. **Apply the diffs.** Each above-threshold finding includes a fix diff. Apply it and review for side effects.
3. **Write the tests.** Each finding includes required test descriptions. Implement them before merging.
4. **Re-run to verify.** Run the auditor again after fixes to confirm findings are resolved.
5. **Supplement with manual review.** The auditor catches pattern-based issues. For specification bugs, economic attacks, and cross-protocol risks, pair with a human auditor.

If you believe a finding is a false positive, check whether the FP gate missed an existing guard. The confidence score reflects how certain the tool is that the finding is real — not how severe the impact is.

## Troubleshooting

### Common errors

**CAUD-001: No Cairo files found.**
The skill couldn't find any `.cairo` files to audit. Check your path and try with explicit filenames:
`/starknet-agentic-skills:cairo-auditor src/contracts/my_contract.cairo`

**CAUD-002: Preflight scan failed.**
The deterministic scanner couldn't run. Run it manually:
`python3 /path/to/cairo-auditor/scripts/quality/audit_local_repo.py --repo-root . --scan-id manual`

**CAUD-003: Agent bundle generation failed.**
The skill couldn't build one or more specialist bundles.
Fix: rebuild `{workdir}/cairo-audit-agent-*-bundle.md` and confirm each bundle has non-zero line count before rerunning.

**CAUD-004: Conflicting findings across agents.**
Two or more specialists disagreed on the same root cause.
Fix: keep the highest-confidence root cause and re-run targeted mode on the disputed file for a focused second pass.

**CAUD-005: Only low-confidence findings.**
Default mode didn't find high-confidence issues. Try deep mode for adversarial reasoning:
`/starknet-agentic-skills:cairo-auditor deep`

**CAUD-006: Deep mode unavailable.**
Your host can't spawn the 5 specialist agents deep mode needs.
Fix: run `/reload-plugins` and retry. If still failing, use `--allow-degraded` to accept reduced coverage, or fall back to default mode.

**CAUD-007: Preflight capability check failed.**
The host reported a required capability as unavailable before scanning started.
Fix: use `--allow-degraded` to accept reduced coverage, or switch to a host with full capability support.

**CAUD-008: Agent transport instability.**
A specialist disconnected or stalled during execution. The orchestrator retries once automatically.
Fix: retry the audit. If failures persist, use `--allow-degraded` to accept reduced coverage or try again when host load is lower.

**CAUD-009: Model requirement not satisfied.**
The requested model isn't available on your host. Remove `--strict-models` to allow documented fallback, or switch to a host that supports the required models.

**Plugin says "already at latest" but behavior is old.**
This is usually stale marketplace metadata or a project-scope override shadowing a user-scope install.
Fix:
`/plugin marketplace update keep-starknet-strange/starknet-agentic`
`/plugin uninstall starknet-agentic-skills@starknet-agentic-skills --scope local`
`/plugin install starknet-agentic-skills@starknet-agentic-skills --scope user`
`/reload-plugins`

### Deep mode details

Deep mode uses host-aware model routing:

- **Claude Code**: vector specialists use `sonnet`, adversarial uses `opus`
- **Codex**: all specialists prefer `gpt-5.4` (fallback `gpt-5.2` if probe fails)
- The execution trace in the report records the actual models used

For large codebases (largest file >1000 lines or any bundle >1400 lines), deep mode splits into two waves (Agents 1-4, then Agent 5) to preserve transport stability.

Optional threat-intel enrichment (deep mode only) pulls bounded security signals as prioritization hints for specialists. It never creates findings by itself — all findings require in-scope FP-gated proof.

### Verifying a deep run

**Codex:**

```bash
cat /tmp/cairo-audit-host-capabilities.json
wc -l /tmp/cairo-audit-agent-*-bundle.md
ls -lt security-review-*.md | head -n 1
```

Expect: capability file exists, four bundles with non-zero lines, latest report has `Execution Integrity: FULL`.

Or run the doctor script:

```bash
bash skills/cairo-auditor/scripts/doctor.sh --report-dir .
```

**Claude Code:**

Verify the plugin is loaded by running inside Claude Code:

```text
/starknet-agentic-skills:cairo-auditor deep
```

Then verify the generated report includes:

- `Execution Trace` rows for Agents 1-4 and Agent 5 adversarial,
- observed model labels (`sonnet` vectors, `opus` adversarial),
- `Execution Integrity: FULL` (or explicit degraded warning if `--allow-degraded` was intentionally used).

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
    attack-vectors/            # 170 vectors in 4 partitions
    vulnerability-db/          # 28 canonical vulnerability classes
    judging.md                 # FP gate + confidence scoring
    report-formatting.md       # finding template + priority mapping
    threat-intel-sources.md    # source policy for optional web enrichment
    semgrep/                   # optional Semgrep auxiliary rules
  scripts/
    README.md                  # runnable helpers and script entrypoints
    doctor.sh                  # one-command deep-run integrity check
  workflows/
    default.md                 # 4-agent pipeline reference
    deep.md                    # + adversarial agent details
```

## Maintainer reference

<details>
<summary>Release sync, full-power verification, and related tooling</summary>

### Release sync

```bash
python3 scripts/quality/sync_cairo_auditor_release.py \
  --skill-version 0.2.2 \
  --plugin-version 1.0.4
```

Updates: `VERSION`, `SKILL.md` metadata, `plugin.json`, `marketplace.json`.
`--skill-version` and `--plugin-version` are intentionally separate because skill and plugin lifecycle versions are decoupled.

Release hygiene gate: when `skills/cairo-auditor/VERSION` changes in CI, you must have either:

- git tag `v<version>`, or
- a GitHub release draft/published release for `v<version>`.

### Full-power verification (Codex)

```bash
cat /tmp/cairo-audit-host-capabilities.json
wc -l /tmp/cairo-audit-agent-*-bundle.md
ls -lt security-review-*.md | head -n 1
```

Expected: capability file reports `agent_tool` available, four bundles exist with non-zero lines, latest report has `Execution Integrity: FULL` and at least one finding on vulnerable fixtures.

</details>
