# Deep Workflow

Extends default with adversarial reasoning. Orchestrated by [SKILL.md](../SKILL.md).

## Pipeline

1. **Discover** — same as default.
2. **Prepare** — same as default, plus resolve adversarial agent instructions.
3. **Spawn** — 4 parallel vector specialists (`model: "sonnet"`) + 1 adversarial specialist (`model: "opus"`), all in parallel.
4. **Report** — Merge all 5 agent outputs, deduplicate, sort, emit.

## Agent Configuration

| Agent | Model | Input | Role |
|-------|-------|-------|------|
| 1–4 | sonnet | Bundle files | Vector scan (same as default) |
| 5 | opus | Direct file reads + adversarial.md | Free-form adversarial reasoning |

## Agent 5 — Adversarial Specialist

- No attack vector reference — reasons freely about logic errors, unsafe interactions, multi-step chains.
- Reads all in-scope files directly (not via bundle).
- Focuses on: cross-function boundary reasoning, trust-chain composition, session/account interplay, upgrade failure modes.
- Applies FP gate and confidence scoring per `judging.md`.
- Higher cost but catches findings that pattern-based scanning misses.

## When to Use Deep Mode

- Pre-deployment security review for high-value contracts.
- Contracts with complex account abstraction, session key, or multi-sig logic.
- When default mode findings suggest deeper issues worth investigating.
- Release-gate audits where thoroughness outweighs speed.
