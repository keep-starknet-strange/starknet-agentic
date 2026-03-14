# Low-Profile External Scan Delta (2026-03-09 v3)

- Baseline: `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09.json`
- Rerun v3: `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09-v3.json`

- Baseline findings: **32**
- Rerun v3 findings: **39**
- Delta: **+7**

## By Class

| Class | Baseline | Rerun | Delta |
| --- | ---: | ---: | ---: |
| `CEI_VIOLATION_ERC1155` | 1 | 1 | +0 |
| `CONSTRUCTOR_DEAD_PARAM` | 1 | 1 | +0 |
| `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` | 14 | 14 | +0 |
| `FEES_RECIPIENT_ZERO_DOS` | 1 | 1 | +0 |
| `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` | 8 | 8 | +0 |
| `IRREVOCABLE_ADMIN` | 0 | 11 | +11 |
| `NO_ACCESS_CONTROL_MUTATION` | 6 | 2 | -4 |
| `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` | 1 | 1 | +0 |

- Removed: **5**

| Repo | File | Class |
| --- | --- | --- |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CEI_VIOLATION_ERC1155` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `StarkVote/starkvote` | `contracts/src/poll.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `StarkVote/starkvote` | `contracts/src/voter_set_registry.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `NO_ACCESS_CONTROL_MUTATION` |

- Added: **12**

| Repo | File | Class |
| --- | --- | --- |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router/price_router.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router_vesu/price_router_vesu.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `IRREVOCABLE_ADMIN` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `IRREVOCABLE_ADMIN` |
| `fatlabsxyz/tongo` | `packages/contracts/src/tongo/Tongo.cairo` | `IRREVOCABLE_ADMIN` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/markets/factory.cairo` | `IRREVOCABLE_ADMIN` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/pool/shielded_pool.cairo` | `IRREVOCABLE_ADMIN` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `CEI_VIOLATION_ERC1155` |
| `salazarsebas/Zylith` | `src/pool/contract.cairo` | `IRREVOCABLE_ADMIN` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `IRREVOCABLE_ADMIN` |

