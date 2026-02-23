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

## Runtime Semantics and Integrator Notes

This section documents behavioral edges that integrators should understand. Each item is either enforced in contract code or explicitly documented here as accepted risk.

### Identity Registry: Reserved Key Policy

The only reserved metadata key is `"agentWallet"`. Calling `set_metadata` with this key will revert with `'reserved key'`.

- **Enforcement**: contract-level assertion in `_is_reserved_key()`. No off-chain bypass exists.
- **Key normalization**: keys are hashed via Poseidon for storage, but comparison is byte-exact. `"agentWallet"` and `"agentwallet"` are different keys -- only the exact string `"agentWallet"` is reserved.
- **Empty keys**: rejected with `'Empty key'` assertion.
- **Extensibility**: adding future reserved keys requires a contract upgrade (`replace_class`). There is currently no reserved-key registry or prefix convention beyond `"agentWallet"`.

`agentWallet` can only be set via `set_agent_wallet()` which requires an SNIP-6 signature proof, or is auto-populated at registration time.

### Validation Registry: Response Immutability Semantics

Each `(request_hash)` maps to exactly one `Response` in a `Map<u256, Response>`. The response is **finalize-once**:

- **Single response per request hash**: once the designated validator submits `validation_response`, any second response for the same `request_hash` reverts with `'Response already submitted'`.
- **Not accumulative**: there is no response history map for a given request hash. If audit trails are needed, index `ValidationResponse` events off-chain.
- **Request immutability**: the request itself cannot be overwritten (assertion: `'Request hash exists'`).
- **One validator per request**: only the address specified in `validator_address` at request creation time can respond.
- **How to represent re-evaluation**: create a new validation request with a new `request_hash`.

### Reputation Registry: Spam and Griefing Tradeoffs

The Reputation Registry has **limited on-chain spam protection** by design. The following protections exist:

| Protection | Mechanism |
|-----------|-----------|
| Self-feedback | Blocked. `is_authorized_or_owner(caller, agent_id)` check prevents owners and operators from rating their own agents. |
| Reentrancy | Guard on `give_feedback`. |
| Revocation | Only the original submitter can revoke their own feedback. |
| Response to revoked | Blocked. Cannot `append_response` to revoked feedback. |

The following protections **do not exist on-chain** (accepted risk):

| Risk | Status |
|------|--------|
| Rate limiting | No cap on feedback submissions per caller per agent. A single address can submit unlimited feedback entries. |
| Response caps | No limit on `append_response` calls. Same responder can append unlimited responses to the same feedback entry. |
| Sybil flooding | No on-chain identity verification for callers beyond address uniqueness. |
| Time throttling | No cooldown between feedback submissions. |

**Mitigation guidance for integrators**:

- `get_summary()` requires an explicit `client_addresses` list rather than iterating all clients. This is the primary Sybil defense: curate the address list off-chain.
- Off-chain indexers should apply reputation scoring, rate-limit detection, and Sybil filtering before presenting aggregated results.
- The `response_count` storage tracks per-responder response counts for each feedback entry, enabling off-chain anomaly detection.

## Lifecycle and Trust Model

### Registry Reference Immutability

The `identity_registry` address stored in both ValidationRegistry and ReputationRegistry is **immutable after construction**. It is written exactly once in the constructor and never modified at runtime.

- There is no `set_identity_registry()` function in either contract or trait.
- The `upgrade()` function (owner-only) replaces the contract implementation via `replace_class`, but does not modify storage state. The identity registry binding survives upgrades.

**Migration strategy**: to point at a new IdentityRegistry deployment, you must deploy a new ValidationRegistry and/or ReputationRegistry instance. There is no in-place re-binding. This is intentional: it prevents a compromised owner from silently redirecting authorization checks to a different registry.

### Agent Wallet Trust Model

`set_agent_wallet` verifies that the proposed wallet can produce a valid SNIP-6 signature over a domain-separated message (binding agent_id, new wallet, current owner, deadline, nonce, chain_id, and registry address). This proves:

