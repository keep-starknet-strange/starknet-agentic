# Signer Proxy Rotation Runbook

This runbook defines production-safe rotation for signer proxy authentication material.

## Scope

- HMAC client secrets (`X-Keyring-*` auth)
- mTLS client/server certificates
- Replay nonce store behavior (Redis TTL)

## Preconditions

- Auth conformance vectors are green (`spec/signer-auth-v1.json`).
- Staging environment has at least two signer replicas behind load balancing.
- Replay store is shared (single Redis logical namespace for signer auth nonces).

## HMAC Secret Rotation (Client-by-Client)

1. Add `next` secret to signer config while keeping `current`:
   - allowed secrets = `[current, next]`
2. Roll signer instances gradually (no global restart required).
3. Rotate client(s) to sign with `next`.
4. Verify in staging:
   - valid requests signed with `next` are accepted
   - replay attempts still return `REPLAY_NONCE_USED`
   - old signatures remain temporarily accepted during overlap
5. Remove `current` secret from signer config.
6. Verify old signatures are rejected (`AUTH_INVALID_HMAC`).

## mTLS Certificate Rotation

1. Install new CA/cert chain on signer and client trust stores.
2. Run dual-trust window (old+new CA) during transition.
3. Rotate client certificates.
4. Rotate signer certificate.
5. Remove old CA after all clients confirm successful handshakes.
6. Verify non-mTLS traffic fails closed (`AUTH_MTLS_REQUIRED`) in production profile.

## Replay Store (Redis TTL) Validation

Required checks after every deployment/rotation:

1. Same `(client_id, nonce)` submitted twice within TTL:
   - first request accepted
   - second request rejected with `REPLAY_NONCE_USED`
2. Same nonce reused after TTL expiry:
   - accepted once
3. Replay behavior remains consistent across signer replicas.

## Staging Test Checklist

- [ ] `valid_hmac_mtls_single_use` passes
- [ ] `replay_nonce_rejected` passes
- [ ] `timestamp_skew_rejected` passes
- [ ] `mtls_required_rejected` passes
- [ ] `rotated_secret_accepted` passes
- [ ] `invalid_hmac_rejected` passes
- [ ] `unknown_client_rejected` passes

## Rollback

- Restore previous HMAC secret set.
- Restore previous mTLS cert/CA bundle.
- Confirm replay store namespace unchanged to avoid nonce re-acceptance drift during rollback.

## Incident Notes

- Any replay-store outage must be treated as auth-severity incident.
- Do not disable replay checks in production; fail closed on store failure.
