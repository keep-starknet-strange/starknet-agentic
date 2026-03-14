# External Repo Detector Sweep (external-repo-scan-low-profile-rerun-2026-03-09)

Generated: 2026-03-08T22:29:44+00:00

Machine-readable artifact:

- `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09.json`

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
| StarkVote/starkvote | 82 | 66 | 2 |
| cavos-labs/argus | 7 | 7 | 5 |
| fatlabsxyz/tongo | 48 | 31 | 1 |
| kiroshi-market/kiroshi-protocol | 18 | 11 | 1 |
| medialane-io/medialane-contracts | 12 | 7 | 3 |
| salazarsebas/Zylith | 47 | 39 | 3 |

## Results

- Total findings: **32**

By class:

- `CEI_VIOLATION_ERC1155`: 1
- `CONSTRUCTOR_DEAD_PARAM`: 1
- `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD`: 14
- `FEES_RECIPIENT_ZERO_DOS`: 1
- `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK`: 8
- `NO_ACCESS_CONTROL_MUTATION`: 6
- `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD`: 1

By repo:

- `ForgeYields/starknet_vault_kit`: 17
- `StarkVote/starkvote`: 2
- `cavos-labs/argus`: 5
- `fatlabsxyz/tongo`: 1
- `kiroshi-market/kiroshi-protocol`: 1
- `medialane-io/medialane-contracts`: 3
- `salazarsebas/Zylith`: 3

## Findings

| Repo | File | Class |
| --- | --- | --- |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/aum_provider/aum_provider_4626/aum_provider_4626.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CONSTRUCTOR_DEAD_PARAM` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CEI_VIOLATION_ERC1155` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `FEES_RECIPIENT_ZERO_DOS` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/adapters/ekubo_adapter/ekubo_adapter.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/adapters/ekubo_adapter/ekubo_adapter.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router/price_router.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router_vesu/price_router_vesu.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `StarkVote/starkvote` | `contracts/src/poll.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `StarkVote/starkvote` | `contracts/src/voter_set_registry.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `cavos-labs/argus` | `contracts/src/jwks_registry.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `cavos-labs/argus` | `contracts/src/jwks_registry.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `fatlabsxyz/tongo` | `packages/contracts/src/tongo/Tongo.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/markets/factory.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `salazarsebas/Zylith` | `src/pool/contract.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `NO_ACCESS_CONTROL_MUTATION` |

## Triage Note

- `ForgeYields/.../redeem_request.cairo` appears multiple times across classes. Treat this as a manual root-cause dedupe candidate before severity roll-up.
