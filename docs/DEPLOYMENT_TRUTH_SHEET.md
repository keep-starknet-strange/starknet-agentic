# Deployment Truth Sheet

As of **2026-02-22 (UTC)**.

This document is the canonical deployment status reference for ERC-8004 registries and agent-account contracts in this repo. It is based on direct JSON-RPC queries and local class-hash computation from `origin/main` (`6d44f6b`).

## Verification Method

- On-chain class hash: `starknet_getClassHashAt`
- First-seen block/time: binary search over `starknet_getClassHashAt` by block number, then block timestamp lookup
- On-chain owner values: `starkli call ... owner` (registries) and `starkli call ... get_owner` (factory)
- Local class hash: `scarb build` + `starkli class-hash`

Tooling used during verification:
- `scarb 2.14.0`
- `starkli 0.4.2`

## Current Deployments

### Mainnet ERC-8004 Registries

| Contract | Address | On-chain class hash | First seen block | First seen (UTC) |
|---|---|---|---:|---|
| IdentityRegistry | `0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595` | `0x30761c5d3e32bd477a4cdd99dcc66f79929a441827fb03ac0d3897e88d300c2` | 6481500 | 2026-02-05T21:02:21Z |
| ReputationRegistry | `0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944` | `0x4a071de30522798af10253ea0c47c684978b63f7957a804a193b2907f333696` | 6481525 | 2026-02-05T21:03:31Z |
| ValidationRegistry | `0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83` | `0x61cdb88f4c1a735239d606b9bce3c74d1a47cd6cd91110b8e9f9bdab9c33066` | 6481546 | 2026-02-05T21:04:28Z |

Mainnet registry owner for all three contracts:
- `0x023ad71d10539a910f291472c3dfad913bb6306218ffd65ac97e79d13aad4aaf`

### Sepolia ERC-8004 Registries (Current Set)

These addresses match mainnet class hashes.

| Contract | Address | On-chain class hash | First seen block | First seen (UTC) |
|---|---|---|---:|---|
| IdentityRegistry | `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631` | `0x30761c5d3e32bd477a4cdd99dcc66f79929a441827fb03ac0d3897e88d300c2` | 6226779 | 2026-02-05T21:15:54Z |
| ReputationRegistry | `0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e` | `0x4a071de30522798af10253ea0c47c684978b63f7957a804a193b2907f333696` | 6226789 | 2026-02-05T21:16:20Z |
| ValidationRegistry | `0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f` | `0x61cdb88f4c1a735239d606b9bce3c74d1a47cd6cd91110b8e9f9bdab9c33066` | 6226798 | 2026-02-05T21:16:43Z |

Sepolia registry owner for all three contracts:
- `0x04a6b1f403e879b54ba3e68072fe4c3aaf8eb3617a51d8fea59b769432abbf50`

### Sepolia Legacy Set (Still Live)

These are older addresses still referenced by some docs/examples.

| Contract | Address | On-chain class hash | First seen block | First seen (UTC) |
|---|---|---|---:|---|
| IdentityRegistry | `0x7856876f4c8e1880bc0a2e4c15f4de3085bc2bad5c7b0ae472740f8f558e417` | `0x715e0f45e46b9f936aded7333d3000515ef66a192e6a7409f4a5080428cde68` | 6336681 | 2026-02-09T03:03:14Z |
| ReputationRegistry | `0x14204d04aca5df7ebfe9fe07f278e5d6c9b922d797b42e63a81b60f8f2d495a` | `0xecfbf3f540f946a7a47419beea497008ea7ebb0093c4ca9dfb81281e82c06b` | 6336706 | 2026-02-09T03:04:17Z |
| ValidationRegistry | `0x13739de746a432b9fe36925cf4dfe469221bdc82e19f43fa4f95f8593aa8e1` | `0x313bb3f0a0d16aba26e3b49f2197ed7db550967439421b8248e82973a2a6c4f` | 6336730 | 2026-02-09T03:05:18Z |

### AgentAccountFactory (Sepolia)

| Contract | Address | On-chain class hash | First seen block | First seen (UTC) |
|---|---|---|---:|---|
| AgentAccountFactory | `0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e` | `0x3257c0bca4d16ece9a0cc3eac736e3a5d94ce9867a65d1ad5565539c86ec209` | 6336772 | 2026-02-09T03:07:07Z |

Factory runtime values:
- `get_owner()` -> `0x02ceed65a4bd731034c01113685c831b01c15d7d432f71afb1cf1634b53a2125`
- `get_identity_registry()` -> `0x07856876f4c8e1880bc0a2e4c15f4de3085bc2bad5c7b0ae472740f8f558e417`
- `get_account_class_hash()` -> `0x508f4f19541138c4a2089f6ae049fc30498cfc3ae861948d5ae74533ea8c4f`

⚠️ **Operational warning:** `get_identity_registry()` currently points to the
legacy Sepolia `IdentityRegistry` (`0x07856876...`), not the current Sepolia
registry (`0x72eb37b...`). Any new `AgentAccount` deployed through this
`AgentAccountFactory` will be bound to the legacy registry. A factory
redeployment or upgrade is required to bind new `AgentAccount` deployments to
the current registry.

No mainnet AgentAccountFactory deployment is documented in-repo as of this snapshot.

## Drift vs `origin/main` (`6d44f6b`)

Class hashes computed from local build at `origin/main`:

### ERC-8004 (origin/main)

| Contract | Local class hash (`origin/main`) |
|---|---|
| IdentityRegistry | `0x06df5b2762aba4b3156251be11aecc130dcbe9800631df2729bd5e9c2195c551` |
| ReputationRegistry | `0x07deca5a8bf0af6c3cc89ebcb18fb150faacf96b255adf36a77b5ccae5163fd5` |
| ValidationRegistry | `0x008bb91a9ec5ce8df1403512ba2ca62c0c889a3e288ab2375077e6774fd87307` |

### Agent Account (origin/main)

| Contract | Local class hash (`origin/main`) |
|---|---|
| AgentAccount | `0x035760254f4c57ad5dd9a69d068d6691dac8064c7449f747564a165a5895821e` |
| AgentAccountFactory | `0x0617a9b7171eea953367d52ca174a43e69bad570e8f1876a1b95d89351fede3b` |

Conclusion:
- Current deployed registry class hashes do **not** match `origin/main` class hashes.
- Current deployed AgentAccountFactory class hash does **not** match `origin/main`.
- Latest contract source has not been fully deployed as of this snapshot.

## Notes

- `docs/ERC8004-PARITY.md` and website docs previously contained stale deployment status and should be treated as historical context unless they explicitly reference this file.
- `contracts/erc8004-cairo/README.md` is maintained as the contract-local quick reference, but this truth sheet is the canonical reconciliation source.
