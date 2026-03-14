# Sierra Parallel Signal (sierra-parallel-low-profile-2026-03-09-v2)

Generated: 2026-03-09T00:57:39+00:00
Build mode: enabled (unsafe for untrusted repos)
Detector findings compared: `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09-v4.findings.jsonl`

Sierra is used here as a confirmation layer for source-level detections (not as a standalone verdict engine).

| Repo | Projects (built/total) | Artifacts | Status | ReplaceClass | Fn Ext->Write | Detector Hits | Upgrade Oracle | CEI Oracle |
| --- | ---: | ---: | --- | ---: | ---: | ---: | --- | --- |
| `ForgeYields/starknet_vault_kit` | 3/3 | 32 | completed | 21 | 0 | 20 | confirm | - |
| `StarkVote/starkvote` | 4/4 | 7 | completed | 0 | 0 | 0 | - | - |
| `cavos-labs/argus` | 0/0 | 0 | skipped_no_artifacts | 0 | 0 | 6 | unknown | - |
| `fatlabsxyz/tongo` | 2/2 | 6 | completed | 0 | 0 | 2 | - | - |
| `kiroshi-market/kiroshi-protocol` | 2/2 | 6 | completed | 2 | 0 | 3 | confirm | - |
| `medialane-io/medialane-contracts` | 1/1 | 6 | completed | 1 | 0 | 3 | confirm | missing |
| `salazarsebas/Zylith` | 5/5 | 11 | completed | 0 | 0 | 5 | - | - |

## Artifact Coverage

- `ForgeYields/starknet_vault_kit`: contract_class=26, sierra_json=3, starknet_artifacts=3
- `StarkVote/starkvote`: contract_class=4, sierra_json=2, starknet_artifacts=1
- `cavos-labs/argus`: none
- `fatlabsxyz/tongo`: contract_class=2, sierra_json=2, starknet_artifacts=2
- `kiroshi-market/kiroshi-protocol`: contract_class=5, starknet_artifacts=1
- `medialane-io/medialane-contracts`: contract_class=5, starknet_artifacts=1
- `salazarsebas/Zylith`: contract_class=6, starknet_artifacts=5

## Confirmation Gaps

- `medialane-io/medialane-contracts` CEI findings present but no function-level external->write pattern found

