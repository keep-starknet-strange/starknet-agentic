# External Repo Detector Sweep (external-repo-scan-low-profile-rerun-2026-03-09-v5)

Generated: 2026-03-09T01:24:59+00:00

Machine-readable artifact:

- `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09-v5.json`

## Scope

1. `ForgeYields/starknet_vault_kit@babfc20931cb`
2. `StarkVote/starkvote@a25548c0c3a9`
3. `cavos-labs/argus@5373340688bc`
4. `fatlabsxyz/tongo@1e201d9ffbfe`
5. `kiroshi-market/kiroshi-protocol@40d1ba6e1648`
6. `medialane-io/medialane-contracts@aba0fcc775e1`
7. `salazarsebas/Zylith@1991f53f794a`

## Coverage

| Repo | Cairo files (all) | Cairo files (prod-only) | Hits |
| --- | ---: | ---: | ---: |
| ForgeYields/starknet_vault_kit | 144 | 122 | 17 |
| StarkVote/starkvote | 82 | 62 | 0 |
| cavos-labs/argus | 7 | 7 | 5 |
| fatlabsxyz/tongo | 48 | 31 | 2 |
| kiroshi-market/kiroshi-protocol | 18 | 11 | 1 |
| medialane-io/medialane-contracts | 12 | 7 | 3 |
| salazarsebas/Zylith | 47 | 39 | 4 |

## Results

- Total findings: **32**

By class:

- `CEI_VIOLATION_ERC1155`: 1
- `CONSTRUCTOR_DEAD_PARAM`: 1
- `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD`: 13
- `FEES_RECIPIENT_ZERO_DOS`: 1
- `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK`: 8
- `IRREVOCABLE_ADMIN`: 7
- `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD`: 1

By repo:

- `ForgeYields/starknet_vault_kit`: 17
- `StarkVote/starkvote`: 0
- `cavos-labs/argus`: 5
- `fatlabsxyz/tongo`: 2
- `kiroshi-market/kiroshi-protocol`: 1
- `medialane-io/medialane-contracts`: 3
- `salazarsebas/Zylith`: 4

## Findings

| Repo | File | Class |
| --- | --- | --- |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CONSTRUCTOR_DEAD_PARAM` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `FEES_RECIPIENT_ZERO_DOS` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/adapters/ekubo_adapter/ekubo_adapter.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/adapters/ekubo_adapter/ekubo_adapter.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router/price_router.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router/price_router.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router_vesu/price_router_vesu.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router_vesu/price_router_vesu.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `IRREVOCABLE_ADMIN` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `IRREVOCABLE_ADMIN` |
| `cavos-labs/argus` | `contracts/src/jwks_registry.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `fatlabsxyz/tongo` | `packages/contracts/src/tongo/Tongo.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `fatlabsxyz/tongo` | `packages/contracts/src/tongo/Tongo.cairo` | `IRREVOCABLE_ADMIN` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/markets/factory.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `CEI_VIOLATION_ERC1155` |
| `salazarsebas/Zylith` | `src/pool/contract.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `salazarsebas/Zylith` | `src/pool/contract.cairo` | `IRREVOCABLE_ADMIN` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `IRREVOCABLE_ADMIN` |

