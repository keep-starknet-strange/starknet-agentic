# ERC20 Helpers

Use this reference when building ERC20 transfer helpers in Starkzap workflows.

## Amount Semantics and Validation

- Normalize user input to decimal string first, then convert to base units (`BigInt`) using token decimals.
- Reject scientific notation (`1e18`) and negative values.
- Reject amounts with fractional precision exceeding token decimals.
- Treat zero-amount transfers as explicit no-op or validation failure (do not silently execute).
- Keep token preset compatibility explicit (`symbol -> address -> decimals`) and fail closed on unknown symbols.

## Multicall Ordering Rules

For batched transfer flows, keep deterministic call ordering:
1. Optional allowance update (if required by token standard or helper path).
2. Core transfer call(s).
3. Optional post-transfer verification/read calls.

Do not interleave unrelated calls inside the same batch unless policy explicitly permits it.

## Common Failure Modes

| Failure | Signal | Likely Cause |
| --- | --- | --- |
| `VALIDATION_ERROR` | input parser throws / helper rejects | malformed amount, unknown token preset, invalid recipient |
| `TX_REVERTED` | chain execution failed | insufficient balance, allowance mismatch, token pause/blacklist checks |
| `RPC_TIMEOUT` | request timed out | provider congestion or flaky endpoint |
| `NONCE_CONFLICT` | nonce too low/high | concurrent signer usage without coordination |

## Recovery Playbook

- `VALIDATION_ERROR`
Return actionable field-level errors (`amount_invalid`, `recipient_invalid`, `token_unknown`) and require caller correction.
- `TX_REVERTED`
Re-run preflight checks (balance, allowance, token status), then retry once with unchanged calldata.
- `RPC_TIMEOUT`
If a tx hash or nonce was reserved before the timeout, poll transaction status first; only resubmit when you can prove no tx was accepted. Retry with bounded exponential backoff (500ms, 1s, 2s; max 3 attempts).
- `NONCE_CONFLICT`
Refresh account nonce from chain and rebuild transaction.

## Minimal Safe Pattern

```ts
const parsed = parseAmountToUnits(amount, token.decimals);
if (!parsed.ok) throw new Error(`amount_invalid:${parsed.reason}`);

const preflight = await wallet.preflight({ calls });
if (!preflight.ok) throw new Error(`preflight_failed:${preflight.reason}`);

const result = await wallet.execute(calls);
if (!result.transactionHash) throw new Error("missing_tx_hash");

const receiptProvider = wallet.provider ?? wallet.account?.provider;
const receipt = typeof wallet.waitForTransaction === "function"
  ? await wallet.waitForTransaction(result.transactionHash)
  : await receiptProvider?.getTransactionReceipt?.(result.transactionHash);

const status = receipt?.status ?? receipt?.execution_status;
if (!receipt || !status || status === "REVERTED") {
  throw new Error(`tx_failed:${result.transactionHash}`);
}
```

Treat this as a contract: validate -> preflight -> execute -> verify outcome.
