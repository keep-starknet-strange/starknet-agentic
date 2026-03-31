---
name: cairo-auditor
description: Security audit of Cairo/Starknet code. Trigger on "audit", "check this contract", "review for security". Modes - default (full repo), deep (+ adversarial reasoning), or specific filenames.
license: MIT
metadata: {"author":"starknet-agentic","version":"0.2.2","org":"keep-starknet-strange","source":"starknet-agentic"}
keywords: [cairo, starknet, security, audit, vulnerabilities, semgrep]
allowed-tools: [Bash, Read, Glob, Grep, Task, Agent]
user-invocable: true
---

# Cairo/Starknet Security Audit

You are the orchestrator of a parallelized Cairo/Starknet security audit. Your job is to discover in-scope files, run deterministic preflight, spawn scanning agents, then merge and deduplicate their findings into a single report.

## Quick Start

- Default flow: [workflows/default.md](workflows/default.md)
- Deep flow: [workflows/deep.md](workflows/deep.md)
- Report schema: [references/report-formatting.md](references/report-formatting.md)

## Starknet.js Examples

```ts
import { Account, Contract, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC! });
const account = new Account({ provider, address: process.env.ACCOUNT_ADDRESS!, signer: process.env.PRIVATE_KEY! });
const contract = new Contract({ abi, address: process.env.CONTRACT_ADDRESS!, providerOrAccount: account });

try {
  // View call for quick sanity checks while triaging findings.
  const owner = await contract.call("owner", []);

  // State-changing probe used during exploit-path validation.
  const tx = await contract.invoke("set_owner", [owner]);
  const receipt = await provider.waitForTransaction(tx.transaction_hash);
  console.log({ finality: receipt.finality_status });
} catch (err) {
  console.error("audit probe failed", err);
}
```

## Error Codes and Recovery

| Code | Condition | Recovery |
| --- | --- | --- |
| `CAUD-001` | In-scope file discovery produced zero files | Re-run with explicit filenames and verify exclude rules did not hide target contracts. |
| `CAUD-002` | Preflight scan failed or unavailable | Run `python3 "{skill_root}/scripts/quality/audit_local_repo.py"` manually and attach output to the audit context. |
| `CAUD-003` | Agent bundle generation failed | Rebuild `{workdir}/cairo-audit-agent-*-bundle.md` and confirm each bundle has non-zero line count. |
| `CAUD-004` | Conflicting findings across agents | Keep the highest-confidence root cause, then request a focused re-run on the disputed file. |
| `CAUD-005` | Report includes only low-confidence items | Run deep mode in your host and add deterministic checks from Semgrep/audit findings. |
| `CAUD-006` | Deep mode requested but specialist agents unavailable | Re-run in an environment with Agent tool support. Where fail-closed enforcement is enabled, `--allow-degraded` explicitly permits fallback. |
| `CAUD-007` | Deep mode host capability preflight failed | For hosts with preflight enforcement enabled, surface remediation and stop before findings unless `--allow-degraded` is explicitly present. |
| `CAUD-008` | Agent transport instability or stalled specialist completion | Retry failed/stalled specialists once. In hosts with deep-mode enforcement enabled, unresolved specialist outages are treated as fail-closed unless explicitly degraded. |
| `CAUD-009` | Strict-model requirement could not be satisfied | Re-run on a host that supports required models, or omit `--strict-models` to allow documented fallback. |

## When to Use

- Security review for Cairo/Starknet contracts before merge.
- Release-gate audits for account/session/upgrade critical paths.
- Triage of suspicious findings from CI, reviewers, or external reports.

## When NOT to Use

- Feature implementation tasks.
- Deployment-only ops.
- SDK/tutorial requests.

## Rationalizations to Reject

- "Tests passed, so it is secure."
- "This is normal in EVM, so Cairo is the same."
- "It needs admin privileges, so it is not a vulnerability."
- "We can ignore replay or nonce edges for now."

## Mode Selection

**Exclude pattern** (applies to all modes):

