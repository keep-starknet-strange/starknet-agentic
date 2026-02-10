# Cross-chain ERC-8004 Demo (Base Sepolia + Starknet Sepolia)

This example demonstrates one end-to-end flow:

1. Deploy an agent account on Starknet via `AgentAccountFactory`
2. Register an ERC-8004 identity on Base Sepolia
3. Write a shared `agentURI` (data URI) on both registries with both registrations
4. Emit a single `crosschain_receipt.json`

For v2 scaffolding, the flow also includes a pre-onboarding funding decision stage:
- if deployer balance is above threshold, funding is skipped;
- if below threshold and `FUNDING_PROVIDER=mock`, the mock provider path is used in PR1;
- if below threshold and `FUNDING_PROVIDER=auto`, the script fails closed (no fake funding success).

## Prerequisites

- Node.js 20+
- `pnpm install`
- A funded Starknet Sepolia deployer account
- A funded Base Sepolia EOA

## Setup

```bash
cd examples/crosschain-demo
cp .env.example .env
# fill required keys
```

Funding-related vars (PR1 scaffolding):
- `MIN_STARKNET_DEPLOYER_BALANCE_WEI` (default `0.005 ETH`)
- `FUNDING_PROVIDER` (`auto`, `mock`, `skipped`, or `starkgate-l1`)

For real L1 automation (PR2a StarkGate path), set:
- `L1_RPC_URL`
- `L1_PRIVATE_KEY` (Ethereum Sepolia key used for StarkGate deposit)
- optional overrides: `FUNDING_TIMEOUT_MS`, `FUNDING_POLL_INTERVAL_MS`, `L1_GAS_BUFFER_WEI`, `STARKGATE_ETH_BRIDGE_L1`

## Run

```bash
# Standard mode (agent account pays for post-deploy URI update)
pnpm demo

# Sponsored mode (AVNU paymaster for Starknet txs)
pnpm demo:gasfree

# Sponsored + optional tx verification from new account
pnpm demo:verify
```

## Output

The script writes `crosschain_receipt.json` with:

- Top-level `funding` object (`version: "2"`)
- Starknet: account address, agent id, deploy tx hash, URI update tx hash
- Base: agent id, register tx hash, URI update tx hash
- Shared URI used on both chains

## Notes

- Default EVM network is Base Sepolia (`eip155:84532`).
- Default Starknet network is Sepolia (`starknet:SN_SEPOLIA`).
- This is a v1 demo flow for identity linkage. Bridge automation is out of scope.
- With `FUNDING_PROVIDER=starkgate-l1` (or `auto` + L1 vars configured), the runner deposits ETH from Ethereum Sepolia to the Starknet deployer address and waits for the L2 balance threshold before proceeding.
- StarkGate L1->L2 settlement on Sepolia can take several minutes. The runner polls Starknet balance until timeout (default 15 minutes).

## How To Verify This Exact Run

The following transactions are from the reference run used in issue updates:

- Base Sepolia register tx:  
  https://sepolia.basescan.org/tx/0x2d6892459145512c91e914a408d27dfcc9bf180ce7fe4da8e5ab8bd8e50b528e
- Base Sepolia setAgentURI tx:  
  https://sepolia.basescan.org/tx/0x1345421e530bd634c07453e8e5a5e354601955405e699b2740b47acf6c2d3fa8
- Starknet Sepolia deploy tx:  
  https://sepolia.voyager.online/tx/0x54bd04b6396a16a9309cf3cbad17a7eecffc06a608d7de08ae0e7dd605d6bdb

You can compare the tx hashes against the generated `crosschain_receipt.json`.
