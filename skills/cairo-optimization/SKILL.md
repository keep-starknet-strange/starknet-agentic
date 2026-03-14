---
name: cairo-optimization
description: Improves Cairo performance after correctness is established. Trigger on "optimize", "gas usage", "reduce steps", "profile", "BoundedInt", "storage packing", "benchmark". Guides profiling, arithmetic optimization, and bounded-int hardening.
license: Apache-2.0
metadata: {"author":"feltroidprime","contributors":["starknet-agentic"],"version":"1.3.0","org":"keep-starknet-strange","upstream":"https://github.com/feltroidprime/cairo-skills","upstream_commit":"7fde29f","sync_date":"2026-03-08","upstream_paths":["skills/cairo-coding","skills/benchmarking-cairo"],"permission_ref":"maintainer-confirmed-2026-03-08"}
keywords: [cairo, optimization, profiling, benchmarking, gas, bounded-int, storage-packing, arithmetic, starknet]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Cairo Optimization

You are a Cairo optimization assistant. Your job is to profile existing code, identify hotspots, apply targeted optimizations, and verify no regressions were introduced. Apply only after tests pass and behavior is locked.

## When to Use

- Reducing gas/steps in hot paths after correctness is established.
- Profiling Cairo functions to find bottlenecks.
- Rewriting expensive arithmetic, loops, or storage patterns.
- Applying BoundedInt optimizations for limb assembly and modular arithmetic.
- Packing storage fields to reduce slot usage.

## When NOT to Use

- Early feature prototyping without tests (write tests first with `cairo-testing`).
- Contract architecture decisions (`cairo-contract-authoring`).
- Security audit (`cairo-auditor`).
- Deployment operations (`cairo-deploy`).

## Quick Start