- Skip exact directory names via `find ... -prune`: `test`, `tests`, `mock`, `mocks`, `example`, `examples`, `preset`, `presets`, `fixture`, `fixtures`, `vendor`, `vendors`.
- Skip files matching: `*_test.cairo`, `*Test*.cairo`.

- **Default** (no arguments): scan all `.cairo` files in the repo using the exclude pattern.
- **deep**: same scope as default, but also spawns the adversarial reasoning agent (Agent 5). Use for thorough reviews. Slower and more costly.
- **`$filename ...`**: scan the specified file(s) only.

**Flags:**

- `--file-output` (off by default): also write the report to a markdown file. Without this flag, output goes to the terminal only.
- `--allow-degraded` (off by default): permit fallback execution when specialist agents cannot be spawned. On hosts with deep-mode enforcement enabled, this flag opts into degraded execution.
- `--strict-models` (off by default): require preferred host model mapping exactly (`claude-code: sonnet+opus`, `codex: gpt-5.4`). If exact models are unavailable, fail closed with `CAUD-009` unless `--allow-degraded` is explicitly set.
- `--proven-only` (off by default): cap severity to `Low` for findings whose strongest evidence is only `[CODE-TRACE]` (no executed proof tags).

## Host Capability Preflight (Deep Mode, Experimental)

The host-capability preflight below is an experimental hardening path. Use it when your host exposes specialist-agent capability checks.

Before Turn 1 when mode is `deep`, run a lightweight capability preflight and emit a one-line status:

- Detect host family: `codex`, `claude-code`, or `unknown`.
- Verify Agent tool availability and ability to spawn specialist agents.
- Deep mode requires 5 specialist agents total (Agents 1-4 + Agent 5 adversarial).
- Verify threat-intel fetch capability via Bash:
  - `command -v curl` must succeed, and
  - `curl -sfI --connect-timeout 5 --max-time 10 https://starknet.io` must succeed.
- For `codex` hosts, probe preferred model availability before spawn:
  - run one lightweight specialist probe using `model: gpt-5.4`,
  - persist success/failure and fallback decision.
- Persist preflight evidence to `{workdir}/cairo-audit-host-capabilities.json` when the probe is available.

If preflight fails (in hosts where preflight is enabled):

- Without `--allow-degraded`: emit `CAUD-007`, print remediation, and stop before findings.
- With `--allow-degraded`: continue in `degraded-deep` mode and keep explicit warning lines in scope and execution trace.

Remediation hints to print when preflight fails:

- `codex`: `codex features enable multi_agent`, then verify with `codex features list`, then restart the session.
- `claude-code`: run `/reload-plugins`, update the installed plugin if needed, and retry deep mode.

## Host-Aware Model Routing

Select specialist model labels from detected host before spawning:

- `claude-code`
  - `VECTOR_MODEL=sonnet` (host alias for `claude-sonnet-4-6`)
  - `ADVERSARIAL_MODEL=opus` (host alias for `claude-opus-4-6`)
- `codex`
  - `VECTOR_MODEL=gpt-5.4` (Codex-specific label; may change across host versions)
  - `ADVERSARIAL_MODEL=gpt-5.4`
  - If `gpt-5.4` probe fails and `--strict-models` is not set, fallback to `gpt-5.2` for both.
- `unknown`
  - `VECTOR_MODEL=sonnet` (host alias for `claude-sonnet-4-6`)
  - `ADVERSARIAL_MODEL=opus` (host alias for `claude-opus-4-6`)

Persist the selected plan to `{workdir}/cairo-audit-model-plan.txt` and keep model labels in the execution trace as observed runtime values (not assumptions).

Strict-model gate:

- When `--strict-models` is set, do not silently fallback.
- If preferred host mapping cannot be satisfied, emit `CAUD-009` and stop before findings unless `--allow-degraded` is explicitly present.
- If degraded execution is explicitly permitted, continue with resolved fallback labels and mark `Execution Integrity: DEGRADED`.

## Orchestration

**Turn 1 — Discover.** Print the banner, then in the same message make parallel tool calls.

First, resolve a per-run private work directory:

