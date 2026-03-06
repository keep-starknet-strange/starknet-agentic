# Spending Policy Execution Evidence (`#335`)

This directory stores reproducible evidence for the no-backend launch gate item:

- `#335` Close `SPENDING_POLICY_AUDIT.md` E2E/load/sign-off checklist items

The source-of-truth schema is validated by:

- `scripts/security/spending-policy-evidence.mjs`

## Canonical flow

1. Create a run bundle from the template:

```bash
RUN_ID="sp-$(date -u +%Y%m%d-%H%M%S)"
RUN_DIR="docs/security/evidence/spending-policy/runs/${RUN_ID}"

node scripts/security/spending-policy-evidence.mjs \
  --init \
  --report "${RUN_DIR}/execution-report.json" \
  --run-id "${RUN_ID}" \
  --network "starknet-sepolia"
```

2. Execute the Sepolia E2E/load scenarios and attach evidence for each `SP-xx` check:

- Transaction hash evidence (`type: "tx"`, `txHash`, explorer URL)
- Command logs (`type: "log"`, relative `path` inside the run directory)
- Optional reports/screenshots for load-test summaries

3. Validate report structure before posting links:

```bash
node scripts/security/spending-policy-evidence.mjs \
  --report "${RUN_DIR}/execution-report.json" \
  --bundle-dir "${RUN_DIR}"
```

4. Validate closure readiness (all required checks + all three sign-offs approved):

```bash
node scripts/security/spending-policy-evidence.mjs \
  --report "${RUN_DIR}/execution-report.json" \
  --bundle-dir "${RUN_DIR}" \
  --require-closed
```

## Required check IDs (launch-blocking)

- `SP-01` Deploy SessionAccount evidence
- `SP-02` Spending policy baseline evidence
- `SP-03` Happy-path transfer evidence
- `SP-04` Per-call limit rejection evidence
- `SP-05` Window-limit rejection evidence
- `SP-06` Selector blocklist rejection evidence
- `SP-07` Window-boundary behavior evidence
- `SP-08` Multicall cumulative enforcement evidence
- `SP-09` Non-spending selector behavior evidence
- `SP-10` Load validation evidence (`100+ tx/hour`)

## Sign-off keys (required for `--require-closed`)

- `signoff.leadDeveloper`
- `signoff.securityReviewer`
- `signoff.qaEngineer`

## Notes

- Evidence `path` values must be safe relative paths inside the run directory.
- `status: "pass"` checks must include at least one evidence entry.
- This process is backend-free and self-custodial: maintainers execute with local tooling/accounts and publish the resulting report links in `#335` and `#273`.
