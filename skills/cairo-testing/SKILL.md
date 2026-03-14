---
name: cairo-testing
description: Cairo smart-contract testing with snforge. Trigger on "write tests", "add unit tests", "fuzz test", "integration test", "test this contract", "regression test". Guides test strategy, cheatcode usage, and coverage.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"0.2.1","org":"keep-starknet-strange","source":"starknet-agentic","migrated_from":"starknet-skills"}
keywords: [cairo, testing, snforge, starknet-foundry, fuzzing, integration]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Cairo Testing

You are a Cairo testing assistant. Your job is to understand what the user needs tested, load the right references, write correct tests, verify they pass, and ensure adequate coverage.

## When to Use

- Writing unit, integration, fuzz, or fork tests for Cairo contracts.
- Designing regression tests for known findings.
- Validating event emission, failure semantics, or access control.
- Improving test coverage on an existing contract.

## When NOT to Use

- Contract architecture decisions (`cairo-contract-authoring`).
- Performance tuning (`cairo-optimization`).
- Deployment operations (`cairo-deploy`).
- Security audit of existing code (`cairo-auditor`).

## Quick Start

1. Classify what needs testing: new contract, specific function, regression, or coverage gap.
2. Load references based on test type — see the table in [Orchestration](#orchestration).
3. Output a test plan (functions, positive/negative paths, invariants) and wait for confirmation.
4. Implement tests following snforge patterns, then run `snforge test`.
5. Verify coverage: every external tested? auth paths? negative cases? events?
6. Emit a handoff block using `../references/skill-handoff.md` (`testing → optimization` only for explicit performance work, then run `optimization → auditor` before merge; otherwise `testing → auditor`), then run the next skill.

## Rationalizations to Reject

- "We only need happy-path tests."
- "Access control tests are unnecessary — the contract handles it."
- "Fuzz tests are overkill for this contract."
- "We'll add regression tests after the next audit."

## Mode Selection

- **unit**: Test individual functions using `contract_state_for_testing()`. No deployment needed.
- **integration**: Test deployed contracts via dispatchers. Multi-contract interactions.
- **fuzz**: Property-based tests with `#[fuzzer]` for arithmetic, bounds, invariants.
- **fork**: Test against live Starknet state with `#[fork]`.
- **regression**: Turn a known finding into a failing-before/fixed-after test pair.

## Orchestration

**Turn 1 — Understand.** Classify the request:

(a) Determine mode: `unit`, `integration`, `fuzz`, `fork`, or `regression`.

(b) Read the contract under test. Use Glob to find `.cairo` files, then Read to inspect them. Identify:
- All storage-mutating `#[abi(embed_v0)]` impl functions and `#[external(v0)]` functions (these must be tested).
- Storage fields and their types.
- Events that should be emitted.
- Access control patterns (owner checks, role checks).

(c) Check for existing tests. Use Glob to find `tests/` directories and test files.

(d) Load references based on what's needed:

| Request involves | Load reference |
|-----------------|---------------|
| Basic test structure, deployment, assertions | `{skill_dir}/references/legacy-full.md` (Basic Test Structure, Contract Deployment) |
| Cheatcodes (caller, timestamp, block number) | `{skill_dir}/references/legacy-full.md` (Cheatcodes section) |
| Event testing, spy_events | `{skill_dir}/references/legacy-full.md` (Event Testing section) |
| Fuzz / property tests | `{skill_dir}/references/legacy-full.md` (Fuzzing section) |
| Fork testing against mainnet | `{skill_dir}/references/legacy-full.md` (Fork Testing section) |
| Security regression recipes | `../../datasets/distilled/test-recipes/` |

Where `{skill_dir}` is the directory containing this SKILL.md. Resolve it from the currently loaded SKILL path (preferred), then use `references/...` relative paths from that directory.

**Turn 2 — Plan.** Before writing any test code, output a brief plan:

1. **Functions to test** — list each external function and whether it gets a positive test, negative test, or both.
2. **Access control tests** — for each guarded function, test: authorized caller succeeds, unauthorized caller reverts.
3. **Event tests** — list events that should be verified with `spy_events`.
4. **Edge cases** — zero values, max values, duplicate calls, reentrancy attempts.
5. **Fuzz targets** — identify functions with numeric inputs that should get `#[fuzzer]` tests.
6. **Regression tests** — if fixing a known finding, describe the failing-before scenario.

Keep the plan under 30 lines. Wait for user confirmation before implementing.

**Turn 3 — Implement.** Write tests following these rules:

*Structure rules:*
- Use `#[cfg(test)] mod tests { ... }` for unit tests in the same file, or separate `tests/` directory for integration tests.
- Create a shared `helpers` module for `deploy_contract()`, address constants (`OWNER()`, `USER()`, `ZERO()`).
- Name tests descriptively: `test_<function>_<scenario>` (e.g., `test_transfer_non_owner_rejected`).

*Coverage rules (mandatory):*
- Every storage-mutating `#[abi(embed_v0)]` impl function and `#[external(v0)]` function MUST have both a success test and a revert test.
- Every access-controlled function MUST be tested with: (1) authorized caller succeeds, (2) unauthorized caller panics with expected message.
- Constructor MUST be tested: correct initial state, zero-address rejection.
- Every event-emitting function MUST verify the event with `spy_events` + `assert_emitted`.

*Cheatcode rules:*
- Use `start_cheat_caller_address` / `stop_cheat_caller_address` to impersonate callers.
- Use `start_cheat_block_timestamp` for timelock tests — never hardcode timestamps.
- Always call the matching `stop_cheat_*` after assertions to avoid leaking state.

*Fuzz rules:*
- Use `#[fuzzer(runs: 256, seed: 12345)]` with a fixed seed for reproducibility.
- Constrain inputs with guard clauses or bounded types, not by ignoring invalid inputs.

After writing tests, run `snforge test` to verify they pass. If any fail, fix and re-run.

**Turn 4 — Verify.** After tests pass:

(a) Coverage checklist — mentally walk through every external function:
- Has a success-path test?
- Has a failure-path test (wrong caller, bad input, overflow)?
- Emits correct events?
- Fuzz target if numeric inputs?

(b) Report any untested functions or missing edge cases to the user.

(c) If the user's project uses `cairo-auditor`, suggest running it to find additional test targets.

(d) Suggest next steps:
- "Run `cairo-auditor` for a security review — it may surface additional test cases."
- "Consider adding fork tests if this contract interacts with deployed protocols."

## Security-Critical Rules

These are non-negotiable. Every test suite you write must satisfy all of them:

1. Every storage-mutating external function has both a positive and negative test.
2. Every access-controlled function is tested with authorized and unauthorized callers.
3. Expected panic messages are asserted with `#[should_panic(expected: '...')]` — not bare `#[should_panic]`.
4. Event assertions use `spy_events` + `assert_emitted` with full event data — not just event count.
5. Fuzz tests use fixed seeds for reproducibility.

## References

- Testing patterns and snforge API: [legacy-full.md](references/legacy-full.md)
- Cross-skill handoff format: `../references/skill-handoff.md`
- Module index: [references/README.md](references/README.md)
- Security regression recipes: `../../datasets/distilled/test-recipes/`

## Workflow

- Main testing flow: [default workflow](workflows/default.md)

## Eval Gate

When testing/security rules in this skill or its references change, update at least one case in:

- `evals/cases/contract_skill_benchmark.jsonl`
- `evals/cases/contract_skill_generation_eval.jsonl`
