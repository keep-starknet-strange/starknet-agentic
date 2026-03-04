# Secure DeFi Demo (Issue #311)

Deterministic single-agent demo for the narrative:

1. Base reputation context (signed envelope hash)
2. Starknet identity/session-key evidence
3. Preflight policy rejection proof (no gas burned)
4. Vesu position + optional deposit/withdraw

This demo writes an artifact JSON you can keep as audit evidence.

## What This Demo Proves

- The MCP tool surface is available and wired.
- Preflight policy enforcement blocks unsafe calls before on-chain execution.
- Vesu operations are callable from the same secure runtime.
- Optional ERC-8004 and session-key state can be attached to the artifact.

## What This Demo Does Not Prove

- It does not independently prove Base attestation cryptographic validity (only hashes and records it).
- It does not register a new session key by default.
- It does not bridge Base -> Starknet trust on-chain in v1.

## Prerequisites

From repo root:

```bash
pnpm install
pnpm --filter @starknet-agentic/mcp-server build
```

Setup env:

```bash
cd examples/secure-defi-demo
cp .env.example .env
```

## Run Modes

Dry-run (no write tx required):

```bash
pnpm --filter @starknet-agentic/secure-defi-demo run
```

Execute mode (real tx writes):

```bash
pnpm --filter @starknet-agentic/secure-defi-demo run:execute
```

Execute + withdraw path:

```bash
pnpm --filter @starknet-agentic/secure-defi-demo run:withdraw
```

## Output

Artifacts are written to `DEMO_OUTPUT_DIR` (default `./artifacts`).

Each run returns:

- run id
- per-step status (`ok`, `failed`, `skipped`)
- rejection probe evidence
- Vesu before/after position snapshots (when executed)
- recommendations for missing requirements

## Funding Required for `run:execute`

Minimum for reliable Sepolia writes:

- `2-5 STRK` in `STARKNET_ACCOUNT_ADDRESS`
- If testing sponsored mode, a valid `AVNU_PAYMASTER_API_KEY`

For meaningful Vesu scenarios:

- enough `DEMO_VESU_TOKEN` balance for `DEMO_VESU_DEPOSIT_AMOUNT`
- optional `DEMO_VESU_POOL` if you need a non-default pool address

## Security Notes

- Never commit `.env` or artifacts containing sensitive data.
- The demo intentionally injects `STARKNET_MCP_POLICY` (if absent) to force a deterministic rejection probe.
- Policy rejection probe should fail with a policy-limit error; if it succeeds, tighten `DEMO_POLICY_MAX_TRANSFER`.
