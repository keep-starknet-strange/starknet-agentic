# External Repo Detector Sweep (external-repo-scan-wave2-2026-03-09-v3)

Generated: 2026-03-09T01:42:20+00:00

Machine-readable artifact:

- `evals/reports/data/external-repo-scan-wave2-2026-03-09-v3.json`

## Scope

1. `OpenZeppelin/cairo-contracts@2ce56dd7d736`
2. `atomiqlabs/atomiq-contracts-starknet@b5875a031063`
3. `typhoonmixer/typhoon-contracts@e11dffbe1c8c`
4. `karnotxyz/starknet_bridge@44e2255dae07`
5. `keep-starknet-strange/piltover@658d707a5cc3`
6. `dojoengine/dojo@4a374ac64300`
7. `spiko-tech/starknet-contracts@487823179d75`

## Coverage

| Repo | Cairo files (all) | Cairo files (prod-only) | Hits |
| --- | ---: | ---: | ---: |
| OpenZeppelin/cairo-contracts | 307 | 145 | 0 |
| atomiqlabs/atomiq-contracts-starknet | 120 | 56 | 0 |
| typhoonmixer/typhoon-contracts | 16 | 12 | 8 |
| karnotxyz/starknet_bridge | 43 | 18 | 3 |
| keep-starknet-strange/piltover | 25 | 15 | 3 |
| dojoengine/dojo | 105 | 39 | 2 |
| spiko-tech/starknet-contracts | 5 | 4 | 8 |

## Results

- Total findings: **24**

By class:

- `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD`: 3
- `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK`: 10
- `IRREVOCABLE_ADMIN`: 5
- `NO_ACCESS_CONTROL_MUTATION`: 1
- `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD`: 5

By repo:

- `OpenZeppelin/cairo-contracts`: 0
- `atomiqlabs/atomiq-contracts-starknet`: 0
- `dojoengine/dojo`: 2
- `karnotxyz/starknet_bridge`: 3
- `keep-starknet-strange/piltover`: 3
- `spiko-tech/starknet-contracts`: 8
- `typhoonmixer/typhoon-contracts`: 8

## Findings

| Repo | File | Class |
| --- | --- | --- |
| `typhoonmixer/typhoon-contracts` | `src/NoteAccount.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `typhoonmixer/typhoon-contracts` | `src/NoteAccount.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `typhoonmixer/typhoon-contracts` | `src/NoteAccount.cairo` | `IRREVOCABLE_ADMIN` |
| `typhoonmixer/typhoon-contracts` | `src/Pool.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `typhoonmixer/typhoon-contracts` | `src/Pool.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `typhoonmixer/typhoon-contracts` | `src/Typhoon.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `typhoonmixer/typhoon-contracts` | `src/Typhoon.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `typhoonmixer/typhoon-contracts` | `src/Typhoon.cairo` | `IRREVOCABLE_ADMIN` |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/bridge/token_bridge.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/bridge/token_bridge.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/fee_token/fee_token.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `keep-starknet-strange/piltover` | `src/appchain.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `keep-starknet-strange/piltover` | `src/appchain.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `keep-starknet-strange/piltover` | `src/appchain.cairo` | `IRREVOCABLE_ADMIN` |
| `dojoengine/dojo` | `crates/dojo/core/src/world/world_contract.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `dojoengine/dojo` | `crates/dojo/core/src/world/world_contract.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `IRREVOCABLE_ADMIN` |
| `spiko-tech/starknet-contracts` | `src/permission_manager.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `spiko-tech/starknet-contracts` | `src/permission_manager.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/redemption.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `spiko-tech/starknet-contracts` | `src/redemption.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/redemption.cairo` | `IRREVOCABLE_ADMIN` |

