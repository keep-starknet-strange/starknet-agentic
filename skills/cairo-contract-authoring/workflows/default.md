---
name: cairo-contract-authoring-default-workflow
description: Phase-by-phase execution checklist for the cairo-contract-authoring skill.
---

# Default Workflow

Orchestrated by [SKILL.md](../SKILL.md). This is the reference for each phase.

## Phase 1 — Scope

- Define contract responsibilities and explicit non-goals.
- Freeze external interface signatures before deep implementation.
- Classify mode: `new` (scaffold from scratch), `modify` (change existing), `component` (wire/create OZ component).

## Phase 2 — Design

- Output interface plan: trait functions, params, return types, view vs external.
- Output storage plan: fields, types, maps.
- Output component plan: which OZ components, wiring checklist.
- Output events plan: emitted events, event params, and trigger points.
- Output security posture: for each external function, guarded or documented-public.
- Wait for user confirmation before implementing.

## Phase 3 — Implement

- Confirm ownership/ref semantics for mutable paths.
- Confirm trait/generic constraints for shared components.
- Encode invariants in storage layout and typed wrappers.
- Separate privileged and unprivileged mutation paths.
- Minimize public selectors.
- Add strict argument validation and auth checks.
- For timelocked paths, source time from `get_block_timestamp()` only.
- For upgrade paths, reject zero class hash values.
- Run `scarb build` to verify compilation.

## Phase 4 — Verify

- Re-check every external function against security rules.
- Run `snforge test` if tests exist.
- Suggest: `cairo-testing` for test coverage, then `cairo-auditor` for security review.

## Phase 5 — Handoff and Eval Lock

- Run `../references/audit-handoff.md` flow if security-sensitive.
- Execute local deterministic preflight:
  `python3 scripts/quality/audit_local_repo.py --repo-root <project-root> --scan-id handoff-audit`
- Patch findings and add regression tests.
- Distill fixed issue classes back into evals (`evals/cases/contract_skill_benchmark.jsonl` and `evals/cases/contract_skill_generation_eval.jsonl`) so guardrails stay enforced.