1. The caller controls an account at the proposed wallet address.
2. The signature was produced specifically for this registry on this chain (not replayable cross-registry or cross-chain).
3. The signature is single-use (nonce consumed after successful set).

**What `set_agent_wallet` does NOT verify**:

- It does not certify that the wallet contract is safe, non-malicious, or correctly implemented.
- It does not check whether the wallet supports specific token standards or can receive assets.
- It does not validate the wallet contract's bytecode or class hash.

Operators and integrators should treat `agentWallet` as a verified-control-of-key claim, not a guarantee of implementation safety. UI layers should display appropriate warnings when users interact with agent wallets.

### Operator Guidance

**Upgradeability**: all three registries use OpenZeppelin's `UpgradeableComponent`. The `upgrade()` function is gated by `OwnableComponent` (owner-only). Operators should:

- Use a multisig or governance contract as the owner address, not an EOA.
- Verify new class hashes via independent audit before calling `upgrade()`.
- Monitor `Upgraded` events for unauthorized or unexpected upgrades.

**Key management**: the contract owner can call `upgrade()` but cannot modify stored data (agent metadata, feedback, validation responses) outside the defined public API. There is no admin backdoor for data manipulation.

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

## Production Operations Checklist

This checklist guides production deployment, key management, monitoring, and incident response for the ERC-8004 registries.

### Pre-Deployment

**1. Environment Setup**
- [ ] Generate or provision a multisig account for contract owner role (recommended: 2-of-3 or 3-of-5)
- [ ] Fund deployer account with sufficient ETH for declaration and deployment gas
- [ ] Configure `.env` with RPC URL, deployer address, and deployer private key
- [ ] Verify private key security: stored in secure vault, never committed to version control
- [ ] Test RPC connectivity: `curl -X POST $STARKNET_RPC_URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"starknet_chainId","params":[],"id":1}'`

**2. Build Verification**
- [ ] Build contracts: `scarb build`
- [ ] Run unit tests: `scarb test` (all tests must pass)
- [ ] Verify no local modifications to contract source (git status clean or approved diff)
- [ ] Inspect generated class hashes via `sncast` or manual computation
- [ ] Compare class hashes against reference deployment (if upgrading existing instances)

**3. Deployment Dry Run (Testnet)**
- [ ] Deploy to Sepolia testnet using `scripts/deploy.js`
- [ ] Verify deployment: all three contracts deployed successfully
- [ ] Verify constructor arguments: owner address matches deployer, identity registry references are correct in reputation and validation registries
- [ ] Run E2E tests: `cd e2e-tests && npm install && npm test` (all tests must pass)
- [ ] Manually verify on Voyager: check owner, check identity registry references

### Deployment (Mainnet)

**4. Contract Declaration**
- [ ] Declare IdentityRegistry class hash
- [ ] Declare ReputationRegistry class hash
- [ ] Declare ValidationRegistry class hash
- [ ] Record all three class hashes in deployment log
- [ ] Verify class hashes on Voyager (inspect bytecode if paranoid)

**5. Contract Deployment**
- [ ] Deploy IdentityRegistry with multisig owner address (NOT deployer EOA)
- [ ] Deploy ReputationRegistry with multisig owner and IdentityRegistry address
- [ ] Deploy ValidationRegistry with multisig owner and IdentityRegistry address
- [ ] Wait for all deployment transactions to finalize (check `ACCEPTED_ON_L2` status)
- [ ] Record all three contract addresses in deployment log and version control (`deployed_addresses_mainnet.json`)

**6. Post-Deployment Verification**
- [ ] Verify IdentityRegistry owner: `get_owner()` returns multisig address
- [ ] Verify ReputationRegistry owner and identity registry reference: `get_owner()`, `get_identity_registry()`
- [ ] Verify ValidationRegistry owner and identity registry reference: `get_owner()`, `get_identity_registry()`
- [ ] Test agent registration: mint agent NFT via `register_with_token_uri`
- [ ] Test metadata write: `set_metadata(agent_id, "test", "value")`
- [ ] Test feedback write: `give_feedback(agent_id, ...)`
- [ ] Test validation request: `validation_request(validator, agent_id, ...)`
- [ ] Verify no revert on read paths: `read_feedback`, `get_summary`, `get_validation_status`

