# UNCHECKED_FEE_BOUND

## Trigger

Use when fees are accepted as constructor or config parameters.

## Failure Mode

Caller-provided fee is forwarded without range check.

## Why It Matters

Out-of-range fee values can break swap math or disable core flow.

## Vulnerable Pattern

`create_pair(..., swap_fee)` forwards `swap_fee` directly into deployment calldata.

## Secure Pattern

Validate fee against protocol max/min before persisting or passing to subcontracts.

## Detection Rule

Find external/configurable fee input and verify explicit bound assertions in the same call path.

## Test Recipe

Boundary test: `max_fee` succeeds, `max_fee + 1` reverts.

## False Positives

- Fee already normalized and bounded in immutable upstream module.

## Source Findings

- `ERIM-NOSTRA-L02`
