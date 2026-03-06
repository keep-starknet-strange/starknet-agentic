# External Audit Scope and Closure Policy (No-Backend Launch)

This document defines the minimum external audit scope and launch gating policy
for the no-backend profile.

## Scope

In scope (required):

- ERC-8004 registries:
  - `contracts/erc8004-cairo/src/identity_registry.cairo`
  - `contracts/erc8004-cairo/src/reputation_registry.cairo`
  - `contracts/erc8004-cairo/src/validation_registry.cairo`
- Agent account stack:
  - `contracts/agent-account/src/agent_account.cairo`
  - `contracts/agent-account/src/agent_account_factory.cairo`
    (owner initialization + registry binding path)
- Session policy enforcement path used by production account flow

Out of scope for this launch gate (tracked separately):

- managed-backend proxy/auth tracks (`#219`, `#222`, `#223`, `#224`, `#225`, `#317`)

## Required Deliverables from Auditor

1. Threat model summary (assets, trust boundaries, attacker goals)
2. Vulnerability report with severity classification and reproduction steps
3. Recommendations mapped to specific files/functions
4. Final attestation letter that includes unresolved findings list (if any)

## Severity Policy (Go/No-Go)

- `Critical`: launch blocked until fixed and re-verified.
- `High`: launch blocked until fixed and re-verified.
- `Medium`: must be fixed before broad traffic ramp, or explicitly accepted with:
  - compensating control
  - owner assignment
  - due date
  - sign-off comment in `#334` and `#273`
- `Low/Info`: track in backlog with owner and due date.

## Closure Evidence Requirements

To close `#334`, attach:

- selected auditor and engagement dates
- final report link/hash
- finding-by-finding disposition table (fixed/accepted/deferred)
- links to fixing PRs and verification output
- explicit statement that no unresolved `Critical/High` findings remain

## Proposed Timeline (Target)

- Audit scope lock: 2026-03-13
- Auditor kickoff: 2026-03-18
- Report delivery target: 2026-04-08
- Remediation closure target: 2026-04-22

These dates are planning targets and must be confirmed in `#334`.

## Tracking

This document is evidence for:

- `#334` external audit scope/timeline/closure policy
- `#273` launch gate
