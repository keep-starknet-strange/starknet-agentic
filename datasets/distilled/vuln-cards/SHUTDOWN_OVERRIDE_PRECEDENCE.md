# SHUTDOWN_OVERRIDE_PRECEDENCE

## Trigger

Use when contracts combine inferred operational mode and manually forced override mode.

## Failure Mode

The function returns inferred mode before checking fixed override mode.

## Why It Matters

Owner emergency controls can be bypassed by control-flow ordering.

## Vulnerable Pattern

- Compute inferred mode
- Return early when inferred mode is active
- Only then read fixed override (too late)

## Secure Pattern

- Read fixed override first
- Return fixed value when active
- Evaluate inferred mode only when fixed override is not set

## Detection Rule

If both inferred and forced-mode paths exist, assert forced-mode check dominates all early returns.

## Test Recipe

Set both inferred mode and fixed override; assert returned mode is fixed override.

## False Positives

- Fixed override feature explicitly disabled by design.
- No emergency override semantics in protocol requirements.

## Source Findings

- `CSC-VESU-001`
