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
8. `forbidden_selector_probe`
9. `policy_rejection_probe`
10. `expired_session_probe` (conditional; execute + proxy + inactive session)
11. `vesu_positions_before`
12. `allowed_transfer_execute` (execute mode)
13. `vesu_deposit` (execute mode)
14. `vesu_positions_after` (execute mode)
15. `vesu_withdraw` (optional execute mode)

## Artifact Contract

The output artifact is validated by zod schema:

- run metadata (`runId`, timestamps, mode, account)
- optional signed base attestation verification record
- step-by-step status + details
- summary counts
- recommendations
- markdown companion summary file (`secure-defi-demo-<runId>.md`)

Schema source:
[`examples/secure-defi-demo/src/types.ts`](../../examples/secure-defi-demo/src/types.ts)

## Operator Checklist

Before execute mode:

1. Build MCP server dist:
   - `pnpm --filter @starknet-agentic/mcp-server build`
2. Ensure funded test account:
   - `STARKNET_ACCOUNT_ADDRESS`
3. Configure signer authentication mode:
   - `STARKNET_SIGNER_MODE=direct` requires `STARKNET_PRIVATE_KEY`
   - `STARKNET_SIGNER_MODE=proxy` requires `KEYRING_PROXY_URL`, `KEYRING_HMAC_SECRET`
   - Optional proxy hardening: `KEYRING_CLIENT_ID`, `KEYRING_SIGNING_KEY_ID`
4. Set safe amounts:
   - `DEMO_TRANSFER_AMOUNT`
   - `DEMO_VESU_DEPOSIT_AMOUNT`
   - optional `DEMO_VESU_POOL` for non-default deployment
   - optional `STARKNET_VESU_POOL_FACTORY` for non-mainnet Vesu deployments
   - optional `DEMO_SWAP_SELL_TOKEN` + `DEMO_SWAP_AMOUNT` for pre-deposit asset swap
5. Confirm authorization guardrails:
   - `STARKNET_MCP_POLICY` is set and enforces selector/token/amount constraints.
6. Optional sponsored mode:
   - `AVNU_PAYMASTER_API_KEY`
7. Optional session evidence:
   - `DEMO_SESSION_ACCOUNT_ADDRESS`
   - `DEMO_SESSION_KEY_PUBLIC_KEY`

## Acceptance for v1

- Dry-run succeeds with no failed steps in startup/discovery/probe path.
- Rejection probe returns policy-limit denial.
- Forbidden selector probe returns blocked-entrypoint denial.
- Execute mode produces transfer transaction evidence; Vesu deposit evidence is required when Vesu pool contracts are available (otherwise Vesu steps are explicitly skipped).
- Artifacts are generated and stored for audit trail.

## Next v2 Extensions

1. On-chain Base->Starknet attestation settlement/verification.
2. Native session-key registration step in this runner.
3. Provenance chain export integration (CBOM/EAR style envelope).

## Latest Verified Evidence (March 4, 2026)

This run combined the two demo runners to prove DeFi execution and security controls with live Sepolia data.

Artifacts:

- Secure demo report:
  - `examples/secure-defi-demo/artifacts/secure-defi-demo-516a8d17-2af9-4170-bf30-3afcdc1136f2.json`
  - `examples/secure-defi-demo/artifacts/secure-defi-demo-516a8d17-2af9-4170-bf30-3afcdc1136f2.md`
- Signed Base attestation fixture:
  - `examples/secure-defi-demo/artifacts/base-attestation-demo.json`
- Swarm/proxy run log (session key + policy/revocation probes):
  - `examples/full-stack-swarm/artifacts/swarm-demo-20260304-080847.log`

Key transaction evidence (Starknet Sepolia):

1. Allowed transfer succeeded:
   - `0x8dfd41b6b6a473bf53bb92a1ec086ed8287c9652b109c52dedd98a36d15e95` (`SUCCEEDED`)
2. Vesu deposit succeeded:
   - `0x2916384313cd7e6aefa4284d11e7e62d0019aec5858243eb44537d3a0ce334` (`SUCCEEDED`)
3. Proxy-mode swap succeeded with session key:
   - `0x55953168086ab15a4f9b04244107b0f8676b6f2e2b42cf2efe328ac2eb6ab69` (`SUCCEEDED`)
4. Oversized action denied by on-chain spending policy:
   - `0x3900f732b2e9061350be30707ca7bcf48d16b346041c85ebbff3b90772a3609` (`REVERTED`, reason includes `Spending: exceeds per-call`)
5. Session revocation transaction succeeded:
   - `0x43c34a21cf30e5b187ef1b2e4c56157cf3c7d1672ac5899b5b82caabb33e6e9` (`SUCCEEDED`)
   - Subsequent action attempt in same run was blocked by account validation (`validate` returned `0x0`), recorded in run log.

v1.1 full-proof additions (same day):

1. ERC-8004 registration succeeded:
   - `0x14c24c1d2784ce94f25b7a89592276e8fe62563fb8c95ead4dcbed52a466b8` (`SUCCEEDED`)
   - resolved `agentId = 178`
2. Base attestation hash anchor (ERC-8004 metadata set + verified readback):
   - `0x358a907147409db6a0d21fbd3b37f4c4c518c6ae35fcc3bcf372835acd106be` (`SUCCEEDED`)
3. Starkzap-path transfer evidence:
   - `0x3038127239416ed2afc3f6bfa2c1c64ab7bbee4e9a525df88828ebcf942232b` (`SUCCEEDED`)