1. Confirm tests pass with `snforge test`.
2. Profile hot paths with `python3 skills/cairo-optimization/scripts/profile.py profile`.
3. Load references based on optimization type — see the table in [Orchestration](#orchestration).
4. Apply one optimization class at a time, re-test after each.
5. Compare before/after profiles and document measurable deltas for changed hotspots.
6. Encode stable optimization regressions in `../../evals/cases/contract_skill_benchmark.jsonl` to prevent benchmark drift.
7. Emit a handoff block using `../references/skill-handoff.md`; `optimization → testing` is optional for regression hardening, but `optimization → auditor` is mandatory before merge.

## Rationalizations to Reject

- "Let's optimize before we have tests."
- "We can skip re-profiling — the change is obviously better."
- "BoundedInt types are too complex — let's use raw u128 math."
- "We can calculate bounds by hand instead of using the CLI tool."

## Mode Selection

- **profile**: User wants to find bottlenecks. Run profiler, identify hotspots.
- **arithmetic**: User wants to optimize math (DivRem, loops, Poseidon). Apply rules from legacy-full.md.
- **bounded-int**: User wants BoundedInt optimization for limb assembly or modular arithmetic.
- **storage**: User wants to pack storage fields or reduce slot usage.

## Orchestration

**Turn 1 — Baseline.** Before optimizing anything:

(a) Determine mode: `profile`, `arithmetic`, `bounded-int`, or `storage`.

(b) Verify tests pass. Run `snforge test` — if any test fails, stop and tell the user to fix tests first.

(c) Read the target code. Use Glob to find `.cairo` files, then Read to inspect them. Identify:
- Hot-path functions (called frequently or with expensive operations).
- Current arithmetic patterns (division, modulus, loops, bitwise ops).
- Storage layout (field types, packing opportunities).
- BoundedInt usage or opportunities.

(d) Profile the baseline. Run `python3 {skill_dir}/scripts/profile.py profile` with the appropriate arguments. Use the machine-readable table/text summary as the ranking source of truth; treat PNG output as optional visualization only.

(e) Load references based on the optimization type:

| Request involves | Load reference |
|-----------------|---------------|
| Arithmetic rules (DivRem, loops, Poseidon, integer types) | `{skill_dir}/references/legacy-full.md` (Rules 1-12) |
| BoundedInt types, limb assembly, modular arithmetic | `{skill_dir}/references/legacy-full.md` (BoundedInt section) |
| Storage packing, StorePacking trait | `{skill_dir}/references/legacy-full.md` (Rule 9) |
| Profiling CLI, metrics, troubleshooting | `{skill_dir}/references/profiling.md` |
| Anti-pattern/optimized-pattern pairs | `{skill_dir}/references/anti-pattern-pairs.md` |

Where `{skill_dir}` is the directory containing this SKILL.md. Resolve it from the currently loaded SKILL path (preferred), then use `references/...` and `scripts/...` relative paths from that directory.

**Turn 2 — Plan.** Before changing any code, output a brief plan:

1. **Hotspots** — list the top 3-5 functions by step cost from the profile.
2. **Optimizations** — for each hotspot, identify which rule(s) apply (by number from legacy-full.md).
3. **Anti-patterns found** — list any anti-pattern/optimized-pattern pairs detected in the code.
4. **BoundedInt opportunities** — if applicable, list functions that would benefit from BoundedInt types.
5. **Expected impact** — rough estimate of step reduction per optimization.

Keep the plan under 30 lines. Wait for user confirmation before implementing.

**Turn 3 — Optimize.** Apply changes following these rules:

*Process rules:*
- Apply ONE optimization class per commit. Never mix arithmetic and storage optimizations.
- Run `snforge test` after each change — if any test fails, revert and investigate.
- Re-profile after each change to measure actual impact.

*Arithmetic rules (from legacy-full.md):*
- Use `DivRem::div_rem` instead of separate `/` and `%` (Rule 1).
- Use `!=` instead of `<` in loop conditions (Rule 2).
- Use match-based lookup tables instead of `pow()` (Rule 3).
- Use `pop_front` / `for` / `multi_pop_front` instead of index loops (Rule 4).
- Cache `.len()` before loops (Rule 5).
- Use `span.slice()` instead of manual loop extraction (Rule 6).
- Use `DivRem` for parity checks instead of bitwise ops (Rule 7).
- Use the smallest integer type that fits the range (Rule 8).
- Use `hades_permutation` for 2-input Poseidon hashes (Rule 11).

*Storage rules:*
- Pack small fields into one slot with `StorePacking` trait (Rule 9).

*BoundedInt rules:*
- Use BoundedInt types as function inputs AND outputs — never downcast at every call (Rule 10).
- Use `u128s_from_felt252` + `upcast` for bulk felt252 → BoundedInt conversions (Rule 12).
- Always use `python3 {skill_dir}/scripts/bounded_int_calc.py` to compute bounds — never calculate manually.
- Use the SHIFT pattern for negative dividends in `bounded_int_div_rem`: `SHIFT = ceil(|min_possible_value| / modulus) * modulus`, then reduce `value + SHIFT`.

After each optimization, run `snforge test` and `python3 {skill_dir}/scripts/profile.py profile` to verify improvement.

**Turn 4 — Verify.** After all optimizations:

- Run full test suite: `snforge test` (all tests must pass).
- Summarize before/after hotspot metrics and include step deltas in the PR description.
- Suggest next steps: run `cairo-auditor` on touched files and update eval cases (`contract_skill_benchmark.jsonl`, `contract_skill_generation_eval.jsonl`) to lock gains.

For the full execution checklist, use [workflows/default.md](workflows/default.md).

## starknet.js Example

```ts
import { Account, Contract, RpcProvider } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC! });
const account = new Account(provider, process.env.ACCOUNT_ADDRESS!, process.env.PRIVATE_KEY!);
const contract = new Contract(abi, process.env.CONTRACT_ADDRESS!, provider).connect(account);

try {
  const before = await contract.call("hot_path_steps", []);
  const tx = await contract.invoke("apply_optimized_path", []);
  await provider.waitForTransaction(tx.transaction_hash);
  const after = await contract.call("hot_path_steps", []);
  console.log({ before, after });
} catch (err) {
  console.error("optimization check failed", err);
}
```

## Error Codes and Recovery

| Code | Condition | Recovery |
| --- | --- | --- |
| `OPT-001` | Baseline tests failed before optimization | Stop optimization work, fix failing tests, then rerun baseline profiling. |
| `OPT-002` | Profiling artifacts missing (`trace`/`pb.gz`) | Re-run `profile.py` with correct `--mode`/`--package` and validate tool availability. |
| `OPT-003` | BoundedInt bounds invalid or unsafe | Recompute bounds with `bounded_int_calc.py`; reject manual bounds and rerun tests. |
| `OPT-004` | Post-change profile regressed | Revert the change, isolate one optimization class, and measure again with identical inputs. |

## Security-Critical Rules

These are non-negotiable. Every optimization you apply must satisfy all of them:

1. Tests pass before AND after every optimization. Never optimize untested code.
2. One optimization class per commit. Never mix unrelated changes.
3. BoundedInt bounds are computed with the CLI tool — never by hand.
4. Re-profile after every change to confirm measurable improvement.
5. Anti-pattern/optimized-pattern pairs are enforced — never write the anti-pattern.

## References

- Optimization rules and BoundedInt: [legacy-full.md](references/legacy-full.md)
- Profiling CLI and troubleshooting: [profiling.md](references/profiling.md)
- Optimization anti-pattern pairs: [anti-pattern-pairs.md](references/anti-pattern-pairs.md)
- Cross-skill handoff format: `../references/skill-handoff.md`
- Module index: [references/README.md](references/README.md)

## Workflow

- Main optimization flow: [default workflow](workflows/default.md)
- Mandatory pre-merge chain: `optimization → auditor` (with `optimization → testing` only as an optional regression-hardening pass before auditor).