**7. Documentation and Handoff**
- [ ] Publish contract addresses to public registry (website, GitHub README, etc.)
- [ ] Share multisig owner access with designated signers
- [ ] Document multisig signing procedure (Braavos multisig, Argent multisig, etc.)
- [ ] Store deployment artifact (class hashes, addresses, deployment timestamp) in secure location
- [ ] Update monitoring dashboards with new contract addresses

### Key Management and Rotation

**8. Owner Key Security**
- [ ] Owner private keys stored in hardware wallet or secure vault (never in plaintext)
- [ ] Multisig quorum documented and tested (e.g., 2-of-3 approvals required)
- [ ] Signer list documented with contact info and backup signers identified
- [ ] Regular signer availability check (quarterly or semi-annual)

**9. Owner Transfer (Emergency or Planned)**
- [ ] Generate new multisig owner address
- [ ] Verify new multisig quorum and signer list
- [ ] Execute `transfer_ownership(new_owner)` on IdentityRegistry via existing multisig
- [ ] Execute `transfer_ownership(new_owner)` on ReputationRegistry via existing multisig
- [ ] Execute `transfer_ownership(new_owner)` on ValidationRegistry via existing multisig
- [ ] Wait for all transactions to finalize
- [ ] Verify new owner via `get_owner()` on all three contracts
- [ ] Revoke access for old multisig signers
- [ ] Update documentation with new owner address

**10. Agent Wallet Verification (User-Facing)**
- [ ] Document `set_agent_wallet` signature scheme for users (SNIP-6 domain separator, message structure, nonce)
- [ ] Provide example code for generating signature (starknet.js, starknet-py, etc.)
- [ ] Test signature verification end-to-end with multiple wallet types (Argent, Braavos, etc.)
- [ ] Document that wallet is cleared on NFT transfer (users must re-verify after transfer)

### Upgrade Procedures

**11. Contract Upgrade (Class Hash Replacement)**
- [ ] Build new contract version: `scarb build`
- [ ] Run unit tests on new version: `scarb test` (all tests must pass)
- [ ] Deploy to testnet and run E2E tests (all tests must pass)
- [ ] Declare new class hash on mainnet
- [ ] Audit new class hash bytecode (internal or third-party review)
- [ ] Prepare upgrade proposal for multisig signers (include class hash, upgrade rationale, audit report)
- [ ] Obtain multisig quorum approval
- [ ] Execute `upgrade(new_class_hash)` on target registry via multisig
- [ ] Wait for transaction to finalize
- [ ] Verify `Upgraded` event emitted with correct class hash
- [ ] Smoke test upgraded contract (register agent, give feedback, etc.)
- [ ] Monitor for unexpected behavior or reverts (24-48 hour window)

**12. Rollback Procedure**
- [ ] Identify previous class hash from deployment log
- [ ] Verify previous class hash is still declared on-chain
- [ ] Execute `upgrade(previous_class_hash)` via multisig
- [ ] Verify rollback via `Upgraded` event
- [ ] Smoke test rolled-back contract

### Monitoring and Alerting

**13. On-Chain Event Monitoring**
- [ ] Monitor `AgentRegistered` events (IdentityRegistry) for registration activity
- [ ] Monitor `Upgraded` events (all three registries) for unauthorized or unexpected upgrades
- [ ] Monitor `OwnershipTransferred` events for unauthorized ownership changes
- [ ] Monitor `AgentWalletSet` and `AgentWalletUnset` events for wallet verification activity
- [ ] Monitor `FeedbackGiven` and `FeedbackRevoked` events (ReputationRegistry) for abuse patterns
- [ ] Monitor `ValidationRequested` and `ValidationResponded` events (ValidationRegistry) for validator activity

