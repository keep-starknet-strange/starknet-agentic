# Low-Profile Rerun Comparison (2026-03-09)

- Baseline labels: `evals/reports/data/external-repo-scan-low-profile-2026-03-08-v2.labels.jsonl`
- New findings: `evals/reports/data/external-repo-scan-low-profile-rerun-2026-03-09-v3.findings.jsonl`

## Metrics on the same labeled set

| Run | TP | FP | FN | TN | Precision | Recall | Accuracy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline (stored `predicted_detect`) | 19 | 1 | 0 | 8 | 0.950 | 1.000 | 0.964 |
| Rerun (current detector output) | 19 | 1 | 0 | 8 | 0.950 | 1.000 | 0.964 |

- Prediction changes on labeled findings: **0**

## Additional findings outside labeled pack

- Additional findings: **19**

By class:

- `CEI_VIOLATION_ERC1155`: 1
- `CONSTRUCTOR_DEAD_PARAM`: 1
- `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD`: 3
- `FEES_RECIPIENT_ZERO_DOS`: 1
- `IRREVOCABLE_ADMIN`: 11
- `NO_ACCESS_CONTROL_MUTATION`: 2

| Repo | File | Class |
| --- | --- | --- |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/aum_provider/aum_provider_4626/aum_provider_4626.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/redeem_request/redeem_request.cairo` | `CONSTRUCTOR_DEAD_PARAM` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `FEES_RECIPIENT_ZERO_DOS` |
| `ForgeYields/starknet_vault_kit` | `packages/vault/src/vault/vault.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/manager/manager.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router/price_router.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router/price_router.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router_vesu/price_router_vesu.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/periphery/price_router_vesu/price_router_vesu.cairo` | `IRREVOCABLE_ADMIN` |
| `ForgeYields/starknet_vault_kit` | `packages/vault_allocator/src/vault_allocator/vault_allocator.cairo` | `IRREVOCABLE_ADMIN` |
| `cavos-labs/argus` | `contracts/src/argus.cairo` | `IRREVOCABLE_ADMIN` |
| `cavos-labs/argus` | `contracts/src/jwks_registry.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `fatlabsxyz/tongo` | `packages/contracts/src/tongo/Tongo.cairo` | `IRREVOCABLE_ADMIN` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/markets/factory.cairo` | `IRREVOCABLE_ADMIN` |
| `kiroshi-market/kiroshi-protocol` | `contracts/main/src/pool/shielded_pool.cairo` | `IRREVOCABLE_ADMIN` |
| `medialane-io/medialane-contracts` | `contracts/Medialane-Protocol/src/core/medialane.cairo` | `CEI_VIOLATION_ERC1155` |
| `salazarsebas/Zylith` | `src/pool/contract.cairo` | `IRREVOCABLE_ADMIN` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `IRREVOCABLE_ADMIN` |
| `salazarsebas/Zylith` | `src/verifier/coordinator.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