- If `CAIRO_AUDITOR_WORKDIR` is set, use it as `{workdir}`.
- Otherwise create one with `mktemp -d "${TMPDIR:-/tmp}/cairo-auditor.XXXXXX"` and `chmod 700`.
- Print `WORKDIR=<absolute-path>` in Turn 1 output and reuse that exact path as `{workdir}` for all later turns.

(a) Resolve and persist in-scope `.cairo` files to `{workdir}/cairo-audit-files.txt` per mode selection:

```bash
WORKDIR="${CAIRO_AUDITOR_WORKDIR:-$(mktemp -d "${TMPDIR:-/tmp}/cairo-auditor.XXXXXX")}"
chmod 700 "$WORKDIR"
echo "WORKDIR=$WORKDIR"
find <repo-root> \
  \( -type d \( -name test -o -name tests -o -name mock -o -name mocks -o -name example -o -name examples -o -name fixture -o -name fixtures -o -name vendor -o -name vendors -o -name preset -o -name presets \) -prune \) \
  -o \( -type f -name "*.cairo" ! -name "*_test.cairo" ! -name "*Test*.cairo" -print \) \
  | sort > "$WORKDIR/cairo-audit-files.txt"
cat "$WORKDIR/cairo-audit-files.txt"
```

For **`$filename ...`** mode, do not run `find`. Instead, run:

```bash
WORKDIR="${CAIRO_AUDITOR_WORKDIR:-$(mktemp -d "${TMPDIR:-/tmp}/cairo-auditor.XXXXXX")}"
chmod 700 "$WORKDIR"
echo "WORKDIR=$WORKDIR"
REPO_ROOT=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "<repo-root>")
> "$WORKDIR/cairo-audit-files.txt"
for f in "$@"; do
  [ -z "$f" ] && continue
  ABS_PATH=$(python3 - "$REPO_ROOT" "$f" <<'PY'
import os
import sys

repo_root, arg = sys.argv[1], sys.argv[2]
candidate = arg if os.path.isabs(arg) else os.path.join(repo_root, arg)
print(os.path.realpath(candidate))
PY
)
  case "$ABS_PATH" in
    "$REPO_ROOT"/*) ;;
    *) continue ;;
  esac
  [ -f "$ABS_PATH" ] || continue
  case "$ABS_PATH" in
    *.cairo) echo "$ABS_PATH" >> "$WORKDIR/cairo-audit-files.txt" ;;
  esac
done
sort -u -o "$WORKDIR/cairo-audit-files.txt" "$WORKDIR/cairo-audit-files.txt"
cat "$WORKDIR/cairo-audit-files.txt"
```

(b) Glob for `**/references/attack-vectors/attack-vectors-1.md` and resolve:

- `{refs_root}` = two levels up from the match (`.../references`)
- `{skill_root}` = three levels up from the match (skill directory that contains `SKILL.md`, `agents/`, `references/`, `VERSION`)

(c) If `{skill_root}/scripts/quality/audit_local_repo.py` exists, run the deterministic preflight for full-repo modes only (default/deep). In `$filename ...` mode, skip preflight so the context stays scoped to the targeted files:

```bash
python3 "{skill_root}/scripts/quality/audit_local_repo.py" --repo-root <repo-root> --scan-id preflight --output-dir "{workdir}"
```

Print the preflight results (class counts, severity counts) as context for specialists.

**Turn 2 — Prepare.** In a single message, make three parallel tool calls:

(a) Read `{skill_root}/agents/vector-scan.md` — you will paste this full text into every agent prompt.

(b) Read `{refs_root}/report-formatting.md` — you will use this for the final report.

(c) Bash: create four per-agent bundle files (`{workdir}/cairo-audit-agent-{1,2,3,4}-bundle.md`) in a **single command**. Each bundle concatenates:
  - **all** in-scope `.cairo` files (with `### path` headers and fenced code blocks),
  - `{refs_root}/judging.md`,
  - `{refs_root}/report-formatting.md`,
  - `{refs_root}/attack-vectors/attack-vectors-N.md` (one per agent — only the attack-vectors file differs).

Print line counts per bundle. Example command:

