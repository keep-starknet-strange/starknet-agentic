# SYSCALL_SELECTOR_FALLBACK_ASSUMPTION

## Trigger

Use when helper functions issue syscall then fallback to alternate selector on error.

## Failure Mode

Code assumes transaction can continue after failed external syscall.

## Why It Matters

In modern Starknet execution semantics, failed external calls revert transaction scope; fallback branch is dead or misleading.

## Vulnerable Pattern

```cairo
let mut result = call_contract_syscall(token, SELECTOR_A, calldata);
if (result.is_err()) {
    result = call_contract_syscall(token, SELECTOR_B, calldata);
}
```

## Secure Pattern

Use one canonical selector and fail hard on syscall error.

## Detection Rule

Flag selector-fallback blocks that retry alternate selector within same transaction path.

## Test Recipe

Force failing syscall and assert function reverts without retry branch behavior.

## False Positives

- Offchain simulation helper code outside onchain execution.
- Explicitly documented compatibility wrapper with non-reverting environment.

## Source Findings

- `ERIM-NOSTRA-I01`
- `ERIM-NOSTRA-I02`
