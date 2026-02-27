# Signer Integration

This guide defines the minimum production contract for signer integrations used by Starkzap skills.

## Components and Trust Boundaries

| Component | Inputs | Outputs | Trust Boundary |
| --- | --- | --- | --- |
| `OnboardStrategy.Signer` | signer config + policy config | connected wallet session | caller must authenticate user and provide scoped policy |
| `StarkSigner` | message hash / typed payload | Stark-compatible signature | never receives broad API credentials; only signing material |
| Privy signer service | authenticated signing request | signature + metadata | network and auth boundary; enforce least privilege and request-level auth |
| Cartridge runtime | SDK call graph + task context | preflight + execution result | must enforce resource and permission ceilings per task |

## Lifecycle: `OnboardStrategy.Signer` + `StarkSigner`

1. Initialization
Set network, RPC endpoint, and explicit fee mode (`user_pays` or `sponsored`). Validate required env/config before SDK construction.

2. Signer binding
Construct `StarkSigner` with scoped key material. Do not reuse shared/global keys across tenants.

3. Session onboarding
Call `sdk.onboard(...)` or `sdk.connectWallet(...)` with explicit signer strategy and policy scope (allowed actions, max spend, expiry).

4. Rotation
Rotate signer key material on schedule or incident. Ensure old key cannot sign new requests; keep audit trail with key version and cutover timestamp.

5. Teardown
Revoke session/signer capability, clear cached signer state, and close persistent channels.

## Privy Server Trust Model and Auth Requirements

- Transport
Require HTTPS; require mTLS in production signer environments so both client and server identities are authenticated.

- Caller auth
Require a signed bearer token with short TTL and scoped claims (`wallet_id`, `network`, `allowed_actions`, `request_id`).

- Authorization
Server must reject requests where token claims do not match payload (`walletId`, public key, chain/network).

- Replay protection
Require unique nonce/request ID per signing request and enforce server-side deduplication window.

- Auditing
Persist request ID, signer key version, caller identity, decision outcome, and timestamp.

## Cartridge Runtime Constraints and Policy Scoping

- Enforce per-request timeout budgets (for example 10-15s signer timeout).
- Enforce retry budgets (for example max 2 retries with bounded backoff).
- Constrain cryptographic surface to required algorithms only (Stark curve signing paths only).
- Constrain permissions to task scope (no implicit admin operations, no wildcard signing).
- Enforce memory/CPU limits per signer task and fail closed when exceeded.

## Failure Mapping to `AUTH_OR_PERMISSION` Recovery

| Failure | Typical signal | Recovery action |
| --- | --- | --- |
| Missing/invalid auth token | 401 / auth error | refresh token, re-run onboarding, prompt user to re-auth |
| Claim-policy mismatch | 403 / permission denied | rebuild scope, request narrower/broader claim set intentionally |
| Nonce replay detected | replay/duplicate request error | mint new request ID + nonce, retry once |
| Signer service timeout | timeout / gateway errors | exponential backoff retry, then fallback to manual operator approval |
| Key unavailable/rotated | key not found / invalid key version | reload signer metadata, rebind signer, re-init wallet |

When surfacing these failures to callers, return structured errors with:

- `code`: stable machine-readable code (`AUTH_OR_PERMISSION`, `REPLAY_DETECTED`, `SIGNER_TIMEOUT`)
- `message`: short operator-facing explanation
- `recovery`: exact next action (`refresh_auth`, `rebind_signer`, `retry_with_new_nonce`)
