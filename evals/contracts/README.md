# Contract Benchmark Fixtures

Deterministic Cairo contract fixtures used by `scripts/quality/benchmark_contract_skills.py`.

## Fixtures

- `secure_owned_vault/`: a contract that follows `cairo-contract-authoring` + `cairo-optimization` guidance (owner guard, constructor non-zero check, `DivRem::div_rem` split pattern).
- `insecure_owned_vault/`: intentionally weak variant used as a negative control (missing owner guard, split via `/` + `%`).
- `secure_upgrade_controller/`: timelocked upgrade flow with owner + non-zero guards.
- `insecure_upgrade_controller/`: immediate upgrade path with missing guards.
- `secure_math_patterns/`: arithmetic and loop patterns aligned with optimization guidance.
- `insecure_math_patterns/`: anti-pattern math and loop variants used as negative controls.

Each fixture is a standalone Scarb package with local unit tests runnable via `snforge test`.

Case pack rules are organized by security class and applied across secure/insecure fixture pairs:

- `auth`
- `input_validation`
- `timelock`
- `upgrade_safety`
- `optimization_arithmetic`
- `optimization_loops`
