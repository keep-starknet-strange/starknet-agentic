# Managed-Backend Security Track

> **Status:** Deferred from no-backend launch gate (see #273, 2026-03-05)
> **Priority:** Post-launch hardening for managed-backend profile

## Purpose

Track managed-backend security/auth hardening that is intentionally **deferred from the no-backend launch gate**. These items remain important but are **non-blocking** for self-custodial launch.

## Scope

This track covers the following security enhancements for the managed-backend deployment profile:

### P0 — Critical Path

| Issue | Description | Status |
|-------|-------------|--------|
| [#219](./issues/219.md) | P0-proxy: HMAC + mTLS + nonce replay protection (Redis TTL) | ⬜ Pending |

### P1 — High Priority

| Issue | Description | Status |
|-------|-------------|--------|
| [#222](./issues/222.md) | P1-mcp: enforce per-session-key + per-tool rate limiting | ⬜ Pending |
| [#223](./issues/223.md) | P1-mcp: add I/O secret leak scanner (Starknet patterns) | ⬜ Pending |
| [#224](./issues/224.md) | P1-observability: correlated audit logs across MCP, signer, and tx execution | ⬜ Pending |
| [#317](./issues/317.md) | P1-mcp-auth: OAuth 2.1/OIDC short-lived scoped tokens for MCP boundary | ⬜ Pending |

### P2 — Medium Priority

| Issue | Description | Status |
|-------|-------------|--------|
| [#225](./issues/225.md) | P2-auth: implement SISNA (Starknet Sign-In With Agent) nonce/verify/receipt package | ⬜ Pending |

## Definition of Done

- [ ] All linked issues closed with tests + docs + runbooks
- [ ] Managed-backend release profile documented (trust boundaries + operator responsibilities)
- [ ] Sign-off posted by runtime + security maintainers

## Trust Boundaries

```
┌─────────────────────────────────────────────────────┐
│                   MANAGED BACKEND                   │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │  MCP API  │───▶│  Proxy   │───▶│  Core Engine │  │
│  │ (OAuth/   │    │(HMAC +  │    │              │  │
│  │  OIDC)    │    │ mTLS)    │    │              │  │
│  └──────────┘    └──────────┘    └──────┬───────┘  │
│                                         │          │
│  ┌──────────┐    ┌──────────┐    ┌──────┴───────┐  │
│  │ SISNA    │    │ Rate     │    │  Audit Log   │  │
│  │ Sign-In  │    │ Limiter  │    │  Collector   │  │
│  └──────────┘    └──────────┘    └──────────────┘  │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │           Secret Leak Scanner               │   │
│  │         (I/O interception layer)            │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
              │                         │
         ┌────┴────┐              ┌────┴────┐
         │ Starknet │              │ External│
         │  Chain   │              │  MCP    │
         └──────────┘              └─────────┘
```

## Operator Responsibilities

| Role | Responsibility |
|------|----------------|
| **Runtime Maintainer** | Proxy hardening, mTLS config, rate limiter correctness |
| **Security Maintainer** | Audit log integrity, leak scanner coverage, auth flow review |
| **Infrastructure Operator** | Redis TTL management, token rotation, cert lifecycle |

## Execution Order

1. **#219** (P0) — Must land first; all other tracks depend on proxy hardening
2. **#222** (P1) — Rate limiting works in tandem with proxy
3. **#223** (P1) — Leak scanner operates at I/O boundary
4. **#224** (P1) — Audit logs consume signals from all above
5. **#317** (P1) — OAuth/OIDC integration at MCP boundary
6. **#225** (P2) — SISNA is independent but benefits from above foundations

## References

- Parent launch decision: #273
- no-backend launch profile: #273 (2026-03-05)
