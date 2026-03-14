# Low Profile External Scan: v4 vs v5

- v4: `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09-v4.json`
- v5: `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09-v5.json`

- v4 findings: **39**
- v5 findings: **32**
- Delta: **-7**

## By Class

| Class | Baseline | Rerun | Delta |
| --- | ---: | ---: | ---: |
| `CEI_VIOLATION_ERC1155` | 1 | 1 | +0 |
| `CONSTRUCTOR_DEAD_PARAM` | 1 | 1 | +0 |
| `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` | 14 | 13 | -1 |
| `FEES_RECIPIENT_ZERO_DOS` | 1 | 1 | +0 |
| `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` | 8 | 8 | +0 |
| `IRREVOCABLE_ADMIN` | 11 | 7 | -4 |
| `NO_ACCESS_CONTROL_MUTATION` | 2 | 0 | -2 |
| `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` | 1 | 1 | +0 |

- Removed: **7**

| Repo | File | Class |
| --- | --- | --- |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/aum_provider/aum_provider_4626/aum_provider_4626.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `IRREVOCABLE_ADMIN` |
| `cavos-labs/argus` | `contracts/src/jwks_registry.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/markets/factory.cairo` | `IRREVOCABLE_ADMIN` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/pool/shielded_pool.cairo` | `IRREVOCABLE_ADMIN` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `NO_ACCESS_CONTROL_MUTATION` |

- Added: **0**

