# ERC-8004 E2E Tests

End-to-end tests for the ERC-8004 Trustless Agent contracts on Starknet Sepolia testnet.

## Prerequisites

1. **Node.js** (v18+)
2. **Deployed contracts** on Sepolia testnet
3. **Test accounts** with Sepolia ETH for gas

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure contracts are deployed:
   ```bash
   cd ..
   ./scripts/deploy_sepolia.sh
   ```

3. Verify `deployed_addresses.json` exists in the parent directory with the contract addresses.

## Test Accounts

The tests use two pre-configured Sepolia accounts:

| Account | Role | Address |
|---------|------|---------|
| Account 1 | Agent Owner, Contract Owner | `0x04a6b1f...` |
| Account 2 | Client, Validator, Other User | `0x0065b98...` |

**Important**: Ensure both accounts have sufficient Sepolia ETH for transaction fees.

## Running Tests

### Run All Tests
```bash
npm test
# or
npm run test:all
```

### Run Individual Test Suites

```bash
# Identity Registry tests
npm run test:identity

# Reputation Registry tests
npm run test:reputation

# Validation Registry tests
npm run test:validation
```

## Test Suites

### Identity Registry Tests (`tests/identity.test.js`)
- Agent registration with token URI
- Total agents count
- Agent ownership verification
- Token URI retrieval
- Agent existence check
- Metadata set/get operations
- Unauthorized access checks
- Approve and transfer operations
- Multiple agent registration
- Registration with metadata

### Reputation Registry Tests (`tests/reputation.test.js`)
- Agent registration
- Get identity registry address
- Give feedback (positive values)
- Give feedback (negative values)
- Give feedback with decimals
- Read feedback
- Get clients list
- Get summary (count, value_sum, mode_decimals)
- Append response (by agent owner)
- Revoke feedback
- Read all feedback

### Validation Registry Tests (`tests/validation.test.js`)
- Get identity registry address
- Create validation request
- Check request existence
- Get request details
- Get agent validations
- Get validator requests
- Submit validation response (valid/invalid)
- Get validation status
- Get summary (count, avg_response)
- Get summary with tag filter
- Non-existent request handling

## Test Data Output

After running tests, JSON files are generated with test data:
- `reputation_test_data.json` - Reputation test operations
- `validation_test_data.json` - Validation test operations

## Contract Interface (Updated)

### ReputationRegistry
- `give_feedback(agent_id: u256, value: i128, value_decimals: u8, tag1: ByteArray, tag2: ByteArray, endpoint: ByteArray)`
- `read_feedback(agent_id, client, index) -> (FeedbackCore, tag1, tag2)`
- `get_summary(agent_id, clients, tag1, tag2) -> (count: u64, value_sum: i128, mode_decimals: u8)`

### ValidationRegistry
- `validation_request(validator_address, agent_id: u256, request_uri: ByteArray, request_hash: u256)`
- `validation_response(request_hash: u256, response: u8, response_uri: ByteArray, response_hash: u256, tag: ByteArray)`
- `get_summary(agent_id, validators, tag) -> (count: u64, avg_response: u8)`
- `get_validation_status(request_hash) -> (validator_address, agent_id, response: u8, response_hash: u256, tag, last_update: u64)`

## Troubleshooting

### "deployed_addresses.json not found"
Run the deployment script first:
```bash
cd .. && ./scripts/deploy_sepolia.sh
```

### "ABI not found"
Build the contracts first:
```bash
cd .. && scarb build
```

### Transaction failures
- Check account balances on Sepolia
- Wait for network sync between tests
- The test runner automatically adds delays between test suites

### Nonce errors
Previous test runs may leave stale nonces. Wait 30-60 seconds and retry.
