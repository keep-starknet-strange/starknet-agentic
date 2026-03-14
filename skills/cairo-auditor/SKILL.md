---
name: cairo-auditor
description: Security audit of Cairo/Starknet code. Trigger on "audit", "check this contract", "review for security". Modes - default (full repo), deep (+ adversarial reasoning), or specific filenames.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"0.2.1","org":"keep-starknet-strange","source":"starknet-agentic","migrated_from":"starknet-skills"}
allowed-tools: [Bash, Read, Glob, Grep, Task, Agent]
keywords: [cairo, starknet, audit, security, vulnerabilities, review]
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
import { Account, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC! });
const account = new Account(
  provider,
  process.env.ACCOUNT_ADDRESS!,
  process.env.ACCOUNT_PRIVATE_KEY!
);

// View path to inspect current state before triage decisions.
const read = await provider.callContract({
  contractAddress: process.env.CONTRACT_ADDRESS!,
  entrypoint: "get_state",
  calldata: [],
});
console.log({ read });

// Invoke path to reproduce a suspected vulnerable transition.
const tx = await account.execute({
  contractAddress: process.env.CONTRACT_ADDRESS!,
  entrypoint: "suspicious_path",
  calldata: ["1"],
});
const receipt = await provider.waitForTransaction(tx.transaction_hash);
console.log({ txHash: tx.transaction_hash, status: receipt.finality_status });
```

## Error Codes & Recovery

| Code | Condition | Recovery |
| --- | --- | --- |
| `AUD-001` | In-scope file discovery fails | Re-run with explicit filenames, verify repo root, and ensure `.cairo` files are reachable. |
| `AUD-002` | Bundle generation/preflight failure | Re-run deterministic preflight, fix path/tooling errors, and regenerate bundles before spawning agents. |
| `AUD-003` | Agent findings fail FP gate | Drop findings, capture rationale in notes, and continue with confirmed findings only. |
| `AUD-004` | Low-confidence finding only (`<75`) | Keep as note without fix block and request targeted repro/test evidence. |
| `AUD-005` | Conflicting findings across agents | Deduplicate by root cause, preserve higher-confidence path, and include merged evidence. |

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

## Orchestration

**Turn 1 — Discover.** Print the banner, then in the same message make parallel tool calls:

(a) Resolve and persist in-scope `.cairo` files to `/tmp/cairo-audit-files.txt` per mode selection:

```bash
find <repo-root> \
  \( -type d \( -name test -o -name tests -o -name mock -o -name mocks -o -name example -o -name examples -o -name fixture -o -name fixtures -o -name vendor -o -name vendors -o -name preset -o -name presets \) -prune \) \
  -o \( -type f -name "*.cairo" ! -name "*_test.cairo" ! -name "*Test*.cairo" -print \) \
  | sort > /tmp/cairo-audit-files.txt
cat /tmp/cairo-audit-files.txt
```

For **`$filename ...`** mode, do not run `find`. Instead, run:

```bash
REPO_ROOT=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "<repo-root>")
> /tmp/cairo-audit-files.txt
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
    *.cairo) echo "$ABS_PATH" >> /tmp/cairo-audit-files.txt ;;
  esac
done
sort -u -o /tmp/cairo-audit-files.txt /tmp/cairo-audit-files.txt
cat /tmp/cairo-audit-files.txt
```

(b) Glob for `**/references/attack-vectors/attack-vectors-1.md` and resolve:

- `{refs_root}` = two levels up from the match (`.../references`)
- `{skill_root}` = three levels up from the match (skill directory that contains `SKILL.md`, `agents/`, `references/`, `VERSION`)

(c) If `scripts/quality/audit_local_repo.py` exists relative to the skill's repo root, run the deterministic preflight for full-repo modes only (default/deep). In `$filename ...` mode, skip preflight so the context stays scoped to the targeted files:

```bash
python3 scripts/quality/audit_local_repo.py --repo-root <repo-root> --scan-id preflight --output-dir /tmp
```

Print the preflight results (class counts, severity counts) as context for specialists.

**Turn 2 — Prepare.** In a single message, make three parallel tool calls:

(a) Read `{skill_root}/agents/vector-scan.md` — you will paste this full text into every agent prompt.

(b) Read `{refs_root}/report-formatting.md` — you will use this for the final report.

(c) Bash: create four per-agent bundle files (`/tmp/cairo-audit-agent-{1,2,3,4}-bundle.md`) in a **single command**. Each bundle concatenates:
  - **all** in-scope `.cairo` files (with `### path` headers and fenced code blocks),
  - `{refs_root}/judging.md`,
  - `{refs_root}/report-formatting.md`,
  - `{refs_root}/attack-vectors/attack-vectors-N.md` (one per agent — only the attack-vectors file differs).

Print line counts per bundle. Example command:

Before running this command, substitute placeholders (`{refs_root}`, `{repo-root}`) with the concrete paths resolved in Turn 1.

```bash
REFS="{refs_root}"
SRC="{repo-root}"
IN_SCOPE="/tmp/cairo-audit-files.txt"
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
  } > "/tmp/cairo-audit-agent-$i-bundle.md"
  echo "Bundle $i: $(wc -l < /tmp/cairo-audit-agent-$i-bundle.md) lines"
done
```

Do NOT read or inline any file content into agent prompts — the bundle files replace that entirely.

**Turn 3 — Spawn.** In a single message, spawn all agents as parallel foreground Agent tool calls (do NOT use `run_in_background`). Always spawn Agents 1–4. Only spawn Agent 5 when the mode is **deep**.

- **Agents 1–4** (vector scanning) — spawn with `model: "sonnet"`. Each agent prompt must contain the full text of `vector-scan.md` (read in Turn 2, paste into every prompt). After the instructions, add: `Your bundle file is /tmp/cairo-audit-agent-N-bundle.md (XXXX lines).` (substitute the real line count). Include the deterministic preflight results if available so agents have extra context.

- **Agent 5** (adversarial reasoning, **deep** mode only) — spawn with `model: "opus"`. The prompt must instruct it to:
  1. Read `{skill_root}/agents/adversarial.md` for its full instructions.
  2. Read `{refs_root}/judging.md` and `{refs_root}/report-formatting.md`.
  3. Read `/tmp/cairo-audit-files.txt` to obtain in-scope paths, then read only those `.cairo` files directly (not via bundle).
  4. Reason freely — no attack vector reference. Look for logic errors, unsafe interactions, access control gaps, economic exploits, multi-step cross-function chains.
  5. Apply FP gate to each finding immediately.
  6. Format findings per report-formatting.md.

**Turn 4 — Report.** Merge all agent results:

1. Deduplicate by root cause (keep the higher-confidence version, merge broader attack path details).
2. Sort by confidence highest-first.
3. Re-number sequentially.
4. Insert the **Below Confidence Threshold** separator row at confidence < 75.
5. Print findings directly — do not re-draft or re-describe them.
6. Add scope table and findings index table per report-formatting.md.
7. Add the disclaimer.

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

> You are not using the latest version. Run `/plugin update starknet-agentic-skills@keep-starknet-strange-starknet-agentic` for best security coverage.

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

## Evidence Priority

1. `references/vulnerability-db/`
2. `references/attack-vectors/`
3. `../../datasets/normalized/findings/`
4. `../../datasets/distilled/vuln-cards/`
5. `../../evals/cases/`

## Output Rules

- Report only findings that pass FP gate.
- Findings with confidence `<75` may be listed as low-confidence notes without a fix block.
- Do not report: style/naming issues, gas optimizations, missing events without security impact, generic centralization notes without exploit path, theoretical attacks requiring compromised sequencer.