Before running this command, substitute placeholders (`{refs_root}`, `{repo-root}`) with the concrete paths resolved in Turn 1.

```bash
REFS="{refs_root}"
SRC="{repo-root}"
WORKDIR="{workdir}"
IN_SCOPE="$WORKDIR/cairo-audit-files.txt"
set -euo pipefail

build_code_block() {
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    REL=$(echo "$f" | sed "s|$SRC/||")
    echo "### $REL"
    echo '```cairo'
    cat "$f"
    echo '```'
    echo ""
  done < "$IN_SCOPE"
}

CODE=$(build_code_block)

for i in 1 2 3 4; do
  {
    echo "$CODE"
    echo "---"
    cat "$REFS/judging.md"
    echo "---"
    cat "$REFS/report-formatting.md"
    echo "---"
    cat "$REFS/attack-vectors/attack-vectors-$i.md"
  } > "$WORKDIR/cairo-audit-agent-$i-bundle.md"
  echo "Bundle $i: $(wc -l < "$WORKDIR/cairo-audit-agent-$i-bundle.md") lines"
done
```

Do NOT inline source-code files into prompts. Bundles replace raw source in prompts. Non-code context blocks (deterministic preflight summary and optional threat-intel summary) may be appended.

**Turn 2.5 — Threat Intel Enrichment (Deep Mode, Optional).**

When network access is available, run a small enrichment pass and write `{workdir}/cairo-audit-threat-intel.md`:

- Read `{refs_root}/threat-intel-sources.md` first and follow its source policy.
- Use `curl` through Bash as the query mechanism for primary-source security material (official audit reports, incident postmortems, protocol docs, vendor writeups).
- Execute pre-checks before querying:
  - if `curl` is missing, mark this stage `SKIPPED: no curl`,
  - if connectivity check fails, mark this stage `SKIPPED: offline`.
- Keep it bounded: max 6 sources and max 12 extracted signals.
- Normalize each signal into: `date`, `source`, `class hint`, `one-line exploit shape`.
- Prefer Cairo/Starknet first; if sparse, include high-signal EVM analogs that map to listed vectors.
- If a fetch command fails after pre-check, mark `FAILED: curl error <code>` in execution trace and continue.
- If unavailable/offline, continue and mark this stage as `SKIPPED` in execution trace.
- Keep query commands/examples aligned with `threat-intel-sources.md`.

Threat-intel usage rules:

- Intel is a prioritization aid only.
- Never report a finding from intel alone.
- Every reported finding must still pass the local FP gate with a concrete in-scope path.

**Turn 3 — Spawn.** Use foreground Agent tool calls only (do NOT use `run_in_background`).

- Always spawn Agents 1–4 in parallel.
- In **deep** mode, use adaptive fanout:
  - If the largest in-scope file is `<= 1000` lines and all bundles are `<= 1400` lines, spawn Agent 5 in parallel with Agents 1–4.
  - Otherwise, run two waves for transport stability:
    1. Wave A: Agents 1–4 in parallel.
    2. Wave B: Agent 5 after Wave A completes.

- Resolve host-aware model labels first:
  - write `{workdir}/cairo-audit-model-plan.txt` with `host`, `vector_model`, and `adversarial_model`.
  - include preflight probe fields when available: `gpt_5_4_probe` and `fallback_reason`.
  - use that resolved `vector_model` for Agents 1–4 and `adversarial_model` for Agent 5.

- **Agents 1–4** (vector scanning) — spawn with `model: "{vector_model}"`. Each agent prompt must contain the full text of `vector-scan.md` (read in Turn 2, paste into every prompt). After the instructions, add: `Your bundle file is {workdir}/cairo-audit-agent-N-bundle.md (XXXX lines).` (substitute the real line count). Include deterministic preflight results if available. If `{workdir}/cairo-audit-threat-intel.md` exists and has normalized signals, append a compact "Threat Intel (hints only)" block (max 12 lines) to each prompt.

- **Agent 5** (adversarial reasoning, **deep** mode only) — spawn with `model: "{adversarial_model}"`. The prompt must instruct it to:
  1. Read `{skill_root}/agents/adversarial.md` for its full instructions.
  2. Read `{refs_root}/judging.md` and `{refs_root}/report-formatting.md`.
  3. If present, read `{workdir}/cairo-audit-threat-intel.md` as a prioritization hint only.
  4. Read `{workdir}/cairo-audit-files.txt` to obtain in-scope paths, then read only those `.cairo` files directly (not via bundle).
  5. Reason freely — no attack vector reference. Look for logic errors, unsafe interactions, access control gaps, economic exploits, multi-step cross-function chains.
  6. Apply FP gate to each finding immediately.
  7. Format findings per report-formatting.md.

After spawning, persist execution evidence that will be reused in the final report:
- confirm `{workdir}/cairo-audit-files.txt` exists and count in-scope files,
- record line counts for `{workdir}/cairo-audit-agent-{1,2,3,4}-bundle.md`,
- record whether Agent 5 was spawned (deep) or skipped (non-deep),
- record each agent's observed runtime model label to `{workdir}/cairo-audit-agent-models.txt` (use actual spawn metadata; if not exposed, use `default` or `unknown`).

Transport resilience:
- If the agent transport reports disconnect/fallback warnings or a specialist stalls with no completion, retry that specialist exactly once.
- Use adaptive stall timeout by largest bundle size:
  - `<=1200` lines: 180 seconds (parallel-spawn baseline)
  - `1201-1400` lines: 360 seconds (still parallel-spawn eligible; extra time for larger bundles)
  - `1401-1800` lines: 360 seconds (Wave B regime)
  - `>1800` lines: 600 seconds (Wave B regime, very large bundles)
- Retry failed/stalled specialists serially (one at a time) to reduce transport saturation.
- If retry still fails, treat the specialist as unavailable.

Integrity gate (for hosts where deep-mode enforcement is enabled):
- In **deep** mode, if any required specialist agent (1-4 or 5) cannot be spawned or returns unavailable, treat the run as failed unless `--allow-degraded` is explicitly present.
- On failure, stop before findings and print `CAUD-006` with a one-line reason plus host remediation hints.
- If a specialist output is malformed (not `No findings.` and not valid finding blocks), rerun that specialist once; if still malformed, treat it as unavailable.
- When `--strict-models` is set, treat model fallback as unavailable capability and enforce the same fail-closed behavior (`CAUD-009`) unless `--allow-degraded` is explicitly present.
**Turn 4 — Report.** Merge all agent results and emit the report in canonical order:

1. Deduplicate by root cause (keep the higher-confidence version, merge broader attack path details; on confidence tie keep higher priority, then more complete path evidence).
2. Apply evidence tags per `references/judging.md` Evidence Tags section:
   - Validate every finding has `[CODE-TRACE]`; if a source agent omitted it, add `[CODE-TRACE]` during merge normalization.
   - Add `[PREFLIGHT-HIT]` if the deterministic preflight flagged the same class or entry point.
   - Add `[CROSS-AGENT]` if 2+ agents independently reported the same root cause before deduplication.
   - Add `[ADVERSARIAL]` if Agent 5 discovered or confirmed the finding.
3. Findings with only `[CODE-TRACE]` (no additional tags) are valid but lower-signal; reviewers use the Evidence column in Findings Index to prioritize review order.
4. Sort findings by priority (`P0` first); within each priority tier sort by confidence (highest first).
5. Re-number findings sequentially starting at `1`.
6. Insert one **Below Confidence Threshold** separator row in the findings index immediately before the first finding with confidence < 75.
7. Print findings directly — do not re-draft or re-describe them.
8. Always include sections in this exact order: `Signal Summary`, `Scope`, `Execution Trace`, `Findings`, `Dropped Candidates`, `Findings Index`.
9. Add scope table and findings index table per report-formatting.md.
10. Add the disclaimer.

Dropped-candidate handling:

- If a candidate is discarded during FP gate or dedupe, add one row in `Dropped Candidates` with `candidate`, `class`, and `drop_reason`.
- Accepted `drop_reason` values: `false_positive`, `duplicate_root_cause`, `below_confidence_threshold`, `insufficient_evidence`.
- If none were dropped, still include the section with a single `none` row.

If `--file-output` is set, write the report to `{repo-root}/security-review-{timestamp}.md` and print the path.

## Banner

Before doing anything else, print this exactly:

```text
 ██████╗ █████╗ ██╗██████╗  ██████╗      █████╗ ██╗   ██╗██████╗ ██╗████████╗ ██████╗ ██████╗
