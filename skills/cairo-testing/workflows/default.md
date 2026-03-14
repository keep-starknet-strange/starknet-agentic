---
name: cairo-testing-default-workflow
description: Phase-by-phase execution checklist for the cairo-testing skill.
---

# Default Workflow

Orchestrated by [SKILL.md](../SKILL.md). This is the reference for each phase.

## Phase 1 — Scope

- Identify the contract(s) under test and all external functions.
- Classify test mode: `unit`, `integration`, `fuzz`, `fork`, or `regression`.
- Check for existing tests and coverage gaps.

## Phase 2 — Plan

- Map every external function to: success test, failure test, event test.
- Identify access-controlled functions and their guard conditions.
- Identify fuzz targets (functions with numeric inputs or arithmetic).
- For regressions: describe the vulnerable path and the fix that should block it.
- Wait for user confirmation before implementing.

## Phase 3 — Implement

- Write shared helpers: `deploy_contract()`, address constants, setup functions.
- Write positive tests (happy path, correct caller, valid inputs).
- Write negative tests (`#[should_panic(expected: '...')]` for auth failures, bad inputs).
- Write event tests using `spy_events` + `assert_emitted`.
- Write fuzz tests with `#[fuzzer(runs: 256, seed: 12345)]` for numeric paths.
- Run `snforge test` to verify all tests pass.

## Phase 4 — Verify

- Walk the coverage checklist: every external function covered? Auth paths? Events? Edge cases?
- Report gaps to the user.
- Run `snforge test --detailed-resources` to capture gas baselines.

## Phase 5 — Handoff

- Suggest `cairo-auditor` to find additional vulnerabilities that need test coverage.
- Suggest `cairo-optimization` if gas baselines reveal expensive paths.
- For regressions: ensure failing-before/fixed-after evidence is documented in PR notes.
- Feed new/updated regression patterns back into `evals/cases/contract_skill_benchmark.jsonl` and `evals/cases/contract_skill_generation_eval.jsonl`.
