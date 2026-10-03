# Managed-Backend Release Profile

> **Status:** Draft — finalizes when all security track issues are closed

## Overview

The managed-backend release profile defines the security posture, trust boundaries, and operator responsibilities for deployments that serve untrusted clients through a hardened proxy layer.

## Trust Boundaries

| Boundary | Guard | Owner |
|----------|-------|-------|
| External → Proxy | mTLS + HMAC + nonce replay protection (#219) | Runtime |
| Proxy → MCP | OAuth 2.1 / OIDC token validation (#317) | Runtime |
| MCP → Engine | Per-session + per-tool rate limiting (#222) | Runtime |
| I/O → Core | Secret leak scanning (#223) | Security |
| All layers | Correlated audit logging (#224) | Security |
| Auth flow | SISNA sign-in (#225) | Security |

## Operator Responsibilities

| Responsibility | Detail | Frequency |
|---------------|--------|-----------|
| Certificate management | mTLS CA rotation, client cert issuance | Quarterly |
| HMAC key rotation | Rolling key updates with overlap window | Monthly |
| Redis maintenance | TTL configuration, persistence, HA | As needed |
| Token lifecycle | OIDC provider config, client secret rotation | Monthly |
| Audit log review | Anomaly detection on correlated traces | Weekly |
| Leak scanner tuning | Adjust rules based on false positives | Quarterly |
| Rate limit tuning | Adjust thresholds based on traffic patterns | Monthly |

## Deployment Checklist

- [ ] mTLS certificates deployed to all proxy instances
- [ ] HMAC shared secrets distributed to all authorized clients
- [ ] Redis cluster configured with proper TTL and persistence
- [ ] OAuth 2.1 / OIDC provider configured and tested
- [ ] SISNA nonce store configured
- [ ] Leak scanner rules loaded and validated
- [ ] Audit log ingestion pipeline operational
- [ ] Rate limiter thresholds tuned to expected traffic
- [ ] Runbooks reviewed and accessible to on-call team
- [ ] Security maintainer sign-off obtained

## Security Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Runtime Maintainer | — | — | ⬜ Pending |
| Security Maintainer | — | — | ⬜ Pending |
