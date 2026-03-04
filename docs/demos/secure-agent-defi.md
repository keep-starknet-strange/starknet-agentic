# Secure Agent DeFi Demo

Issue: https://github.com/keep-starknet-strange/starknet-agentic/issues/311

## Objective

Show a production-grade narrative in one run:

1. Base reputation context is attached to execution.
2. Starknet identity/security constraints are visible.
3. Unsafe actions are blocked by policy before execution.
4. Safe actions can move capital into DeFi (Vesu).

## Current v1 Implementation

Runner: [`examples/secure-defi-demo/run.ts`](../../examples/secure-defi-demo/run.ts)

Modes:

- `dry-run`: no required writes, validates orchestration and policy guard behavior
- `execute`: sends real Starknet transactions (transfer + Vesu deposit; optional withdraw)

## Step Model

The runner emits per-step evidence:

1. `startup`
2. `tool_discovery`
3. `base_attestation`
4. `balance_check`
5. `erc8004_identity` (optional)
6. `session_key_status` (optional)
7. `build_allowed_call`
8. `policy_rejection_probe`
9. `vesu_positions_before`
10. `allowed_transfer_execute` (execute mode)
11. `vesu_deposit` (execute mode)
12. `vesu_positions_after` (execute mode)
13. `vesu_withdraw` (optional execute mode)

## Artifact Contract

The output artifact is validated by zod schema:

- run metadata (`runId`, timestamps, mode, account)
- optional base attestation hash
- step-by-step status + details
- summary counts
- recommendations

Schema source:
[`examples/secure-defi-demo/src/types.ts`](../../examples/secure-defi-demo/src/types.ts)

## Operator Checklist

Before execute mode:

1. Build MCP server dist:
   - `pnpm --filter @starknet-agentic/mcp-server build`
2. Ensure funded test account:
   - `STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`
3. Set safe amounts:
   - `DEMO_TRANSFER_AMOUNT`
   - `DEMO_VESU_DEPOSIT_AMOUNT`
4. Optional sponsored mode:
   - `AVNU_PAYMASTER_API_KEY`
5. Optional session evidence:
   - `DEMO_SESSION_ACCOUNT_ADDRESS`
   - `DEMO_SESSION_KEY_PUBLIC_KEY`

## Acceptance for v1

- Dry-run succeeds with no failed steps in startup/discovery/probe path.
- Rejection probe returns policy-limit denial.
- Execute mode produces transaction evidence for transfer + Vesu deposit.
- Artifacts are generated and stored for audit trail.

## Next v2 Extensions

1. On-chain Base->Starknet attestation verification.
2. Native session-key registration step in this runner.
3. Provenance chain export integration (CBOM/EAR style envelope).
