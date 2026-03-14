---
name: cairo-optimization-default-workflow
description: Phase-by-phase execution checklist for the cairo-optimization skill.
---

# Default Workflow

Orchestrated by [SKILL.md](../SKILL.md). This is the reference for each phase.

Where `{skill_dir}` is the directory containing this workflow's parent skill (`cairo-optimization/`).

## Phase 1 — Baseline

- Run `snforge test` to confirm all tests pass. Stop if any fail.
- Profile target paths with `python3 {skill_dir}/scripts/profile.py profile`.
- Use the emitted `<timestamp>_<package>_<name>_<metric>_<commit>.summary.txt` to rank hotspots for optimization planning. PNGs are optional visual aids.
- Record baseline metrics for later comparison.

## Phase 2 — Plan

- List top 3-5 functions by step cost.
- Match each hotspot to optimization rules from `references/legacy-full.md`.
- Identify anti-patterns from `references/anti-pattern-pairs.md`.
- For BoundedInt work: compute bounds with `python3 {skill_dir}/scripts/bounded_int_calc.py`.
- Wait for user confirmation before applying changes.

## Phase 3 — Optimize

- Apply one optimization class per commit.
- Run `snforge test` after each change — revert if tests fail.
- Re-profile after each change to measure actual impact.
- For BoundedInt: propagate types through function signatures, downcast only at boundaries.

## Phase 4 — Validate

- Run full test suite and compare before/after profiles.
- Record step deltas (absolute and percentage) per function.
- Reject changes that reduce readability without measurable gains.
- Document before/after metrics in the PR description.

## Phase 5 — Lock

- Run `cairo-auditor` on touched files to check for security regressions.
- Add or update benchmark cases in `evals/cases/contract_skill_benchmark.jsonl`.
- Add or update generation eval cases in `evals/cases/contract_skill_generation_eval.jsonl`.
- Link to concrete rewrites in `references/anti-pattern-pairs.md`.
