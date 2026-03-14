---
name: cairo-optimization-readme
description: User-facing guide for the cairo-optimization skill workflow, profiling flow, and optimization rules.
---

# cairo-optimization

Optimize Cairo smart contracts on Starknet — profile first, optimize second, verify always.

<p>
  <img alt="mode profile" src="https://img.shields.io/badge/mode-profile-0969da" />
  <img alt="mode arithmetic" src="https://img.shields.io/badge/mode-arithmetic-0969da" />
  <img alt="mode bounded-int" src="https://img.shields.io/badge/mode-bounded--int-0969da" />
  <img alt="mode storage" src="https://img.shields.io/badge/mode-storage-0969da" />
  <img alt="optimization rules" src="https://img.shields.io/badge/optimization%20rules-12-2ea043" />
</p>

Built for:

- **Cairo devs** reducing gas/steps in hot paths after tests pass
- **Teams** applying BoundedInt optimizations for modular arithmetic and limb assembly
- **Anyone** profiling contract execution to find and fix bottlenecks

## Usage

```bash
# Profile and optimize a contract
/cairo-optimization

# Specific requests
/cairo-optimization "profile my NTT function and find hotspots"
/cairo-optimization "convert this arithmetic to BoundedInt"
/cairo-optimization "pack these storage fields into fewer slots"
```

## How it works

The skill orchestrates a **4-turn workflow**:

| Turn | What happens |
|------|-------------|
| **1. Baseline** | Confirm tests pass, profile hot paths, identify top hotspots |
| **2. Plan** | Match hotspots to optimization rules, list anti-patterns. Wait for confirmation. |
| **3. Optimize** | Apply one class at a time, re-test and re-profile after each change |
| **4. Verify** | Compare before/after profiles, report step deltas, suggest `cairo-auditor` |

## Optimization rules (12 rules, always enforced)

| # | Instead of | Use |
|---|-----------|-----|
| 1 | `x / m` + `x % m` | `DivRem::div_rem(x, m)` |
| 2 | `while i < n` | `while i != n` |
| 3 | `2_u32.pow(k)` | match-based lookup table |
| 4 | `*data.at(i)` in index loop | `pop_front` / `for` / `multi_pop_front` |
| 5 | `.len()` in loop condition | `let n = data.len();` before loop |
| 6 | Manual loop extraction | `span.slice(start, length)` |
| 7 | `index & 1`, `index / 2` | `DivRem::div_rem(index, 2)` |
| 8 | `u256` when range < 2^128 | `u128` |
| 9 | One slot per field | `StorePacking` trait |
| 10 | Bitwise ops / raw math | `bounded_int::{div_rem, mul, add}` |
| 11 | `poseidon_hash_span([x,y])` | `hades_permutation(x, y, 2)` |
| 12 | `downcast` / `try_into` bulk | `u128s_from_felt252` + `upcast` |

## Example optimization

```cairo
// BEFORE (2x the cost)
let q = amount / 2;
let r = amount % 2;

// AFTER (single operation)
use core::num::traits::DivRem;
let (q, r) = DivRem::div_rem(amount, 2);
```

## Structure

```text
cairo-optimization/
  SKILL.md                              # 4-turn orchestration
  references/
    legacy-full.md                      # 12 rules + BoundedInt deep-dive (495 lines)
    profiling.md                        # Profiling CLI and troubleshooting (219 lines)
    anti-pattern-pairs.md               # 5 optimization anti-pattern pairs (101 lines)
  workflows/
    default.md                          # 5-phase workflow reference
  scripts/
    profile.py                          # Profiling CLI (snforge + scarb modes)
    bounded_int_calc.py                 # BoundedInt bounds calculator
```

## Recommended flow

```text
cairo-contract-authoring → cairo-testing → cairo-optimization → cairo-auditor
       write                test             optimize             audit
```

## References

- Skill policy: [SKILL.md](SKILL.md)
- Workflow: [workflows/default.md](workflows/default.md)
- Optimization rules: [references/legacy-full.md](references/legacy-full.md)
- Profiling: [references/profiling.md](references/profiling.md)
- Anti-patterns: [references/anti-pattern-pairs.md](references/anti-pattern-pairs.md)
