# Sponsored Transactions

Use this checklist before enabling `feeMode: "sponsored"` in automation.

## Preconditions for `feeMode: "sponsored"`

- Paymaster endpoint configured and reachable for the target network.
- Sponsorship policy configured for the wallet/account scope (allowed methods/contracts/spend caps).
- Account deployment state known (`already deployed` or `deploy_if_needed` path enabled).
- Token balance and allowance pre-checks pass for non-fee token transfers required by the call path.
- Chain/network IDs match between SDK config, signer, and paymaster policy.

## Readiness: Deployment vs Execution

Deployment readiness (before first tx):

- Validate account class hash and deployment salt inputs.
- Confirm paymaster allows account deployment flow.
- Confirm nonce source for undeployed/deployed account cases.

Execution readiness (each tx):

- Run `wallet.preflight(...)` and require explicit success signal.
- Validate returned sponsorship metadata (sponsor decision, fee assumptions, call validity).
- Re-check nonce/state freshness right before execute.

## Timeout and Retry Guidance

- Preflight timeout: 8-12s.
- Execute timeout: 20-30s.
- Retry only transient failures (timeouts, 429, 5xx).
- Backoff policy: exponential with jitter (for example 500ms, 1s, 2s, stop after 3 attempts).
- Do not retry deterministic policy denials (permission rejected, unsupported call, invalid scope).

## Minimal Flow (Pseudo-code)

`wallet.execute(...)` is shown as pseudo-code; adapt the call shape to the exact SDK version used in your Starkzap repo context.

```ts
const preflight = await wallet.preflight({
  feeMode: "sponsored",
  calls,
});

if (!preflight.ok) {
  throw new Error(`preflight_failed:${preflight.reason}`);
}

if (!preflight.sponsorship?.approved) {
  throw new Error("sponsorship_denied");
}

const executeResult = await wallet.execute(calls, { feeMode: "sponsored" });

if (!executeResult.transactionHash) {
  throw new Error("execute_missing_tx_hash");
}
```

Expected validation points:

- `wallet.preflight(...)` returns `ok=true` and sponsorship approved.
- `wallet.execute(...)` returns a transaction hash and no policy violations.
- Failure responses include machine-readable reasons for routing (`retry`, `reauth`, `manual_review`).
