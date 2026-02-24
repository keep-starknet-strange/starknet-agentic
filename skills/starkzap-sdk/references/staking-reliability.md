# Staking Reliability

Use this checklist to keep staking flows deterministic under partial failures.

## Pool Discovery and Preset Verification

- Verify network/chain context before any pool lookup.
- Resolve pool by canonical identifier, not display name alone.
- Validate validator preset metadata (validator address, strategy type, status).
- Cache discovery results with short TTL and include a block-height stamp.
- Reject stale/ambiguous pool resolution (multiple matches, missing metadata).

## Timeout and Abort Behavior

- Wrap discovery/read RPC calls with explicit timeout budgets (5-10s typical).
- Use cancellation/abort semantics for parallel queries so slow replicas do not leak.
- Distinguish timeout from deterministic rejection (timeout is retryable; policy rejection is not).

Example pattern:

```ts
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 8000);
try {
  const pool = await fetchPoolConfig({ signal: controller.signal });
  return pool;
} finally {
  clearTimeout(timer);
}
```

## Membership-Sensitive Flow Checks

Before mutation calls (`enter`, `add`, `exit_intent`, `exit`):
- Verify current membership state on-chain.
- Verify account has required stake token balance and allowance.
- Validate action ordering constraints (`exit_intent` before `exit`, cooldown windows, etc.).
- Re-read state after each mutation before scheduling the next step.

## Failure and Recovery Matrix

| Scenario | Recovery |
| --- | --- |
| Pool lookup timeout | retry with bounded backoff and alternate RPC endpoint |
| Validator/pool mismatch | stop flow, refresh presets, require operator confirmation |
| Transaction revert on `enter/add` | refresh balances + allowances + pool limits, then retry once |
| Exit sequence failure | persist partial state, resume from last confirmed on-chain step |

## Operational Guardrails

- Keep retries idempotent and bounded.
- Persist request IDs and transaction hashes for resumability.
- Emit explicit machine-readable outcomes (`pool_not_found`, `cooldown_active`, `stake_reverted`).
- Fail closed when validation metadata cannot be confirmed.
