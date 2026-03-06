# Secure DeFi Demo (Issue #311)

Deterministic single-agent demo for the narrative:

1. Base reputation context (signed envelope verification)
2. Starknet identity/session-key evidence
3. Preflight policy rejection proof (no gas burned)
4. Vesu position + optional deposit/withdraw

This demo writes an artifact JSON you can keep as audit evidence.

## What This Demo Proves

- The MCP tool surface is available and wired.
- Preflight policy enforcement blocks unsafe calls before on-chain execution.
- Default blocked selector policy rejects privileged entrypoints (`upgrade`, ownership/admin ops).
- Vesu operations are callable from the same secure runtime.
- Optional ERC-8004 and session-key state can be attached to the artifact.
- Optional Base->Starknet anchor can be executed by writing Base attestation hash into ERC-8004 metadata and verifying readback.
- Base attestation envelope can be schema-validated and signature-verified.

## What This Demo Does Not Prove

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

Note: the MCP sidecar initializes signing at startup, so even `dry-run` needs signer credentials:
- direct mode: `STARKNET_PRIVATE_KEY`
- proxy mode: `KEYRING_PROXY_URL` + `KEYRING_HMAC_SECRET`

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

v1.1 full-proof profile (execute + identity + Base anchor):

```bash
DEMO_AUTO_REGISTER_AGENT=1 \
DEMO_ANCHOR_BASE_TO_ERC8004=1 \
DEMO_BASE_ATTESTATION_PATH=./artifacts/base-attestation-demo.json \
pnpm --filter @starknet-agentic/secure-defi-demo run:execute
```

Strict security proof profile (issue #315):

```bash
STRICT_SECURITY_PROOF=1 \
DEMO_EVIDENCE_SIGNING_PRIVATE_KEY_PATH=./keys/demo-evidence-signing-key.pem \
DEMO_AUTO_REGISTER_AGENT=1 \
DEMO_ANCHOR_BASE_TO_ERC8004=1 \
STARKNET_SIGNER_MODE=proxy \
DEMO_SESSION_ACCOUNT_ADDRESS=0x... \
DEMO_SESSION_KEY_PUBLIC_KEY=0x... \
pnpm --filter @starknet-agentic/secure-defi-demo run:execute
```

Optional Starkzap claim input:

```bash
DEMO_ENABLE_STARKZAP_PROOF=1 \
DEMO_STARKZAP_EVIDENCE_PATH=../starkzap-onboard-transfer/demo-evidence.json
```

## Output

Artifacts are written to `DEMO_OUTPUT_DIR` (default `./artifacts`).

Each run returns:

- JSON artifact path + markdown summary path
- signed `artifact-manifest.json` path (strict profile or when signing key envs are set)
- run id
- per-step status (`ok`, `failed`, `skipped`)
- deterministic `claims[]` map (`proof_status`, `tx_hash`, `evidence_path`)
- rejection probe evidence
- Vesu before/after position snapshots (when executed)
- recommendations for missing requirements

Verify a generated evidence bundle:

```bash
pnpm verify:evidence
```

## Funding Required for `run:execute`

Minimum for reliable Sepolia writes:

- `2-5 STRK` in `STARKNET_ACCOUNT_ADDRESS`
- If testing sponsored mode, a valid `AVNU_PAYMASTER_API_KEY`

For meaningful Vesu scenarios:

- enough `DEMO_VESU_TOKEN` balance for `DEMO_VESU_DEPOSIT_AMOUNT`
- optional `DEMO_VESU_POOL` if you need a non-default pool address
- set `STARKNET_VESU_POOL_FACTORY` for non-mainnet deployments (e.g., Sepolia V2)
- optional `DEMO_SWAP_SELL_TOKEN` + `DEMO_SWAP_AMOUNT` to run `swap -> deposit`

## Security Notes

- Never commit `.env` or artifacts containing sensitive data.
- The demo intentionally injects `STARKNET_MCP_POLICY` (if absent) to force a deterministic rejection probe.
- Policy rejection probe should fail with a policy-limit error; if it succeeds, tighten `DEMO_POLICY_MAX_TRANSFER`.
- Forbidden selector probe should fail with a blocked-entrypoint policy error.
- Expired session probe runs only in `--mode execute` + `STARKNET_SIGNER_MODE=proxy` when provided session data is inactive.
- If `DEMO_ANCHOR_BASE_TO_ERC8004=1` is set, the run includes a `base_attestation_anchor` step that writes and verifies attestation hash metadata on-chain.

## Signed Base Attestation Format

`DEMO_BASE_ATTESTATION_PATH` should point to JSON with this shape:

```json
{
  "version": "1",
  "issuer": "base-agent-registry",
  "issuedAt": "2026-03-04T12:00:00.000Z",
  "subject": "0xagent-or-identity-id",
  "payload": {
    "reputationScore": 91,
    "attestedBy": "base-prover"
  },
  "signing": {
    "algorithm": "ed25519",
    "publicKeyPem": "-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----",
    "signatureBase64": "..."
  }
}
```

The demo verifies the signature against canonical JSON of:
`{ version, issuer, issuedAt, subject, payload }`.