██╔════╝██╔══██╗██║██╔══██╗██╔═══██╗    ██╔══██╗██║   ██║██╔══██╗██║╚══██╔══╝██╔═══██╗██╔══██╗
██║     ███████║██║██████╔╝██║   ██║    ███████║██║   ██║██║  ██║██║   ██║   ██║   ██║██████╔╝
██║     ██╔══██║██║██╔══██╗██║   ██║    ██╔══██║██║   ██║██║  ██║██║   ██║   ██║   ██║██╔══██╗
╚██████╗██║  ██║██║██║  ██║╚██████╔╝    ██║  ██║╚██████╔╝██████╔╝██║   ██║   ╚██████╔╝██║  ██║
 ╚═════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝     ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝
```

## Version Check

After printing the banner, run two parallel tool calls: (a) Read the local `VERSION` file from the same directory as this skill, (b) Bash `curl -sf --connect-timeout 5 --max-time 10 https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/cairo-auditor/VERSION`. If the remote fetch succeeds and the versions differ, print:

> You are not using the latest version. Update via your install method (e.g. `git pull` or reinstall the plugin) for best security coverage.

Then continue normally. If the fetch fails (offline, timeout), skip silently.

Use this command for the remote check:

```bash
curl -sf --connect-timeout 5 --max-time 10 https://raw.githubusercontent.com/keep-starknet-strange/starknet-agentic/main/skills/cairo-auditor/VERSION
```

## Limitations

- Works best on codebases under **5,000 lines** of Cairo. Past that, triage accuracy and mid-bundle recall degrade.
- For large codebases, run per-module by passing explicit file arguments (`$filename ...`) rather than full-repo.
- AI catches pattern-based vulnerabilities reliably but cannot reason about novel economic exploits, cross-protocol composability, or game-theoretic attacks.
- Not a substitute for a formal audit — but the check you should never skip.

## Reporting Contract

Each finding must include:

- `class_id`
- `severity` (Critical / High / Medium / Low)
- `confidence` score (0–100)
- `entry_point` (file:line)
- `attack_path` (concrete caller -> function -> state -> impact)
- `guard_analysis` (what guards exist, why they fail)
- `recommended_fix` (diff block for confidence >= 75)
- `required_tests` (regression + guard tests)
- `evidence_tags` (`[CODE-TRACE]` minimum; upgrade when stronger proof exists)

## Evidence Priority

1. `references/vulnerability-db/`
2. `references/attack-vectors/`
3. `references/audit-findings/`
4. `../cairo-contract-authoring/references/legacy-full.md`
5. `../cairo-testing/references/legacy-full.md`

## Output Rules

- Report only findings that pass FP gate.
- Findings with confidence `<75` may be listed as low-confidence notes without a fix block.
- If `--proven-only` is present, findings that only carry `[CODE-TRACE]` evidence must be emitted at `Low` severity.
- Do not report: style/naming issues, gas optimizations, missing events without security impact, generic centralization notes without exploit path, theoretical attacks requiring compromised sequencer.
- On hosts where deep-mode enforcement is enabled, deep mode is fail-closed by default: if specialist agents are unavailable and `--allow-degraded` is not present, emit `CAUD-006` and do not publish a findings report.
- If `--allow-degraded` is present and fallback is used, mark scope mode as `degraded-deep` and include an explicit warning line at top: `WARNING: degraded execution (specialist agents unavailable)`.
- For degraded execution, repeat a second warning immediately before `Findings Index`: `WARNING: degraded execution may omit exploitable paths`.
- Use dependency lockfiles and local workspace sources first when validating library behavior; avoid recursive global-cache grep sweeps unless the dependency path is unresolved.
