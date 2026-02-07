# ERC-8004: Trustless Agents Registry (Cairo)

Cairo implementation of the [ERC-8004 Trustless Agent Registry](https://eips.ethereum.org/EIPS/eip-8004) standard for Starknet. This implementation is fully on par with the [Solidity reference implementation](https://github.com/erc-8004/erc-8004-contracts), with one key difference: **Poseidon hashing** is used instead of keccak256 and ABI encoding for all hash computations.

## Deployed Contracts

### Mainnet

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595` |
| ReputationRegistry | `0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944` |
| ValidationRegistry | `0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83` |

### Sepolia Testnet

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631` |
| ReputationRegistry | `0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e` |
| ValidationRegistry | `0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f` |

## About

This repository implements ERC-8004 (Trustless Agents): a lightweight set of on-chain registries that make agents discoverable and enable trust signals across organizational boundaries.

At a high level, ERC-8004 defines three registries:

- **Identity Registry**: an ERC-721 registry for agent identities (portable, browsable, transferable).
- **Reputation Registry**: a standardized interface for publishing and reading feedback signals.
- **Validation Registry**: hooks for validator smart contracts to publish validation results.

## Core Concepts

### Agent Identifier

- **agentId**: the ERC-721 tokenId minted by the Identity Registry

Off-chain payloads (registration files, feedback files, evidence) should include both fields so they can be tied back to the on-chain agent.

### What ERC-8004 Does (and Doesn't)

- **Discovery**: ERC-8004 makes agents discoverable via an ERC-721 identity whose tokenURI points to a registration file.
- **Trust signals**: ERC-8004 standardizes how reputation and validation signals are posted and queried on-chain.
- **Not payments**: Payment rails are intentionally out-of-scope; the spec shows how payments can enrich feedback signals, but ERC-8004 does not mandate a payment system.

## Registries

### Identity Registry (Agent Discovery)

The Identity Registry is an upgradeable ERC-721 where:

- `token_uri` points to the agent registration file (e.g., `ipfs://...` or `https://...`).
- `register_with_token_uri` mints a new agent NFT and assigns an `agent_id`.
- `set_token_uri` updates the agent's URI.

**On-chain Metadata**

The registry provides optional on-chain metadata:

- `get_metadata(agent_id, key) -> ByteArray`
- `set_metadata(agent_id, key, value)`

The reserved key `agentWallet` is managed specially:

- It can be updated only after proving control of the new wallet via `set_agent_wallet(...)` (SNIP-6 signature verification with domain-separated hash binding to chain + registry address).
- Signatures are single-use: each agent has a wallet-set nonce (`get_wallet_set_nonce(agent_id)`) included in the signed hash.
- It is cleared automatically on NFT transfer via the `before_update` hook so a new owner must re-verify.
- Nonce is intentionally not reset on transfer; replay remains blocked because the signed hash binds both owner and nonce.
- Helpers: `get_agent_wallet(agent_id)` and `unset_agent_wallet(agent_id)`.

**Agent Registration File (Recommended Shape)**

The `token_uri` should resolve to a JSON document that is friendly to NFT tooling (name/description/image) and also advertises agent endpoints:

- `type`: schema identifier for the registration format
- `name`, `description`, `image`
- `services`: a list of endpoints (e.g., A2A agent card URL, MCP endpoint, OASF manifest, ENS name, email)
- `registrations`: a list of `{ agentRegistry, agentId }` references to bind the file back to on-chain identity
- `supportedTrust`: optional list such as reputation, crypto-economic, tee-attestation

### Reputation Registry (Trust Signals)

The Reputation Registry stores and exposes feedback signals as a signed fixed-point number:

- `value`: i128 (signed)
- `value_decimals`: u8 (0-18)

Everything else is optional metadata (tags, endpoint URI, off-chain payload URI + hash).

**Interpreting value + value_decimals**

Treat the pair as a signed decimal number:

- Example: `value=9977`, `value_decimals=2` -> 99.77
- Example: `value=560`, `value_decimals=0` -> 560

This allows a single on-chain schema to represent percentages, scores, timings, dollar amounts, etc. (the meaning is conveyed by `tag1`/`tag2` and/or the off-chain file).

**Give Feedback**

`give_feedback(...)` records feedback for an agent. The implementation prevents self-feedback from the agent owner or approved operators (checked via the Identity Registry).

**Read + Aggregate**

Typical read paths:

- `read_feedback(agent_id, client_address, feedback_index)`
- `read_all_feedback(agent_id, client_addresses, tag1, tag2, include_revoked)`
- `get_summary(agent_id, client_addresses, tag1, tag2)` -> returns `(count, summary_value, summary_value_decimals)`

Note: `get_summary` requires `client_addresses` to be provided (non-empty) to reduce Sybil/spam risk.

**Responses and Revocation**

- Clients can revoke their feedback: `revoke_feedback(agent_id, feedback_index)`
- Anyone can append responses: `append_response(agent_id, client_address, feedback_index, response_uri, response_hash)`

### Validation Registry

The Validation Registry supports:

- `validation_request(validator_address, agent_id, request_uri, request_hash)` (must be called by owner/operator of agent_id)
- `validation_response(request_hash, response, response_uri, response_hash, tag)` (must be called by the requested validator)
- Read functions: `get_validation_status`, `get_summary`, `get_agent_validations`, `get_validator_requests`

## Suggested End-to-End Flow

1. Register an agent in the Identity Registry (`register_with_token_uri(...)`) and get an `agent_id`.
2. Publish a registration file (e.g., on IPFS/HTTPS) and set it as the token URI via `set_token_uri(agent_id, ...)`.
3. (Optional) Set a verified receiving wallet via `set_agent_wallet(...)` (SNIP-6 signature proof bound to this chain and registry contract).
4. Collect feedback from users/clients via `give_feedback(...)` on the Reputation Registry.
5. Aggregate trust in-app using `get_summary(...)` and/or pull raw feedback via `read_all_feedback(...)` for off-chain scoring.

## Features

**Identity Registry**
- ERC-721 compatible agent NFTs
- Flexible key-value metadata storage
- Agent wallet management with domain-separated SNIP-6 signature verification (`set_agent_wallet`, `get_agent_wallet`, `unset_agent_wallet`)
- Automatic wallet clearing on NFT transfer via `before_update` hook

**Reputation Registry**
- Client feedback with signed authorization
- Revocable feedback entries
- Agent response system
- Summary statistics with tag filtering

**Validation Registry**
- Request/response validation workflow
- Binary (approve/reject) and spectrum (0-100) scores
- Tag-based categorization
- Aggregated validation summaries

## Project Structure

```
src/
├── identity_registry.cairo       # ERC-721 agent identity NFTs
├── reputation_registry.cairo     # Client feedback system
├── validation_registry.cairo     # Third-party validation
├── interfaces/
│   ├── identity_registry.cairo   # Identity interface and events
│   ├── reputation_registry.cairo # Reputation interface and events
│   ├── validation_registry.cairo # Validation interface and events
│   └── account.cairo             # SNIP-6 account interface
└── mock/
    ├── mock_account.cairo        # OpenZeppelin account for testing
    ├── simple_mock_account.cairo # Simple mock for unit tests
    └── strict_mock_account.cairo # Deterministic hash-checking mock for security tests

tests/
├── test_identity_registry.cairo
├── test_reputation_registry.cairo
└── test_validation_registry.cairo

scripts/
└── deploy.js                     # Starknet.js deployment script

e2e-tests/
├── tests/
│   ├── identity.test.js
│   ├── reputation.test.js
│   ├── validation.test.js
│   └── wallet-signature.test.js
├── setup.js
└── test-runner.js
```

## Hashing Difference

This implementation uses **Poseidon hashing** (native to Starknet) instead of keccak256 and ABI encoding used in the Solidity version. This is an internal implementation detail and does not affect the contract interface or functionality. The contracts are upgradeable via `replace_class`, allowing migration to keccak if cross-chain verification becomes a requirement.

## Prerequisites

- Scarb 2.12.1
- Cairo 2.12.1
- Snforge 0.43.1
- Node.js >= 18.0.0

## Setup

```bash
# Clone and build
git clone git@github.com:Akashneelesh/erc8004-cairo.git
cd erc8004-cairo

# Build contracts
scarb build

# Run unit tests
scarb test
```

## Configuration

Copy `.env.example` to `.env` and configure:

```
STARKNET_RPC_URL=https://starknet-sepolia-rpc.publicnode.com
DEPLOYER_ADDRESS=0x...
DEPLOYER_PRIVATE_KEY=0x...
TEST_ACCOUNT_ADDRESS=0x...
TEST_ACCOUNT_PRIVATE_KEY=0x...
```

## Deployment

```bash
cd scripts
npm install
node deploy.js
```

## E2E Tests

```bash
cd e2e-tests
npm install
npm test
```

## Test Coverage

- 87 unit tests (Cairo)
- 43 E2E tests (Sepolia)

## License

CC0 - Public Domain

## Acknowledgments

Based on the [ERC-8004 Solidity reference implementation](https://github.com/erc-8004/erc-8004-contracts).