**14. Metrics and Dashboards**
- [ ] Total agents registered (IdentityRegistry: `total_agents()`)
- [ ] Total feedback entries (ReputationRegistry: count `FeedbackGiven` events)
- [ ] Total validation requests (ValidationRegistry: count `ValidationRequested` events)
- [ ] Owner address correctness (all three registries: `get_owner()`)
- [ ] Identity registry reference correctness (ReputationRegistry and ValidationRegistry: `get_identity_registry()`)
- [ ] Gas usage trends (identify expensive operations)

**15. Alerting Thresholds**
- [ ] Alert on `Upgraded` event (always notify on upgrades)
- [ ] Alert on `OwnershipTransferred` event (always notify on ownership changes)
- [ ] Alert on abnormal feedback volume (e.g., >100 feedback entries per hour for a single agent)
- [ ] Alert on abnormal validation volume (e.g., >50 validation responses per hour)
- [ ] Alert on contract paused or disabled (if applicable)

### Incident Response

**16. Unauthorized Upgrade Detected**
- [ ] Immediately verify `Upgraded` event details (class hash, timestamp, caller)
- [ ] Check if multisig signers approved the upgrade (review multisig transaction log)
- [ ] If unauthorized: execute emergency rollback to previous class hash via multisig
- [ ] If multisig compromised: prepare owner transfer to new multisig and execute rollback
- [ ] Notify users via official channels (Twitter, Discord, website banner)
- [ ] Conduct post-mortem and publish incident report

**17. Unauthorized Ownership Transfer Detected**
- [ ] Immediately verify `OwnershipTransferred` event details (new owner, timestamp, caller)
- [ ] Check if multisig signers approved the transfer (review multisig transaction log)
- [ ] If multisig compromised: coordinate with new owner (if friendly) or prepare social recovery
- [ ] Notify users and recommend pausing agent registration and feedback until resolution
- [ ] Conduct post-mortem and publish incident report

**18. Spam or Abuse Detected**
- [ ] Identify abusive agent_id or client address
- [ ] Review feedback entries: `read_all_feedback(agent_id, ...)`
- [ ] Review validation requests: `get_agent_validations(agent_id, ...)`
- [ ] Document abuse pattern (evidence: transaction hashes, addresses, timestamps)
- [ ] Publish abuse report (if applicable)
- [ ] Note: ERC-8004 has no built-in ban/block mechanism; abuse mitigation is application-layer responsibility

**19. Critical Bug or Vulnerability Discovered**
- [ ] Assess impact: which registry is affected, which functions are vulnerable
- [ ] Determine if vulnerability is exploitable in the wild (public disclosure risk)
- [ ] Prepare patched contract version and audit
- [ ] Declare new class hash on mainnet
- [ ] Coordinate upgrade with multisig signers (expedited approval if critical)
- [ ] Execute upgrade: `upgrade(new_class_hash)`
- [ ] Notify users via official channels
- [ ] Publish post-mortem after mitigation complete

### Mainnet Migration (Registry Replacement)

**20. Migrating to New IdentityRegistry Instance**

Because the `identity_registry` reference in ReputationRegistry and ValidationRegistry is **immutable after construction**, migrating to a new IdentityRegistry requires deploying new instances of ReputationRegistry and ValidationRegistry. This is an accepted design choice: it prevents a compromised owner from silently redirecting authorization checks.

- [ ] Deploy new IdentityRegistry instance
- [ ] Deploy new ReputationRegistry instance (with new IdentityRegistry address)
- [ ] Deploy new ValidationRegistry instance (with new IdentityRegistry address)
- [ ] Notify users of new contract addresses
- [ ] Provide migration guide for re-registering agents and linking historical feedback/validation data
- [ ] Archive old contract addresses and mark as deprecated
- [ ] Monitor both old and new instances during transition period (e.g., 30 days)
- [ ] After transition period, stop monitoring old instances (but preserve historical data)

## License

CC0 - Public Domain

## Acknowledgments

Based on the [ERC-8004 Solidity reference implementation](https://github.com/erc-8004/erc-8004-contracts).
