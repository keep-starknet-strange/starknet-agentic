# External Repo Detector Sweep: Low-Profile Repos (v2, Expanded Detectors)

Date: 2026-03-08

Machine-readable triage artifacts:

- `evals/reports/data/external-repo-scan-low-profile-2026-03-08-v2.labels.jsonl`
- `evals/scorecards/v0.2.0-cairo-auditor-external-triage.md`
- `evals/scorecards/cairo-auditor-external-trend.md`

## Scope

Repos scanned (production paths only, tests/mocks excluded):

1. `caddyfinance/Options-vault-contracts`
2. `salazarsebas/Zylith`
3. `cavos-labs/argus`
4. `rsodre/feral-forge`
5. `kiroshi-market/kiroshi-protocol`
6. `medialane-io/medialane-contracts`
7. `ForgeYields/starknet_vault_kit`
8. `StarkVote/starkvote`
9. `fatlabsxyz/tongo`

Coverage: 298 production Cairo files.

## Detector Set (Expanded)

Baseline classes:

- `AA-SELF-CALL-SESSION`
- `UNCHECKED_FEE_BOUND`
- `SHUTDOWN_OVERRIDE_PRECEDENCE`
- `SYSCALL_SELECTOR_FALLBACK_ASSUMPTION`

New high-ROI classes:

- `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK`
- `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD`
- `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD`

## Results

Total findings: **28** (was 0 before expansion)

By class:

- `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK`: 8
- `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD`: 8
- `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD`: 12

By repo:

- `starknet_vault_kit`: 14
- `argus`: 4
- `medialane-contracts`: 3
- `Zylith`: 2
- `kiroshi-protocol`: 2
- `Options-vault-contracts`: 1
- `starkvote`: 1
- `tongo`: 1
- `feral-forge`: 0

## Representative Findings

### IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK (likely true positive, medium/high governance risk)

- `argus/contracts/src/argus.cairo`
- `kiroshi-protocol/contracts/main/src/markets/factory.cairo`
- `medialane-contracts/contracts/Medialane-Protocol/src/core/medialane.cairo`
- multiple `starknet_vault_kit` upgradeable contracts

Pattern: direct `upgrade(...)` path with class replacement and no observed schedule/delay enforcement.

### UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD (likely true positive, medium)

- same upgrade files listed above

Pattern: `upgrade(new_class_hash)` forwards class hash without explicit `is_non_zero` assertion.

### CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD (contextual risk; review intent)

- `argus/contracts/src/argus.cairo`
- `argus/contracts/src/jwks_registry.cairo`
- `Options-vault-contracts/src/optionvault.cairo`
- `starkvote/contracts/src/poll.cairo`
- `tongo/packages/contracts/src/tongo/Tongo.cairo`
- selected `Zylith`, `medialane`, and `starknet_vault_kit` constructors

Pattern: constructor stores critical addresses (`admin`, `owner`, `registry`, `token`, `vault`) with no explicit non-zero check.

## Triage Notes

- Upgrade-related findings are actionable hardening items for production governance posture.
- Constructor non-zero findings require project-level intent review (some protocols allow zero sentinel by design).

## Delta vs Prior Sweep

Previous low-profile scan with only 4 narrow classes found 0 findings.
After expanding detectors to 7 classes, the same corpus produced 28 findings.

This materially improves external-audit usefulness for early-stage repo screening.
