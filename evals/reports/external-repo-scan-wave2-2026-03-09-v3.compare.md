# Wave2 detector scan delta (v2 -> v3)

- v2: `evals/reports/data/external-repo-scan-wave2-2026-03-09-v2.json`
- v3: `evals/reports/data/external-repo-scan-wave2-2026-03-09-v3.json`

- v2 findings: **31**
- v3 findings: **24**
- Delta: **-7**

## By Class

| Class | Baseline | Rerun | Delta |
| --- | ---: | ---: | ---: |
| `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` | 10 | 3 | -7 |
| `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` | 17 | 10 | -7 |
| `IRREVOCABLE_ADMIN` | 0 | 5 | +5 |
| `NO_ACCESS_CONTROL_MUTATION` | 3 | 1 | -2 |
| `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` | 1 | 5 | +4 |

- Removed: **16**

| Repo | File | Class |
| --- | --- | --- |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/account.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/erc1155.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/erc1155.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/erc20.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/erc20.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/erc721.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/erc721.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `OpenZeppelin/cairo-contracts` | `packages/presets/src/eth_account.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `OpenZeppelin/cairo-contracts` | `packages/upgrades/src/upgradeable.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `dojoengine/dojo` | `crates/dojo/core/src/contract/components/upgradeable.cairo` | `IMMEDIATE_UPGRADE_WITHOUT_TIMELOCK` |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/bridge/token_bridge.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/erc20/erc20.cairo` | `NO_ACCESS_CONTROL_MUTATION` |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/fee_token/fee_token.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `keep-starknet-strange/piltover` | `src/appchain.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/redemption.cairo` | `CRITICAL_ADDRESS_INIT_WITHOUT_NONZERO_GUARD` |

- Added: **9**

| Repo | File | Class |
| --- | --- | --- |
| `karnotxyz/starknet_bridge` | `starknet_bridge/src/bridge/token_bridge.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `keep-starknet-strange/piltover` | `src/appchain.cairo` | `IRREVOCABLE_ADMIN` |
| `keep-starknet-strange/piltover` | `src/appchain.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `IRREVOCABLE_ADMIN` |
| `spiko-tech/starknet-contracts` | `src/lib.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `spiko-tech/starknet-contracts` | `src/redemption.cairo` | `IRREVOCABLE_ADMIN` |
| `spiko-tech/starknet-contracts` | `src/redemption.cairo` | `UPGRADE_CLASS_HASH_WITHOUT_NONZERO_GUARD` |
| `typhoonmixer/typhoon-contracts` | `src/NoteAccount.cairo` | `IRREVOCABLE_ADMIN` |
| `typhoonmixer/typhoon-contracts` | `src/Typhoon.cairo` | `IRREVOCABLE_ADMIN` |

