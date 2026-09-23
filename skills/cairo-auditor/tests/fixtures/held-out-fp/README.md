# Held-out false-positive corpus

Benign Cairo written to look guilty. Every contract here deliberately exhibits the
surface shape a detector greps for, while being safe for a reason the detector must
be able to see.

**Any finding on this corpus is a false positive.** `validate_precision_floor.py`
asserts zero findings and fails CI otherwise, which pins the deterministic
preflight at precision 1.0 on this set.

Held out means held out: do not tune detectors against these files, and do not
import them from detector logic or benchmark cases. Their value comes entirely from
the detectors never having been fitted to them. If a detector needs to change to
pass, the detector was wrong.

| Fixture | Tempts | Safe because |
|---|---|---|
| `guarded_l1_handler` | `L1-HANDLER-UNCHECKED-FROM` | asserts `from_address` against the stored L1 bridge |
| `owner_gated_setters` | `NO_ACCESS_CONTROL_MUTATION` | every setter-prefixed entrypoint calls `assert_only_owner` |
| `felt_selectors_bounded_math` | `FELT252-UNSAFE-ARITHMETIC` | `felt252` only ever holds selectors and hashes; quantities are `u256`/`u128` |
| `safe_span_and_view` | `USE-AFTER-POP-FRONT`, `UNENFORCED-VIEW` | the span owns its cursor; the view takes `@ContractState` and writes nothing |
| `pinned_library_call` | `CONTROLLED-LIBRARY-CALL` | class hash is owner-gated storage with a non-zero guard, never calldata |
