# Optimization Anti-Pattern Pairs

Build-side (compile-time, developer-authored) optimization pairs meant for
post-correctness refactors.

## 1) Division + Modulus by 2

Anti-pattern:

```cairo
let half = amount / 2;
let rem = amount % 2;
```

Secure/optimized pattern:

```cairo
use core::num::traits::DivRem;
let (half, rem) = DivRem::div_rem(amount, 2);
```

## 2) Bitwise Parity Shortcut

Anti-pattern:

```cairo
let value: u32 = 7_u32;
let is_odd = (value & 1_u32) == 1_u32;
```

Secure/optimized pattern:

```cairo
use core::num::traits::DivRem;
let (_half, rem) = DivRem::div_rem(value, 2);
let is_odd = rem == 1;
```

Why DivRem is preferred: for typed integers (`u128`, `u32`),
`DivRem::div_rem` keeps arithmetic explicit and avoids `felt252`-mixing
assumptions that make parity paths harder to review.

## 3) Less-Than Loop Termination

Anti-pattern:

```cairo
let mut i = 0_u32;
while i < n {
    i += 1;
}
```

Secure/optimized pattern:

```cairo
let mut i = 0_u32;
while i != n {
    i += 1;
}
```

Safety note: use `i != n` only when `i` starts at `0` (or another value `<= n`), increments in unit steps (`i += 1`), and `n` is a trusted or validated bound. Otherwise overshoot can create non-terminating loops.

## 4) Repeated `.len()` in Loop Conditions

Anti-pattern:

```cairo
let mut i = 0;
while i < data.len() {
    i += 1;
}
```

Secure/optimized pattern:

```cairo
let n = data.len();
let mut i = 0;
while i < n {
    i += 1;
}
```

Guidance-only note: this pattern is recommendation-level today and is not yet
covered by the generation benchmark suite.

## Process Anti-Patterns

## 5) Micro-Optimizing Before Correctness

Anti-pattern:
- optimize arithmetic before authorization/invariants are tested
- merge security and optimization refactors into one opaque diff

Secure/optimized pattern:
- first make behavior and security checks pass
- then optimize one operation class per commit
- encode regression rules in eval cases for the exact optimization claim
