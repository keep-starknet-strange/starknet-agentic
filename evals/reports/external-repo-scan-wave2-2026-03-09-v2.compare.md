# Wave-2 External Scan Delta (2026-03-09 v2)

- Baseline: `evals/reports/data/external-repo-scan-wave2-2026-03-09.json`
- Rerun: `evals/reports/data/external-repo-scan-wave2-2026-03-09-v2.json`

## Topline

- Baseline findings: **35**
- Rerun findings: **31**
- Delta: **-4**

## By Class

| Class | Baseline | Rerun | Delta |
| --- | ---: | ---: | ---: |
| `CEI_VIOLATION_ERC1155` | 1 | 0 | -1 |
| `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` | 10 | 10 | 0 |
| `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` | 17 | 17 | 0 |
| `NO_ACCESS_CONTROL_MUTATION` | 4 | 3 | -1 |
| `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` | 3 | 1 | -2 |

- Removed findings: **4**

| Repo | File | Class |
| --- | --- | --- |
| `OpenZeppelin/cairo-contracts` | `packages/token/src/erc721/extensions/erc721_wrapper.cairo` | `CEI_VIOLATION_ERC1155` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `typhoonmixer/typhoon-contracts` | `src/NoteAccount.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `typhoonmixer/typhoon-contracts` | `src/Typhoon.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |

- Added findings: **0**
