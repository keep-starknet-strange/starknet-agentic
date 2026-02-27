# ERC-8004 Deployment Truth Sheet

Last updated: 2026-02-23

This document is the quick source of truth for what is already deployed and what is still pending for ERC-8004 + Agent Account launch readiness.

## Live Deployments

### Starknet Mainnet (`SN_MAIN`)

| Contract | Address | Class Hash (`starknet_getClassHashAt`) | Status |
|----------|---------|----------------------------------------|--------|
| IdentityRegistry | `0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595` | `0x30761c5d3e32bd477a4cdd99dcc66f79929a441827fb03ac0d3897e88d300c2` | Live |
| ReputationRegistry | `0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944` | `0x4a071de30522798af10253ea0c47c684978b63f7957a804a193b2907f333696` | Live |
| ValidationRegistry | `0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83` | `0x61cdb88f4c1a735239d606b9bce3c74d1a47cd6cd91110b8e9f9bdab9c33066` | Live |

### Starknet Sepolia (`SN_SEPOLIA`)

| Contract | Address | Class Hash (`starknet_getClassHashAt`) | Status |
|----------|---------|----------------------------------------|--------|
| IdentityRegistry | `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631` | `0x30761c5d3e32bd477a4cdd99dcc66f79929a441827fb03ac0d3897e88d300c2` | Live |
| ReputationRegistry | `0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e` | `0x4a071de30522798af10253ea0c47c684978b63f7957a804a193b2907f333696` | Live |
| ValidationRegistry | `0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f` | `0x61cdb88f4c1a735239d606b9bce3c74d1a47cd6cd91110b8e9f9bdab9c33066` | Live |
| AgentAccountFactory | `0x358301e1c530a6100ae2391e43b2dd4dd0593156e59adab7501ff6f4fe8720e` | `0x3257c0bca4d16ece9a0cc3eac736e3a5d94ce9867a65d1ad5565539c86ec209` | Live |

## Pending Deployments

| Contract | Network | Status |
|----------|---------|--------|
| AgentAccountFactory | Mainnet | Pending |

## Verification Runbook

1. Verify chain target and address on explorer (Voyager).
2. Verify class hash and ABI match the expected local artifact.
3. Verify `identity_registry` links in Reputation and Validation registries.
4. Verify ownership is multisig-controlled (not single EOA).
5. Run post-deploy smoke calls:
   - Identity: `register_with_token_uri`, `set_metadata`, `get_agent_wallet`
   - Reputation: `give_feedback`, `read_feedback`, `get_summary`
   - Validation: `validation_request`, `validation_response`, `get_validation_status`

## Notes

- `validation_response` is immutable in Cairo (second submit for same request reverts).
- `read_all_feedback` requires explicit non-empty `client_addresses`; broad scans should use `read_all_feedback_paginated`.
- If any other repo document conflicts with this file, treat that as a docs bug and open/update a follow-up issue immediately.
- RPC endpoints used for this verification snapshot:
  - Mainnet: `https://starknet-rpc.publicnode.com`
  - Sepolia: `https://starknet-sepolia-rpc.publicnode.com`
