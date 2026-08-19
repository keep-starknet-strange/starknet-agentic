---
name: starknet-identity
description: Register AI agents on-chain using the ERC-8004 Trustless Agents standard. Manage agent identity as NFTs, build reputation through feedback, and request third-party validation.
license: Apache-2.0
metadata: {"author":"starknet-agentic","version":"1.0.0","org":"keep-starknet-strange"}
keywords: [starknet, identity, erc-8004, agent-registry, reputation, validation, nft, trustless, on-chain-identity, agent-registration]
allowed-tools: [Bash, Read, Write, Glob, Grep, Task]
user-invocable: true
---

# Starknet Identity Skill

Register and manage AI agent identities on Starknet using the ERC-8004 standard.

## When to Use

- Registering agents on-chain, updating agent metadata, or managing reputation and validation flows.
- Building features that depend on ERC-8004 identity, feedback, or validator attestations.

## When NOT to Use

- Simple wallet, payment, or DeFi flows that do not depend on ERC-8004 registries.
- Cairo contract authoring, deployment-only tasks, or security auditing.

## Quick Start

1. Install `starknet` and connect a funded account to the target ERC-8004 registry deployment.
2. Use [skills catalog](../README.md) if the flow also needs wallet setup, deployment, or contract auditing.

## Overview

ERC-8004 defines three interconnected on-chain registries for AI agents:

1. **Identity Registry** -- Agents as ERC-721 NFTs with metadata
2. **Reputation Registry** -- Feedback, filtered by reviewer at read time
3. **Validation Registry** -- Third-party assessments (zkML, TEE, staker)

