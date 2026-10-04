# session-account-e2e (private)

Session-key signer and invoke helper for the SessionAccount spending-policy E2E runner
(`scripts/e2e_test_runner.sh`). sncast and other standard account signers can only send owner-signed transactions; this helper
sends session-key transactions with the 4-felt signature `[session_pubkey, r, s, valid_until]`
for the account's session signature mode (v1 or v2), and asserts each step's expected outcome.

```bash
pnpm install                     # repo root, once
node src/cli.ts --help           # Node 24+ runs the TypeScript directly
pnpm test                        # hashes vs spec/session-signature-v2.json, signer, outcome checks
```

- `src/sessionSignature.ts`: v1/v2 session message hash (mirrors `contracts/session-account/src/account.cairo`) and `SessionAccountSigner` for starknet.js.
- `src/outcome.ts`: classifies revert reasons, `__validate__` rejections and `CallFailed` events.
- `src/cli.ts`: the `session-invoke` CLI the runner calls.

Usage and the meaning of each runner row: [`docs/E2E_TESTING_GUIDE.md`](../../docs/E2E_TESTING_GUIDE.md#session-key-transactions).
For testnets only; the CLI refuses Starknet mainnet.
