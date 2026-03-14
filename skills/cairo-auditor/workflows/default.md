# Default Workflow

Standard 4-agent parallel scan. Orchestrated by [SKILL.md](../SKILL.md).

## Pipeline

1. **Discover** — `find` in-scope `.cairo` files, run deterministic preflight.
2. **Prepare** — Read `vector-scan.md`, build 4 bundle files (code + judging + formatting + one attack-vector partition each).
3. **Spawn** — 4 parallel vector specialists (`model: "sonnet"`), each triages vectors, deep-checks survivors, applies FP gate.
4. **Report** — Merge, deduplicate by root cause, sort by confidence, emit with scope table and disclaimer.

## Agent Configuration

| Agent | Model | Input | Role |
|-------|-------|-------|------|
| 1 | sonnet | Bundle 1 (Access Control + Upgradeability) | Vector scan |
| 2 | sonnet | Bundle 2 (External Calls + Reentrancy) | Vector scan |
| 3 | sonnet | Bundle 3 (Math + Pricing + Economics) | Vector scan |
| 4 | sonnet | Bundle 4 (Storage + Components + Trust) | Vector scan |

## Confidence Threshold

- Findings >= 75: full report with fix diff and required tests.
- If confidence is < 75: keep as low-confidence notes, no fix block.
- If the FP gate fails: drop the item entirely.
