# Deep Workflow

Extends default with adversarial reasoning. Orchestrated by [SKILL.md](../SKILL.md).

## Pipeline

1. **Discover** — same as default.
2. **Prepare** — same as default, plus resolve adversarial agent instructions.
3. **Spawn** — Adaptive deep fanout:
   - small scopes (largest file <= 1000 lines **and** all bundles <= 1400 lines): 4 parallel vector specialists + 1 adversarial specialist in parallel (host-aware model routing).
   - large scopes: two waves for reliability (Wave A: Agents 1-4, Wave B: Agent 5).
4. **Report** — Merge all 5 agent outputs, deduplicate, sort, emit.

## Agent Configuration

| Agent | Model | Input | Role |
|-------|-------|-------|------|
| 1–4 | host-aware (`claude-code: sonnet`, `codex: gpt-5.4`) | Bundle files | Vector scan (same as default) |
| 5 | host-aware (`claude-code: opus`, `codex: gpt-5.4`) | Direct file reads + adversarial.md | Free-form adversarial reasoning |

`--strict-models` disables fallback and fails closed if preferred host models are unavailable.

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
