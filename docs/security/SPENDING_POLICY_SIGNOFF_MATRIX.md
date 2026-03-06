# Spending Policy Launch Sign-Off Matrix

This matrix operationalizes remaining launch-gate tasks from
`docs/security/SPENDING_POLICY_AUDIT.md` for issue `#335`.

Status values:

- `open`
- `in-progress`
- `done`
- `waived` (requires residual-risk note)

## Owners

- `contracts-owner`: contract behavior and invariants
- `runtime-owner`: runtime flows and operational checks
- `qa-owner`: test execution and evidence packaging

## E2E / Load / Sign-Off Matrix

| ID | Task | Owner | Evidence Link | Status | Notes |
|---|---|---|---|---|---|
| SP-01 | Deploy SessionAccount with spending policy on Sepolia | contracts-owner |  | open | |
| SP-02 | Deploy mock ERC-20 tokens and fund test account | contracts-owner |  | open | |
| SP-03 | Generate session key pair and bind policy | runtime-owner |  | open | |
| SP-04 | Happy-path transfer sequence + counter verification | qa-owner |  | open | |
| SP-05 | Window reset test (`wait 24h`) | qa-owner |  | open | |
| SP-06 | Failure-path tests (per-call/window/blocklist) | qa-owner |  | open | |
| SP-07 | Edge cases (boundary, multicall, non-spending selectors) | qa-owner |  | open | |
| SP-08 | Sustained load test (100+ tx/hour) | qa-owner |  | open | |
| SP-09 | Threat model publication link | security-owner |  | open | |
| SP-10 | User guide/examples publication link | runtime-owner |  | open | |
| SP-11 | Known limitations section verified and up to date | security-owner |  | open | |
| SP-12 | Final sign-off (Lead Developer) | contracts-owner |  | open | |
| SP-13 | Final sign-off (Security Reviewer) | security-owner |  | open | |
| SP-14 | Final sign-off (QA Engineer) | qa-owner |  | open | |

## Required Evidence Format

For each row marked `done`, include:

- workflow/run link or tx hash
- exact command(s) used
- pass/fail output summary
- residual risk (if any)

## Suggested Command Evidence Snippets

```bash
# Example: policy-denied transfer check
<invoke transfer over limit>
# expected: policy enforcement revert / denied status
```

```bash
# Example: load test summary
<test command>
# include tx count/hour and failure rate
```

## Tracking

This document is evidence for:

- `#335` spending-policy E2E/load/sign-off closure
- `#273` launch gate
