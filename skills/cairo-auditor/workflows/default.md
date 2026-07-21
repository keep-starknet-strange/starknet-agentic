# Default Workflow

Standard 4-agent parallel scan. Orchestrated by [SKILL.md](../SKILL.md).

## Pipeline

1. **Discover** — `find` in-scope `.cairo` files, run deterministic preflight.
2. **Prepare** — Read `vector-scan.md`, build a static surface map (with Component Resolution facts), build a shared cacheable bundle prefix, then compose 4 bundle files as `prefix + one attack-vector partition each`.
3. **Spawn** — 4 parallel vector specialists with host-aware vector model (`claude-code: sonnet`, `codex: gpt-5.4` with fallback `gpt-5.2`), each triages vectors, deep-checks survivors, applies FP gate, and emits structured JSON. Order each prompt with the identical bundle prefix leading so prompt-caching hosts reuse it across agents (see deep mode Cost Controls → "Shared cached source prefix").
4. **Report** — Merge structured JSON, deduplicate by root cause, apply optional `--proven-only` severity cap for `[CODE-TRACE]`-only findings, sort by confidence, render Markdown with `structured_report.py`.

## Cost & Coverage Notes

- The shared cacheable bundle prefix (#5) applies here too: the four bundles
  differ only in their trailing attack-vector partition, so the leading source +
  reference block is reused across agents on prompt-caching hosts.
- Default mode does **not** run the adversarial agent, so cross-partition chains
  (root causes spanning two vector lenses) are weakly covered. Use `deep` mode
  when boundary-spanning composition matters — see [deep.md](deep.md).

## Agent Configuration

| Agent | Model | Input | Role |
|-------|-------|-------|------|
| 1 | host-aware vector model | Bundle 1 (Access Control + Upgradeability) | Vector scan |
| 2 | host-aware vector model | Bundle 2 (External Calls + Reentrancy) | Vector scan |
| 3 | host-aware vector model | Bundle 3 (Math + Pricing + Economics) | Vector scan |
| 4 | host-aware vector model | Bundle 4 (Storage + Components + Trust) | Vector scan |

## Confidence Threshold

- Findings >= 75: full report with fix diff and required tests.
- If confidence is < 75: keep as low-confidence notes, no fix block.
- If `--proven-only` is set and a finding is `[CODE-TRACE]` only: cap severity to Low.
- If the FP gate fails: drop the item entirely.
