# ERC-8004: Trustless Agents Registry

A Cairo implementation of the [ERC-8004 Trustless Agent Registry](https://eips.ethereum.org/EIPS/eip-8004) standard on Starknet. This project provides a complete on-chain registry system for autonomous AI agents with identity management, reputation tracking, and validation mechanisms.

> **Note**: This is a transpilation of the original [ERC-8004 Solidity reference implementation](https://github.com/ChaosChain/trustless-agents-erc-ri) to Cairo for the Starknet ecosystem. Special credits to the original ERC-8004 authors and the ChaosChain team for the standard specification and Solidity contracts.

## 📋 Table of Contents

- [What is ERC-8004?](#what-is-erc-8004)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Building the Contracts](#building-the-contracts)
- [Testing](#testing)
- [Deployment](#deployment)
- [E2E Testing on Sepolia](#e2e-testing-on-sepolia)
- [Project Structure](#project-structure)
- [Additional Resources](#additional-resources)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)

## 🤖 What is ERC-8004?

ERC-8004 is a standard for creating trustless, on-chain registries for autonomous AI agents. It enables:

- **Identity Management**: Agents are registered as non-fungible tokens (ERC-721/ERC-5114 compatible)
- **Reputation System**: Clients can provide feedback on agent performance with cryptographic authorization
- **Validation Framework**: Third-party validators can assess and verify agent capabilities
- **Decentralized Trust**: All interactions are recorded on-chain, creating transparent reputation scores

This implementation brings the ERC-8004 standard to Starknet, leveraging Cairo's efficiency and Starknet's account abstraction for enhanced security.

## ✨ Features

### Identity Registry
- **ERC-721 Compatible**: Each agent is a unique NFT
- **Metadata Storage**: Flexible key-value metadata for agent configuration
- **Token URIs**: IPFS/HTTP links to agent specifications
- **Transfer Support**: Agents can be transferred between accounts

### Reputation Registry
- **Cryptographic Authorization**: Client feedback requires agent owner signatures
- **Revocable Feedback**: Clients can revoke their submissions
- **Response System**: Agents can respond to feedback
- **Advanced Querying**: Filter by tags, exclude revoked feedback, calculate summaries
- **Signature Verification**: Uses Starknet account abstraction for secure authorization

### Validation Registry
- **Request/Response Model**: Agent owners request validation from validators
- **Binary and Spectrum Scores**: Support for approve/reject or nuanced 0-100 ratings
- **Tag System**: Categorize validations by type
- **Summary Statistics**: Aggregated validation scores per agent

## 🏗️ Architecture

The project consists of three main contracts:

1. **IdentityRegistry** (`src/identity_registry.cairo`)
   - ERC-721 NFT for agent identities
   - Metadata storage with ByteArray keys
   - Reentrancy protection

2. **ReputationRegistry** (`src/reputation_registry.cairo`)
   - Client feedback with signature verification
   - Feedback authorization using Poseidon hashing
   - Response tracking from multiple responders

3. **ValidationRegistry** (`src/validation_registry.cairo`)
   - Validation request/response workflow
   - Poseidon-based request hash generation
   - Summary statistics with tag filtering

## 📦 Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| **Scarb** | `2.12.1` | Cairo package manager and build tool |
| **Cairo** | `2.12.1` | Cairo language compiler |
| **Snforge** | `0.43.1` | Testing framework for Cairo contracts |
| **Node.js** | `≥18.0.0` | JavaScript runtime for E2E tests |
| **npm** | `≥9.0.0` | Node package manager |

### Installation Links

- **Scarb & Cairo**: https://docs.swmansion.com/scarb/download.html
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://docs.swmansion.com/scarb/install.sh | sh
  ```

- **Snforge**: Installed via Scarb
  ```bash
  snforgup
  ```

- **Node.js**: https://nodejs.org/ (LTS version recommended)

### Starknet Testnet Setup

For E2E testing on Sepolia, you'll need:
- A Openzeppelin Starknet wallet 
- Sepolia testnet STRK tokens (from faucet: https://starknet-faucet.vercel.app/)
- An RPC endpoint (Alchemy, Infura, or public RPC)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Akashneelesh/erc8004.git
   cd erc8004
   ```

2. **Install Node.js dependencies for E2E tests**
   ```bash
   cd e2e-tests
   npm install
   cd ..
   ```

## 🔨 Building the Contracts

### Build all contracts
```bash
scarb build
```

This compiles all contracts and generates:
- Sierra files (`.sierra.json`) in `target/dev/`
- CASM files (`.casm.json`) in `target/dev/`
- Contract class files in `target/dev/`

### Build output
After building, you'll see:
```
target/dev/
├── erc8004_IdentityRegistry.contract_class.json
├── erc8004_ReputationRegistry.contract_class.json
├── erc8004_ValidationRegistry.contract_class.json
├── erc8004_OZAccount.contract_class.json (mock account for testing)
└── ... (other artifacts)
```

## 🧪 Testing

### Unit Tests (Local)

Run all Cairo unit tests using Snforge:

```bash
# Run all tests
scarb test

# Run tests with detailed output
snforge test

# Run specific test
snforge test test_register_with_token_uri

# Run tests for a specific file
snforge test --package erc8004 test_identity_registry
```

**Test Coverage**:
- ✅ 74 unit tests across all three registries
- ✅ Identity Registry: 24 tests
- ✅ Reputation Registry: 26 tests
- ✅ Validation Registry: 24 tests

### Test Results
```bash
Tests: 74 passed, 0 failed, 0 skipped
```

## 🚀 Deployment

### Deploy to Sepolia Testnet

1. **Configure deployment script**

   Edit `scripts/deploy_sepolia.sh` with your credentials:
   ```bash
   # Set your RPC URL
   RPC_URL="https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_9/YOUR_API_KEY"
   
   # Set your account details
   ACCOUNT_ADDRESS="0xYourAccountAddress"
   PRIVATE_KEY="0xYourPrivateKey"
   ```

2. **Make script executable**
   ```bash
   chmod +x scripts/deploy_sepolia.sh
   ```

3. **Run deployment**
   ```bash
   ./scripts/deploy_sepolia.sh
   ```

4. **Deployment output**
   
   The script will:
   - Declare all contract classes
   - Deploy IdentityRegistry
   - Deploy ReputationRegistry (with IdentityRegistry address)
   - Deploy ValidationRegistry (with IdentityRegistry address)
   - Save addresses to `deployed_addresses.json`

   Example output:
   ```json
   {
     "network": "sepolia",
     "rpcUrl": "https://starknet-sepolia.g.alchemy.com/...",
     "deployedAt": "2025-10-28T12:00:00.000Z",
     "contracts": {
       "identityRegistry": {
         "address": "0x...",
         "classHash": "0x...",
         "txHash": "0x..."
       },
       "reputationRegistry": { ... },
       "validationRegistry": { ... }
     }
   }
   ```

## 🌐 E2E Testing on Sepolia

### Prerequisites

Before running E2E tests, ensure:

1. ✅ Contracts are built: `scarb build`
2. ✅ Contracts are deployed to Sepolia: `./scripts/deploy_sepolia.sh`
3. ✅ `deployed_addresses.json` exists in the root directory
4. ✅ Test accounts have sufficient STRK balance (>0.01 STRK each)
5. ✅ Node dependencies installed: `cd e2e-tests && npm install`

### Run All E2E Tests

```bash
cd e2e-tests
npm test
```

This runs all three test suites sequentially:
- **Identity Registry**: 13 tests (agent registration, metadata, transfers)
- **Reputation Registry**: 18 tests (feedback, signatures, responses)
- **Validation Registry**: 16 tests (validation requests/responses, summaries)

**Expected Output**:
```
═══════════════════════════════════════════════════════════════
                    FINAL RESULTS
═══════════════════════════════════════════════════════════════

✅ Passed: 47
❌ Failed: 0

🎉 ALL TESTS PASSED! Production ready for deployment.
```

### Run Individual Test Suites

```bash
# Test Identity Registry only
npm run test:identity

# Test Reputation Registry only
npm run test:reputation

# Test Validation Registry only
npm run test:validation
```

### Utility Scripts

```bash
# Check account balances on Sepolia
node check-balance.js

# View deployed account details
cat oz_reputation_accounts.json
```

### E2E Test Features

Each test suite:
- ✅ Uses real OpenZeppelin accounts on Sepolia
- ✅ Performs actual transactions with signature verification
- ✅ Validates contract state after each operation
- ✅ Tests both success and failure cases
- ✅ Logs comprehensive test data to JSON files

**Generated Test Data**:
- `reputation.json` - Detailed feedback operations and signatures
- `validation.json` - Validation requests and responses
- `oz_reputation_accounts.json` - Test account addresses and keys

### E2E Test Scenarios

**Identity Registry Tests**:
1. Register agent with token URI
2. Verify agent ownership and metadata
3. Set and update metadata
4. Test unauthorized access (should fail)
5. Approve and transfer agent NFT
6. Register multiple agents

**Reputation Registry Tests**:
1. Create and sign FeedbackAuth
2. Submit feedback with signature verification
3. Read feedback data
4. Get last index and client list
5. Submit multiple feedback entries
6. Read all feedback with filters
7. Calculate summary statistics
8. Append responses from agent
9. Get response counts
10. Revoke feedback
11. Verify revoked feedback filtering

**Validation Registry Tests**:
1. Create validation request
2. Check request existence
3. Get request details
4. Get agent validations
5. Get validator requests
6. Submit validation response (approved/rejected)
7. Get validation status
8. Create multiple validation requests
9. Calculate summary statistics
10. Filter by tags

## 📁 Project Structure

```
erc8004/
├── src/
│   ├── identity_registry.cairo      # ERC-721 agent identity NFTs
│   ├── reputation_registry.cairo    # Client feedback system
│   ├── validation_registry.cairo    # Third-party validation
│   ├── interfaces/                  # Contract interfaces
│   │   ├── identity_registry.cairo
│   │   ├── reputation_registry.cairo
│   │   ├── validation_registry.cairo
│   │   └── account.cairo
│   └── mock/                        # Mock contracts for testing
│       ├── mock_account.cairo       # OpenZeppelin account
│       └── simple_mock_account.cairo # Simple mock for unit tests
├── tests/
│   ├── test_identity_registry.cairo
│   ├── test_reputation_registry.cairo
│   └── test_validation_registry.cairo
├── e2e-tests/
│   ├── tests/
│   │   ├── identity.test.js
│   │   └── validation.test.js
│   ├── test-oz-reputation.js        # Comprehensive reputation tests
│   ├── test-runner.js               # Main E2E test orchestrator
│   ├── setup.js                     # Test utilities
│   └── package.json
├── scripts/
│   └── deploy_sepolia.sh            # Deployment script
├── Scarb.toml                       # Scarb configuration
└── README.md
```

## 📚 Additional Resources

- **ERC-8004 Standard**: https://eips.ethereum.org/EIPS/eip-8004
- **Original Solidity Implementation**: https://github.com/ChaosChain/trustless-agents-erc-ri
- **Starknet Documentation**: https://docs.starknet.io
- **Cairo Book**: https://book.cairo-lang.org
- **OpenZeppelin Cairo**: https://docs.openzeppelin.com/contracts-cairo

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

This Cairo implementation is based on the original ERC-8004 Solidity reference implementation. Special thanks to:

- **[ERC-8004 Authors](https://eips.ethereum.org/EIPS/eip-8004)** - For creating the Trustless Agent Registry standard
- **[ChaosChain Team](https://github.com/ChaosChain/trustless-agents-erc-ri)** - For the original Solidity implementation and comprehensive test suite
- **OpenZeppelin** - For Cairo contract components and security patterns
- **Starkware** - For Cairo language and Starknet infrastructure
- **Foundry/Snforge Team** - For the testing framework

This project aims to bring the ERC-8004 standard to the Starknet ecosystem while maintaining compatibility with the original specification.

---

**Built with ❤️ on Starknet**

*For questions or issues, please open an issue on GitHub.*

