# Deep Workflow

Extends default with adversarial reasoning. Orchestrated by [SKILL.md](../SKILL.md).

## Pipeline

1. **Discover** — same as default.
2. **Prepare** — same as default, plus generate `{workdir}/cairo-audit-surface-map.md` (now including **Component Resolution** and **Routing & Complexity** sections), persist `{workdir}/cairo-audit-routing.json`, build a shared cacheable bundle prefix, and resolve adversarial agent instructions.
3. **Threat Intel (optional)** — run bounded `curl`-based enrichment and persist `{workdir}/cairo-audit-threat-intel.md`; include SKIPPED/FAILED reason in execution trace when unavailable.
4. **Spawn** — Adaptive deep fanout (see Cost Controls for caching, relevance routing, complexity gating, and density escalation):
   - small scopes (largest file <= 1000 lines **and** all bundles <= 1400 lines): 4 parallel vector specialists + 1 adversarial specialist in parallel (host-aware model routing, shared cached source prefix).
   - large scopes: two waves for reliability (Wave A: Agents 1-4, Wave B: Agent 5), with relevance-routed per-agent source.
5. **Report** — Merge all structured JSON outputs, deduplicate, apply optional `--proven-only` severity cap for `[CODE-TRACE]`-only findings, sort, render Markdown, then run integrity validation. (Agent 5 may be skipped/downgraded by the complexity gate; the report records which.)

## Agent Configuration

| Agent | Model | Input | Role |
|-------|-------|-------|------|
| 1–4 | host-aware (`claude-code: sonnet`, `codex: gpt-5.4`) | Bundle files (+ optional threat-intel hints) | Vector scan (same as default) |
| 5 | host-aware (`claude-code: opus`, `codex: gpt-5.4`) | Direct file reads + surface map + adversarial.md (+ optional threat-intel hints) | Free-form adversarial reasoning |

Codex fallback is `gpt-5.2` when `gpt-5.4` probe fails and `--strict-models` is not set.
`--strict-models` disables fallback and fails closed if preferred host models are unavailable.
`--proven-only` caps `[CODE-TRACE]`-only findings at Low severity for conservative release gates.

## Cost Controls

Deep mode sends the full source to four vector agents and reads it again for
Agent 5 — roughly 5× source ingestion. These controls cut that cost without
losing coverage. They are on by default; flags only override the automatic
choice.

### Shared cached source prefix (caching)

The four vector bundles share an identical leading block (source +
`judging.md` + `structured-findings.md` + `report-formatting.md`); only the
trailing attack-vector partition differs. Turn 2 builds that block once as
`{workdir}/cairo-audit-shared-prefix.md` and composes each bundle as
`prefix + attack-vectors-N.md`. When spawning, put the byte-identical prefix
(plus the identical `vector-scan.md` instructions) at the **start** of every
agent prompt and the per-agent attack-vector file + line-count tail at the
**end**. On hosts with prompt caching (claude-code, codex), agents 2–4 then
reuse the cached prefix instead of re-ingesting source — the dominant token
cost — at roughly cache-hit pricing.

### Relevance-routed source (large scopes)

`surface_map.py --output-routing` writes `{workdir}/cairo-audit-routing.json`
mapping each file to the vector partitions it is relevant to (1: access/upgrade,
2: external calls/reentrancy, 3: math/economics, 4: storage/components/trust).

- **Small scopes** (bundles already cache-eligible, ≤ 1400 lines): keep the full
  shared cached source for all four agents — caching already makes the 4× cheap.
- **Large scopes** (> 1400-line bundles, where caching helps least and source
  duplication costs most): give each vector agent only the files its partition
  is relevant to, per `routing.json`. A file with no resolved signal stays in
  all four partitions so nothing is orphaned. Agent 5 still reads the full
  in-scope set directly.

### Complexity-gated Agent 5

`routing.json.complexity` carries `score`, `threshold` (3), and
`adversarial_action`:

- `full` (score ≥ 3): spawn Agent 5 on the adversarial model (opus / gpt-5.4).
- `downgrade` (1–2): spawn Agent 5 on the cheaper vector model — it still adds a
  free-reasoning pass, but a low-interaction contract does not warrant opus.
- `skip` (score 0, e.g. pure getters/no interaction/auth/upgrade surface): skip
  Agent 5 and record `SKIPPED: complexity gate (score 0)` in the Execution
  Trace. The report mode stays `deep`.

`--force-adversarial` overrides the gate and always runs Agent 5 on the full
adversarial model. Print the gate decision and reasons in Turn 3 output.

### Density-based model escalation

Vector agents 1–4 run on the cheap vector model first. After they return, run
`escalation_plan.py --workdir {workdir}` to list the files that surfaced a
finding, a P0/P1, or a borderline candidate. Only those files are worth an
opus/adversarial re-check; pass that file list to Agent 5 (or a focused opus
re-scan) and leave the clean files on the cheap model. Most files in a typical
contract are clean, so this concentrates premium-model spend where pass-1 found
signal.

## Agent 5 — Adversarial Specialist

- No attack vector reference — reasons freely about logic errors, unsafe interactions, multi-step chains.
- Reads the generated surface map first, then all in-scope files directly (not via bundle).
- Focuses on: cross-function boundary reasoning, trust-chain composition, session/account interplay, upgrade failure modes.
- Applies FP gate and confidence scoring per `judging.md`.
- Emits structured JSON matching `structured-findings.md`.
- Higher cost but catches findings that pattern-based scanning misses.

## When to Use Deep Mode

- Pre-deployment security review for high-value contracts.
- Contracts with complex account abstraction, session key, or multi-sig logic.
- When default mode findings suggest deeper issues worth investigating.
- Release-gate audits where thoroughness outweighs speed.