Reference implementation: [erc8004-cairo](https://github.com/Akashneelesh/erc8004-cairo)

## Prerequisites

```bash
npm install starknet
```

## Agent Registration

### Register a New Agent

```typescript
import { Account, RpcProvider, Contract, CallData } from "starknet";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
const account = new Account({ provider, address, signer: privateKey });

const identityRegistry = new Contract({
  abi: identityRegistryAbi,
  address: registryAddress,
  providerOrAccount: account,
});

// Register with metadata
const metadata = [
  { key: "agentName", value: "MyTradingAgent" },
  { key: "agentType", value: "defi-trader" },
  { key: "version", value: "1.0.0" },
  { key: "model", value: "claude-opus-4-5" },
  { key: "status", value: "active" },
];

const tokenUri = "ipfs://QmYourAgentSpecHash"; // IPFS link to full agent spec

const { transaction_hash } = await account.execute({
  contractAddress: registryAddress,
  entrypoint: "register_with_metadata",
  calldata: CallData.compile({
    token_uri: tokenUri,
    metadata: metadata,
  }),
});

const receipt = await account.waitForTransaction(transaction_hash);
// Parse agent_id from events
```

### Query Agent Information

```typescript
// Check if agent exists
const exists = await identityRegistry.agent_exists(agentId);

// Get total registered agents
const totalAgents = await identityRegistry.total_agents();

// Get agent metadata
const name = await identityRegistry.get_metadata(agentId, "agentName");
const agentType = await identityRegistry.get_metadata(agentId, "agentType");

// Get agent owner (ERC-721)
const owner = await identityRegistry.owner_of(agentId);
```

### Update Agent Metadata

```typescript
// Only the agent owner can update metadata
await account.execute({
  contractAddress: registryAddress,
  entrypoint: "set_metadata",
  calldata: CallData.compile({
    agent_id: agentId,
    key: "status",
    value: "upgraded",
  }),
});
```

## Reputation System

### Submit Feedback

Any client may call `give_feedback` directly. The deployed registry does **not**
require an authorization signature from the agent owner, so anyone can write
feedback about any agent, solicited or not. Plan for that (see
[Security Considerations](#security-considerations)).

One exception: the agent's own side cannot rate itself. `give_feedback` reverts
with `Self-feedback not allowed` when the caller is the owner, an address
approved for that token, or an operator approved for all of the owner's tokens.
A delegated agent account is blocked by that check too, not just the owner. The
same call reverts with `Agent does not exist` for an `agent_id` that was never
minted.

A score is a **signed fixed-point pair**, not a 0-100 integer: `value` (`i128`)
plus `value_decimals` (`u8`, 0-18). Read them together — `value: 9977` with
`value_decimals: 2` means 99.77. The contract bounds `value` to ±1e38
(`MAX_ABS_VALUE`) and rejects `value_decimals` above 18, reverting with
`value too large` or `too many decimals`. What it does not impose is a *meaning*:
there is no standard 0-100 scale, so a score is only comparable against others
from the same writer using the same `tag1`.

```typescript
import { CallData, byteArray, cairo } from "starknet";

// Serialize the compound types explicitly. A plain JS string is not a ByteArray
// and a scalar is not a u256, so passing them raw compiles to calldata that
// give_feedback cannot decode.
const calldata = CallData.compile({
  agent_id: cairo.uint256(agentId),
  value: 85n,                                       // i128; 85 with 0 decimals = 85
  value_decimals: 0,                                // u8, 0-18
  tag1: byteArray.byteArrayFromString("reliability"),
  tag2: byteArray.byteArrayFromString("speed"),
  endpoint: byteArray.byteArrayFromString(""),      // which service was used
  feedback_uri: byteArray.byteArrayFromString(""),  // optional off-chain detail
  feedback_hash: cairo.uint256(0),
});

await clientAccount.execute([{
  contractAddress: reputationRegistryAddress,
  entrypoint: "give_feedback",
  calldata,
}]);
```

A negative `value` is allowed, but it travels as a field element rather than a
128-bit two's-complement integer: encode it as `FELT_PRIME - abs(value)`. See
`toI128BigInt` in `contracts/erc8004-cairo/e2e-tests/tests/reputation.test.js`.

### Query Reputation

```typescript
const reputationRegistry = new Contract({
  abi: reputationAbi,
  address: reputationAddress,
  providerOrAccount: provider,
});

// get_summary REVERTS on an empty client list. This is deliberate: an unfiltered
// average is exactly what EIP-8004 warns is Sybil-bait, so decide whose opinion
// you trust and pass those addresses.
const trusted = [clientA, clientB]; // must be non-empty
const [count, value, valueDecimals] = await reputationRegistry.get_summary(
  agentId,
  trusted,
  "", // tag1 filter, empty ByteArray = all
  "", // tag2 filter, empty ByteArray = all
);
// value can reach ±1e38, far past Number.MAX_SAFE_INTEGER, so keep it a BigInt
// and format the fixed-point pair with integer math instead of dividing floats.
function formatFixedPoint(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals ? `.${digits.slice(digits.length - decimals)}` : "";
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

const average = formatFixedPoint(BigInt(value), Number(valueDecimals));

// Read specific feedback: (value, value_decimals, tag1, tag2, is_revoked)
const [fValue, fDecimals, tag1, tag2, isRevoked] =
  await reputationRegistry.read_feedback(agentId, clientAddress, feedbackIndex);

// Get all clients who gave feedback
const clients = await reputationRegistry.get_clients(agentId);
```

## Validation System

### Request Validation

```typescript
const validationRegistry = new Contract({
  abi: validationAbi,
  address: validationAddress,
  providerOrAccount: account,
});

// Agent owner requests validation from a specific validator
await account.execute({
  contractAddress: validationAddress,
  entrypoint: "validation_request",
  calldata: CallData.compile({
    validator_address: validatorAddress,
    agent_id: agentId,
    request_uri: "ipfs://QmValidationRequestDetails",
    request_hash: 0, // Auto-generated if 0
  }),
});
```

### Submit Validation Response

```typescript
// Validator responds to the request
await validatorAccount.execute({
  contractAddress: validationAddress,
  entrypoint: "validation_response",
  calldata: CallData.compile({
    request_hash: requestHash,
    response: 92, // Score 0-100
    response_uri: "ipfs://QmValidationReport",
    response_hash: reportHash,
    tag: encodedTag("performance"),
  }),
});
```

### Query Validation Status

```typescript
// Get validation summary
const [validationCount, avgValidationScore] = await validationRegistry.get_summary(
  agentId,
  [], // all validators
  0,  // tag filter
);

// Get specific validation
const [validator, agentId_, response, tag, lastUpdate] =
  await validationRegistry.get_validation_status(requestHash);
```

## A2A Agent Card Integration

Combine on-chain identity with A2A Agent Cards for discoverability:

```json
{
  "name": "MyTradingAgent",
  "description": "Autonomous DeFi trading agent on Starknet",
  "url": "https://my-agent.example.com",
  "provider": {
    "organization": "MyOrg"
  },
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "starknet-swap",
      "name": "Token Swap",
      "description": "Execute token swaps on Starknet via avnu"
    }
  ],
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "authentication": {
    "schemes": ["bearer"]
  },
  "starknetIdentity": {
    "registryAddress": "0x...",
    "agentId": 42,
    "reputationScore": 85,
    "validationCount": 3
  }
}
```

Serve at `/.well-known/agent.json` for A2A discovery.

## Metadata Schema (Recommended)

| Key | Description | Example |
|-----|-------------|---------|
| `agentName` | Display name | `"MyTradingAgent"` |
| `agentType` | Category | `"defi-trader"`, `"nft-curator"`, `"data-analyst"` |
| `version` | Semantic version | `"1.0.0"` |
| `model` | LLM model used | `"claude-opus-4-5"`, `"gpt-4o"` |
| `status` | Current status | `"active"`, `"paused"`, `"deprecated"` |
| `framework` | Agent framework | `"daydreams"`, `"openclaw"`, `"langchain"` |
| `capabilities` | Comma-separated | `"swap,stake,lend"` |
| `a2aEndpoint` | Agent Card URL | `"https://agent.example.com"` |
| `moltbookId` | MoltBook agent ID | `"agent_abc123"` |

## Security Considerations

- Only the agent owner can update metadata
- **Feedback is NOT gated by an owner signature.** Any address can call
  `give_feedback` about any agent. There is no on-chain spam protection, so treat
  raw feedback as untrusted input and filter by reviewer before showing or
  aggregating it
- `get_summary` refuses an empty `client_addresses` list, which forces that filter
  at the contract level
- Self-feedback is prevented for the whole owner side, not just the owner
  address: `give_feedback` rejects the owner, any address approved for that
  token, and any operator approved for all of the owner's tokens. Do not route
  client feedback through an account that is also an operator on the agent, or
  every call reverts as self-feedback
- Self-validation is prevented (agent owner cannot validate own agent)
- Signatures include chain ID and expiry to prevent replay attacks
- Agent identity (NFT) is transferable -- new owner inherits reputation

## Error Codes

| Code | Meaning | Likely causes | Recovery | User-facing message |
|-----|---------|---------------|----------|---------------------|
| `REGISTRATION_FAILED` | Initial ERC-8004 registration or metadata write reverted. | Missing fees, duplicate registration, invalid calldata, or stale contract state. | Retry after checking wallet balance, contract state, and constructor/registration inputs. | "Registration failed. Check wallet state and retry." |
| `AUTHORIZATION_DENIED` | An owner-gated write was rejected, or `give_feedback` was rejected as self-feedback. | Wrong signer or outdated owner state on metadata writes; for feedback, a caller that is the owner, an approved address, or an operator on that agent. | Re-fetch owner state and verify permissions for owner-gated writes. Feedback carries no authorization proof, so there is nothing to re-sign: submit it from an account with no approval on the agent. | "Authorization denied. Verify signer permissions and retry." |
| `VALIDATION_TIMEOUT` | Off-chain validation or watcher flow did not complete before the deadline. | Slow relayer, RPC degradation, or downstream A2A service lag. | Retry with a longer timeout after checking chain health, relayer status, and RPC latency. | "Validation timed out. Retry after checking network health." |
| `SIGNATURE_EXPIRED` | Signed payload expired before submission. | Expiry window too short or user approval arrived too late. | Generate a fresh signature with a new expiry and resubmit immediately. | "Signature expired. Re-sign and submit again." |
| `OWNER_TRANSFERRED` | Agent NFT ownership changed while a write or feedback flow was in flight. | NFT transfer, marketplace sale, or custodial wallet rotation. | Refresh ownership state and retry owner-gated writes from the new owner. Existing feedback is unaffected: reputation follows the NFT. Re-check that your feedback account is not an approved operator of the new owner. | "Ownership changed. Refresh owner state and retry with the new owner." |

## References

- [ERC-8004 EIP](https://eips.ethereum.org/EIPS/eip-8004)
- [ERC-8004 Cairo Implementation](https://github.com/Akashneelesh/erc8004-cairo)
- [A2A Protocol](https://a2a-protocol.org/latest/)
- [Starknet Account Abstraction](https://www.starknet.io/blog/native-account-abstraction/)
