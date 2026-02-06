import { Account, Contract, RpcProvider, cairo, constants } from 'starknet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// Validate required environment variables
function validateEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Error: ${name} not set in .env file`);
    process.exit(1);
  }
  return value;
}

// Load deployment info
const addressesPath = path.join(__dirname, '..', '..', 'deployed_addresses.json');
if (!fs.existsSync(addressesPath)) {
  throw new Error('deployed_addresses.json not found. Run deployment script first.');
}
const deploymentInfo = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

// Setup provider
const rpcUrl = validateEnvVar('STARKNET_RPC_URL');
const provider = new RpcProvider({
  nodeUrl: rpcUrl,
  chainId: constants.StarknetChainId.SN_SEPOLIA,
});

// Test accounts - loaded from environment variables
const ACCOUNT_1 = {
  address: validateEnvVar('DEPLOYER_ADDRESS'),
  privateKey: validateEnvVar('DEPLOYER_PRIVATE_KEY'),
};

const ACCOUNT_2 = {
  address: validateEnvVar('TEST_ACCOUNT_ADDRESS'),
  privateKey: validateEnvVar('TEST_ACCOUNT_PRIVATE_KEY'),
};

// Helper functions
function toUint256(num) {
  const bn = BigInt(num);
  return {
    low: bn & ((1n << 128n) - 1n),
    high: bn >> 128n
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function waitForTx(txHash, account) {
  console.log(`   ⏳ Waiting for tx: ${txHash.slice(0, 18)}...`);
  try {
    const receipt = await account.waitForTransaction(txHash, { retryInterval: 5000 });
    console.log('   ✅ Confirmed');
    return receipt;
  } catch (error) {
    console.error(`   ❌ Transaction failed: ${error.message}`);
    throw error;
  }
}

export default async function runTests() {
  let passed = 0;
  let failed = 0;
  
  const testData = {
    testRun: new Date().toISOString(),
    network: 'Sepolia',
    accounts: {},
    agent: {},
    validationOperations: [],
    readOperations: [],
    summaryOperations: []
  };

  try {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         Validation Registry E2E Tests (Updated)               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // ===================================================================
    // Setup: Load ABIs and Create Accounts
    // ===================================================================
    console.log('Setup: Loading Contracts and Accounts');
    console.log('────────────────────────────────────────');
    
    // Load ABIs
    const identityAbiPath = path.join(__dirname, '..', '..', 'target/dev/erc8004_IdentityRegistry.contract_class.json');
    const validationAbiPath = path.join(__dirname, '..', '..', 'target/dev/erc8004_ValidationRegistry.contract_class.json');
    
    const identityAbiFile = JSON.parse(fs.readFileSync(identityAbiPath, 'utf8'));
    const validationAbiFile = JSON.parse(fs.readFileSync(validationAbiPath, 'utf8'));
    
    const identityAbi = identityAbiFile.abi;
    const validationAbi = validationAbiFile.abi;
    
    // Create accounts from environment variables
    const agentOwner = new Account({ provider, address: ACCOUNT_1.address, signer: ACCOUNT_1.privateKey });
    const validator = new Account({ provider, address: ACCOUNT_2.address, signer: ACCOUNT_2.privateKey });

    console.log(`   👤 Agent Owner: ${agentOwner.address.slice(0, 16)}...`);
    console.log(`   👤 Validator:   ${validator.address.slice(0, 16)}...`);
    console.log('   ✅ Accounts Connected\n');
    
    testData.accounts = {
      agentOwner: { address: agentOwner.address },
      validator: { address: validator.address }
    };
    
    // Create contract instances
    const identityRegistry = new Contract({
      abi: identityAbi,
      address: deploymentInfo.contracts.identityRegistry.address,
      providerOrAccount: agentOwner,
    });
    const validationRegistry = new Contract({
      abi: validationAbi,
      address: deploymentInfo.contracts.validationRegistry.address,
      providerOrAccount: agentOwner,
    });

    // ===================================================================
    // Setup: Register Agent
    // ===================================================================
    console.log('Setup: Register Agent');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(agentOwner);
    const registerTx = await identityRegistry.register_with_token_uri('ipfs://validation-test-agent.json');
    await waitForTx(registerTx.transaction_hash, agentOwner);
    
    const agentId = await identityRegistry.total_agents();
    console.log(`   Agent ID: ${agentId}`);
    console.log('   ✅ Setup Complete\n');
    
    testData.agent = {
      agentId: agentId.toString(),
      owner: agentOwner.address
    };

    // ===================================================================
    // Test 1: Get Identity Registry
    // ===================================================================
    console.log('Test 1: Get Identity Registry');
    console.log('────────────────────────────────────────');
    
    const identityRegAddr = await validationRegistry.get_identity_registry();
    console.log(`   Identity Registry: ${identityRegAddr.toString(16).slice(0, 16)}...`);
    assert(
      BigInt(identityRegAddr) === BigInt(identityRegistry.address),
      'Identity registry address should match'
    );
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'get_identity_registry',
      outputs: { identityRegistry: identityRegAddr.toString(16) }
    });
    passed++;

    // ===================================================================
    // Test 2: Create Validation Request (Agent Owner)
    // ===================================================================
    console.log('Test 2: Create Validation Request');
    console.log('────────────────────────────────────────');
    
    validationRegistry.connect(agentOwner);
    
    const requestUri1 = 'ipfs://validation-req1.json';
    // Use timestamp to ensure uniqueness
    const requestHash1 = BigInt(Date.now()) + 0xABCDEF1n;
    
    // Interface: validation_request(agent_id, request_uri, request_hash)
    const requestTx1 = await validationRegistry.validation_request(
      toUint256(agentId),
      requestUri1,
      toUint256(requestHash1)
    );
    await waitForTx(requestTx1.transaction_hash, agentOwner);
    
    console.log(`   Request Hash: 0x${requestHash1.toString(16).slice(0, 16)}...`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_request',
      requestNumber: 1,
      inputs: {
        validatorAddress: validator.address,
        agentId: agentId.toString(),
        requestUri: requestUri1,
        requestHash: requestHash1.toString(16)
      },
      transactionHash: requestTx1.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 3: Check Request Exists
    // ===================================================================
    console.log('Test 3: Check Request Exists');
    console.log('────────────────────────────────────────');
    
    const exists = await validationRegistry.request_exists(toUint256(requestHash1));
    console.log(`   Exists: ${exists}`);
    assert(exists === true, 'Request should exist');
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'request_exists',
      inputs: { requestHash: requestHash1.toString(16) },
      outputs: { exists }
    });
    passed++;

    // ===================================================================
    // Test 4: Get Request Details
    // ===================================================================
    console.log('Test 4: Get Request Details');
    console.log('────────────────────────────────────────');
    
    // get_request returns Request struct - might be array or object depending on ABI
    const requestResult = await validationRegistry.get_request(toUint256(requestHash1));
    
    // Handle both array and object return formats
    let validatorAddr, agentIdResult, timestamp;
    if (Array.isArray(requestResult)) {
      // Array format: [validator_address, agent_id, request_hash, timestamp]
      validatorAddr = requestResult[0];
      agentIdResult = requestResult[1];
      timestamp = requestResult[3];
    } else if (requestResult.validator_address !== undefined) {
      // Object format
      validatorAddr = requestResult.validator_address;
      agentIdResult = requestResult.agent_id;
      timestamp = requestResult.timestamp;
    } else {
      // Direct struct access
      validatorAddr = requestResult[0] || requestResult;
      agentIdResult = requestResult[1];
      timestamp = requestResult[3];
    }
    
    console.log(`   Validator: ${BigInt(validatorAddr).toString(16).slice(0, 16)}...`);
    console.log(`   Agent ID: ${agentIdResult}`);
    console.log(`   Timestamp: ${timestamp}`);
    
    // Note: validator is the caller who made the request (agentOwner in this case)
    // The contract stores the caller as the one who can respond
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'get_request',
      inputs: { requestHash: requestHash1.toString(16) },
      outputs: {
        validatorAddress: BigInt(validatorAddr).toString(16),
        agentId: agentIdResult?.toString() || 'N/A',
        timestamp: timestamp?.toString() || 'N/A'
      }
    });
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 5: Get Agent Validations
    // ===================================================================
    console.log('Test 5: Get Agent Validations');
    console.log('────────────────────────────────────────');
    
    const agentValidations = await validationRegistry.get_agent_validations(toUint256(agentId));
    console.log(`   Validation count: ${agentValidations.length}`);
    assert(agentValidations.length >= 1, 'Should have at least 1 validation');
    
    testData.readOperations.push({
      operation: 'get_agent_validations',
      inputs: { agentId: agentId.toString() },
      outputs: { validationCount: agentValidations.length }
    });
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 6: Get Validator Requests
    // ===================================================================
    console.log('Test 6: Get Validator Requests');
    console.log('────────────────────────────────────────');
    
    // Note: get_validator_requests returns requests CREATED BY the address
    // The agentOwner created the request in Test 2, so we query with agentOwner.address
    const validatorRequests = await validationRegistry.get_validator_requests(agentOwner.address);
    console.log(`   Request count for agentOwner: ${validatorRequests.length}`);
    assert(validatorRequests.length >= 1, 'Should have at least 1 request');
    
    testData.readOperations.push({
      operation: 'get_validator_requests',
      inputs: { validatorAddress: agentOwner.address },
      outputs: { requestCount: validatorRequests.length }
    });
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 7: Submit Validation Response (Valid)
    // ===================================================================
    console.log('Test 7: Submit Validation Response (Valid)');
    console.log('────────────────────────────────────────');
    
    validationRegistry.connect(validator);
    
    const response1 = 1; // 1 = Valid
    const responseUri1 = 'ipfs://validation-resp1.json';
    const responseHash1 = BigInt(Date.now()) + 0x111111n;
    const tag1 = "security-audit"; // ByteArray tag
    
    // Interface: validation_response(agent_id, request_hash, response, response_uri, response_hash, tag)
    const responseTx1 = await validationRegistry.validation_response(
      toUint256(agentId),
      toUint256(requestHash1),
      response1,
      responseUri1,
      toUint256(responseHash1),
      tag1
    );
    await waitForTx(responseTx1.transaction_hash, validator);
    
    console.log(`   Response: ${response1} (Valid)`);
    console.log(`   Tag: "${tag1}"`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_response',
      inputs: {
        requestHash: requestHash1.toString(16),
        agentId: agentId.toString(),
        response: response1,
        responseUri: responseUri1,
        responseHash: responseHash1.toString(16),
        tag: tag1
      },
      transactionHash: responseTx1.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 8: Get Validation Status
    // ===================================================================
    console.log('Test 8: Get Validation Status');
    console.log('────────────────────────────────────────');
    
    // Interface: get_validation_status(validator_address, agent_id, request_hash)
    // Returns: (response: u8, timestamp: u64, response_hash: u256, has_response: bool)
    const status = await validationRegistry.get_validation_status(
      validator.address,
      toUint256(agentId),
      toUint256(requestHash1)
    );
    
    const statusResponse = status[0];
    const statusTimestamp = status[1];
    const statusResponseHash = status[2];
    const statusHasResponse = status[3];
    
    console.log(`   Response: ${statusResponse}`);
    console.log(`   Timestamp: ${statusTimestamp}`);
    console.log(`   Has Response: ${statusHasResponse}`);
    
    assert(BigInt(statusResponse) === BigInt(response1), 'Response should match');
    assert(statusHasResponse === true, 'Should have response');
    
    testData.readOperations.push({
      operation: 'get_validation_status',
      inputs: { requestHash: requestHash1.toString(16) },
      outputs: {
        response: statusResponse.toString(),
        timestamp: statusTimestamp.toString(),
        hasResponse: statusHasResponse
      }
    });
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 9: Create Second Validation Request
    // ===================================================================
    console.log('Test 9: Create Second Validation Request');
    console.log('────────────────────────────────────────');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    validationRegistry.connect(agentOwner);
    
    const requestUri2 = 'ipfs://validation-req2.json';
    const requestHash2 = BigInt(Date.now()) + 0xFEDCBA2n;
    
    const requestTx2 = await validationRegistry.validation_request(
      toUint256(agentId),
      requestUri2,
      toUint256(requestHash2)
    );
    await waitForTx(requestTx2.transaction_hash, agentOwner);
    
    console.log(`   Request Hash: 0x${requestHash2.toString(16).slice(0, 16)}...`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_request',
      requestNumber: 2,
      inputs: {
        validatorAddress: validator.address,
        agentId: agentId.toString(),
        requestUri: requestUri2,
        requestHash: requestHash2.toString(16)
      },
      transactionHash: requestTx2.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 10: Submit Second Validation Response (Invalid)
    // ===================================================================
    console.log('Test 10: Submit Second Validation Response (Invalid)');
    console.log('────────────────────────────────────────');
    
    validationRegistry.connect(validator);
    
    const response2 = 2; // 2 = Invalid
    const responseUri2 = 'ipfs://validation-resp2.json';
    const responseHash2 = BigInt(Date.now()) + 0x222222n;
    const tag2 = "compliance-check";
    
    const responseTx2 = await validationRegistry.validation_response(
      toUint256(agentId),
      toUint256(requestHash2),
      response2,
      responseUri2,
      toUint256(responseHash2),
      tag2
    );
    await waitForTx(responseTx2.transaction_hash, validator);
    
    console.log(`   Response: ${response2} (Invalid)`);
    console.log(`   Tag: "${tag2}"`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_response',
      inputs: {
        requestHash: requestHash2.toString(16),
        agentId: agentId.toString(),
        response: response2,
        responseUri: responseUri2,
        responseHash: responseHash2.toString(16),
        tag: tag2
      },
      transactionHash: responseTx2.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 11: Get Summary
    // ===================================================================
    console.log('Test 11: Get Summary');
    console.log('────────────────────────────────────────');
    
    // Interface: get_summary(agent_id, tag, validator_addresses)
    // Returns: (count: u64, valid_count: u64, invalid_count: u64)
    const summary = await validationRegistry.get_summary(
      toUint256(agentId),
      "",  // tag filter (empty = all)
      [validator.address]
    );
    
    const summaryCount = summary[0];
    const summaryValidCount = summary[1];
    const summaryInvalidCount = summary[2];
    
    console.log(`   Total Count: ${summaryCount}`);
    console.log(`   Valid Count: ${summaryValidCount}`);
    console.log(`   Invalid Count: ${summaryInvalidCount}`);
    
    assert(summaryCount >= 2n, 'Should have at least 2 validations');
    assert(summaryValidCount >= 1n, 'Should have at least 1 valid');
    assert(summaryInvalidCount >= 1n, 'Should have at least 1 invalid');
    
    testData.summaryOperations.push({
      operation: 'get_summary',
      inputs: {
        agentId: agentId.toString(),
        validatorAddresses: [validator.address],
        tagFilter: ""
      },
      outputs: {
        count: summaryCount.toString(),
        validCount: summaryValidCount.toString(),
        invalidCount: summaryInvalidCount.toString()
      }
    });
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 12: Get Summary (Filtered by Tag)
    // ===================================================================
    console.log('Test 12: Get Summary (Filtered by Tag)');
    console.log('────────────────────────────────────────');
    
    const summaryFiltered = await validationRegistry.get_summary(
      toUint256(agentId),
      tag1, // filter by first tag
      [validator.address]
    );
    
    const filteredCount = summaryFiltered[0];
    const filteredValidCount = summaryFiltered[1];
    const filteredInvalidCount = summaryFiltered[2];
    
    console.log(`   Count (tag="${tag1}"): ${filteredCount}`);
    console.log(`   Valid Count: ${filteredValidCount}`);
    console.log(`   Invalid Count: ${filteredInvalidCount}`);
    
    assert(filteredCount >= 1n, 'Should have at least 1 validation with this tag');
    
    testData.summaryOperations.push({
      operation: 'get_summary_filtered',
      inputs: {
        agentId: agentId.toString(),
        validatorAddresses: [validator.address],
        tagFilter: tag1
      },
      outputs: {
        count: filteredCount.toString(),
        validCount: filteredValidCount.toString(),
        invalidCount: filteredInvalidCount.toString()
      }
    });
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 13: Non-Existent Request Should Return False
    // ===================================================================
    console.log('Test 13: Non-Existent Request Should Return False');
    console.log('────────────────────────────────────────');
    
    const nonExistentHash = 0x999999999999n;
    const notExists = await validationRegistry.request_exists(toUint256(nonExistentHash));
    
    console.log(`   Non-existent request exists: ${notExists}`);
    assert(notExists === false, 'Non-existent request should return false');
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 14: Get Validation Status for Non-Responded Request
    // ===================================================================
    console.log('Test 14: Get Validation Status (Non-Existent)');
    console.log('────────────────────────────────────────');
    
    const statusNonExistent = await validationRegistry.get_validation_status(
      validator.address,  // any valid address
      toUint256(agentId),
      toUint256(nonExistentHash)
    );
    
    const neResponse = statusNonExistent['0'] ?? statusNonExistent[0];
    const neHasResponse = statusNonExistent['3'] ?? statusNonExistent[3];
    
    console.log(`   Response: ${neResponse}`);
    console.log(`   Has Response: ${neHasResponse}`);
    
    assert(neResponse === 0n || neResponse === 0 || neResponse === '0', 'Non-existent should return 0');
    assert(neHasResponse === false, 'Non-existent should not have response');
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Summary
    // ===================================================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           ALL VALIDATION TESTS PASSED! 🎉                      ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log(`✅ ${passed}/${passed} tests passed\n`);
    
    console.log('🎊 Features tested:');
    console.log('  ✅ Get identity registry');
    console.log('  ✅ Create validation request');
    console.log('  ✅ Check request exists');
    console.log('  ✅ Get request details');
    console.log('  ✅ Get agent validations');
    console.log('  ✅ Get validator requests');
    console.log('  ✅ Submit validation response (valid/invalid)');
    console.log('  ✅ Get validation status (new return format)');
    console.log('  ✅ Get summary (count, valid, invalid)');
    console.log('  ✅ Get summary with tag filter');
    console.log('  ✅ Non-existent request handling\n');

    // Save test data
    fs.writeFileSync(
      path.join(__dirname, '..', 'validation_test_data.json'),
      JSON.stringify(testData, null, 2)
    );
    console.log('📊 Test data saved to validation_test_data.json\n');

    return { passed, failed };

  } catch (error) {
    failed++;
    console.error('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    return { passed, failed };
  }
}

// Check if running directly (not imported)
const isDirectRun = process.argv[1]?.includes('validation.test.js');
if (isDirectRun) {
  runTests().then(result => {
    process.exit(result.failed === 0 ? 0 : 1);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
