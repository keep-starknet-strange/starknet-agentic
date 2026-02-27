# ERC-8004 Parity Sign-off Checklist

Last updated: 2026-02-23

Use this checklist before claiming launch parity or production readiness.

Maintainer note: for PRs touching `docs/**`, include an explicit `Spec impact:` field in the PR description.

## 1. Parity Behavior Checks

- [ ] Identity registry registration paths (`register`, `register_with_token_uri`, `register_with_metadata`) pass unit + E2E tests.
- [ ] Agent wallet binding uses domain-separated signature with nonce, chain ID, and registry address.
- [ ] Reputation feedback flow (`give_feedback`, `revoke_feedback`, `append_response`) passes tests.
- [ ] `read_all_feedback` rejects empty `client_addresses` and paginated path is documented for broad scans.
- [ ] Validation request flow enforces designated validator and request uniqueness.
- [ ] Validation response is immutable per `request_hash` (`Response already submitted` on second response).

## 2. Known Divergences (Explicitly Accepted)

- [ ] Agent IDs are 1-indexed in Cairo.
- [ ] `read_all_feedback` requires explicit clients.
- [ ] `get_response_count` returns `0` when responders list is empty.
- [ ] Validation response mutability differs from Solidity (Cairo finalize-once).
- [ ] Metadata keys are Poseidon-hashed in storage.

## 3. Deployment and Ops Checks

- [ ] `docs/DEPLOYMENT_TRUTH_SHEET.md` reflects the latest deployed addresses.
- [ ] Sepolia validation is completed before any Mainnet deployment (contracts verified, multisig ownership verified, AgentAccountFactory behavior verified, and results recorded in `docs/DEPLOYMENT_TRUTH_SHEET.md`).
- [ ] Mainnet ERC-8004 registry addresses verified on explorer.
- [ ] Sepolia and Mainnet ownership verified as multisig-controlled.
- [ ] AgentAccountFactory status is accurate (Sepolia live, Mainnet pending until deployed).
- [ ] Incident response and upgrade checklist reviewed in `contracts/erc8004-cairo/README.md`.

## 4. Security Launch Gates

- [ ] Issue [#216](https://github.com/keep-starknet-strange/starknet-agentic/issues/216)
      (session self-call block in `__execute__`) is closed with merged implementation evidence.
- [ ] Issue [#217](https://github.com/keep-starknet-strange/starknet-agentic/issues/217)
      (session-path selector denylist for owner/admin entrypoints) is closed with tests.
- [ ] Issue [#219](https://github.com/keep-starknet-strange/starknet-agentic/issues/219)
      (HMAC + mTLS + nonce replay protection) has merged rollout evidence and operational runbook.
- [ ] Issue [#255](https://github.com/keep-starknet-strange/starknet-agentic/issues/255)
      (SNIP-12 v2 domain separation) is closed with conformance results.
- [ ] Issue [#256](https://github.com/keep-starknet-strange/starknet-agentic/issues/256)
      (shared session-signing conformance vectors) is closed across all required repositories.
- [ ] Formal third-party audit scope, owner, and target delivery window are documented in a tracked issue/PR.

## 5. Evidence Bundle

- [ ] Unit test reports attached.
- [ ] E2E test reports attached.
- [ ] Security hardening PR links attached.
- [ ] CodeRabbit + Greptile review status is clean (no pending actionable comments).

## Sign-off

| Area | Owner | Status | Date |
|------|-------|--------|------|
| Contracts |  |  |  |
| Security |  |  |  |
| Docs |  |  |  |
| Release |  |  |  |
