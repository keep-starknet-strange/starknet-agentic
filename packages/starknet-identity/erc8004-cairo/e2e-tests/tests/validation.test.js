import { hash, ec, cairo, Account, Contract, RpcProvider, constants, json } from 'starknet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load deployment info
const addressesPath = path.join(__dirname, '..', '..', 'deployed_addresses.json');
if (!fs.existsSync(addressesPath)) {
  throw new Error('deployed_addresses.json not found. Run deployment script first.');
}
const deploymentInfo = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

// Setup provider
const rpcUrl = deploymentInfo.rpcUrl;
const provider = new RpcProvider({
  nodeUrl: rpcUrl,
  chainId: constants.StarknetChainId.SN_SEPOLIA,
});

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

// Helper: Wait for transaction
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
  
  // Data collection for validation.json
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
    console.log('║         Validation Registry E2E Tests                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // ===================================================================
    // Setup: Load OZ Account Class Hash and Create Accounts
    // ===================================================================
    console.log('Setup: Loading OpenZeppelin Accounts');
    console.log('────────────────────────────────────────');
    
    // Load ABIs
    const identityAbiPath = path.join(__dirname, '..', '..', 'target/dev/erc8004_IdentityRegistry.contract_class.json');
    const validationAbiPath = path.join(__dirname, '..', '..', 'target/dev/erc8004_ValidationRegistry.contract_class.json');
    
    const identityAbiFile = JSON.parse(fs.readFileSync(identityAbiPath, 'utf8'));
    const validationAbiFile = JSON.parse(fs.readFileSync(validationAbiPath, 'utf8'));
    
    const identityAbi = identityAbiFile.abi;
    const validationAbi = validationAbiFile.abi;
    
    // Load the deployed OZ accounts from previous test
    const ozAccountsPath = path.join(__dirname, '..', 'oz_reputation_accounts.json');
    const ozAccounts = JSON.parse(fs.readFileSync(ozAccountsPath, 'utf8'));
    
    // Agent Owner Account (deployed on Sepolia)
    const agentOwnerPrivateKey = ozAccounts.agentOwnerAccount.privateKey;
    const agentOwnerPublicKey = ozAccounts.agentOwnerAccount.publicKey;
    const agentOwnerAccountAddress = ozAccounts.agentOwnerAccount.address;
    
    // Validator Account (using client account as validator)
    const validatorPrivateKey = ozAccounts.clientAccount.privateKey;
    const validatorPublicKey = ozAccounts.clientAccount.publicKey;
    const validatorAccountAddress = ozAccounts.clientAccount.address;
    
    // Connect to accounts
    const agentOwner = new Account(provider, agentOwnerAccountAddress, agentOwnerPrivateKey);
    const validator = new Account(provider, validatorAccountAddress, validatorPrivateKey);

    console.log(`   👤 Agent Owner: ${agentOwner.address.slice(0, 16)}...`);
    console.log(`   👤 Validator:   ${validator.address.slice(0, 16)}...\n`);
    console.log('   ✅ Accounts Loaded\n');
    
    // Create contract instances
    const identityRegistry = new Contract(
      identityAbi,
      deploymentInfo.contracts.identityRegistry.address,
      agentOwner
    );
    const validationRegistry = new Contract(
      validationAbi,
      deploymentInfo.contracts.validationRegistry.address,
      agentOwner
    );
    
    // Save account info
    testData.accounts = {
      agentOwner: { 
        address: agentOwner.address,
        publicKey: agentOwnerPublicKey,
        privateKey: agentOwnerPrivateKey
      },
      validator: { 
        address: validator.address,
        publicKey: validatorPublicKey,
        privateKey: validatorPrivateKey
      }
    };

    // ===================================================================
    // Setup: Use existing agent or register a new one
    // ===================================================================
    console.log('Setup: Verify/Register Agent');
    console.log('────────────────────────────────────────');
    
    let agentId;
    
    // Check if we have an existing agent ID
    if (ozAccounts.agentId) {
      agentId = BigInt(ozAccounts.agentId);
      console.log(`   Using existing Agent ID: ${agentId}`);
      
      // Verify ownership
      const owner = await identityRegistry.owner_of(toUint256(agentId));
      if (BigInt(owner) !== BigInt(agentOwnerAccountAddress)) {
        throw new Error('Agent owner mismatch');
      }
    } else {
      // Register new agent
      identityRegistry.connect(agentOwner);
      const registerTx = await identityRegistry.register_with_token_uri('ipfs://validation-agent.json');
      await waitForTx(registerTx.transaction_hash, agentOwner);
      
      agentId = await identityRegistry.total_agents();
      console.log(`   Registered new Agent ID: ${agentId}`);
    }
    
    console.log('   ✅ Setup Complete\n');
    
    // Save agent info
    testData.agent = {
      agentId: agentId.toString(),
      owner: agentOwner.address,
      verified: true
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
    
    // Save read operation
    testData.readOperations.push({
      operation: 'get_identity_registry',
      inputs: {},
      outputs: { identityRegistry: identityRegAddr.toString(16) }
    });
    console.log(`📊 READ DATA - get_identity_registry: ${identityRegAddr.toString(16).slice(0, 16)}...`);
    
    passed++;

    // ===================================================================
    // Test 2: Create Validation Request
    // ===================================================================
    console.log('Test 2: Create Validation Request (Agent Owner)');
    console.log('────────────────────────────────────────');
    
    // Wait a moment for account state to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create fresh account instance to clear any cached state
    const freshAgentOwner = new Account(provider, agentOwnerAccountAddress, agentOwnerPrivateKey);
    
    // Reconnect with fresh contract instance
    const validationRegistryForRequest = new Contract(
      validationAbi,
      deploymentInfo.contracts.validationRegistry.address,
      freshAgentOwner
    );
    
    const requestUri1 = 'ipfs://validation-req1.json';
    // Use timestamp to ensure uniqueness
    const requestHashValue1 = BigInt(Date.now()) + 0xABCDEFn;
    
    console.log(`   Request hash will be: 0x${requestHashValue1.toString(16)}`);
    
    const requestTx1 = await validationRegistryForRequest.validation_request(
      validatorAccountAddress,
      toUint256(agentId),
      requestUri1,
      toUint256(requestHashValue1)
    );
    await waitForTx(requestTx1.transaction_hash, freshAgentOwner);
    
    const usedRequestHash1 = requestHashValue1;
    
    console.log(`   Request Hash: ${usedRequestHash1.toString(16).slice(0, 16)}...`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_request',
      requestNumber: 1,
      inputs: {
        validatorAddress: validatorAccountAddress,
        agentId: agentId.toString(),
        requestUri: requestUri1,
        requestHash: requestHashValue1.toString(),
        usedRequestHash: usedRequestHash1.toString(16)
      },
      transactionHash: requestTx1.transaction_hash,
      submittedBy: agentOwnerAccountAddress
    });
    
    passed++;

    // ===================================================================
    // Test 3: Check Request Exists
    // ===================================================================
    console.log('Test 3: Check Request Exists');
    console.log('────────────────────────────────────────');
    
    const exists = await validationRegistry.request_exists(toUint256(usedRequestHash1));
    console.log(`   Exists: ${exists}`);
    assert(exists === true, 'Request should exist');
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'request_exists',
      inputs: { requestHash: usedRequestHash1.toString(16) },
      outputs: { exists }
    });
    console.log(`📊 READ DATA - request_exists: ${exists}`);
    
    passed++;

    // ===================================================================
    // Test 4: Get Request Details
    // ===================================================================
    console.log('Test 4: Get Request Details');
    console.log('────────────────────────────────────────');
    
    const requestDetails = await validationRegistry.get_request(toUint256(usedRequestHash1));
    const reqValidator = requestDetails[0];
    const reqAgentId = requestDetails[1];
    const reqUri = requestDetails[2];
    const reqTimestamp = requestDetails[3];
    
    console.log(`   Validator: ${reqValidator.toString(16).slice(0, 16)}...`);
    console.log(`   Agent ID: ${reqAgentId}`);
    console.log(`   URI: ${reqUri}`);
    console.log(`   Timestamp: ${reqTimestamp}`);
    
    assert(
      BigInt(reqValidator) === BigInt(validatorAccountAddress),
      'Validator should match'
    );
    assert(BigInt(reqAgentId) === BigInt(agentId), 'Agent ID should match');
    assert(reqUri === requestUri1, 'Request URI should match');
    
    testData.readOperations.push({
      operation: 'get_request',
      inputs: { requestHash: usedRequestHash1.toString(16) },
      outputs: {
        validatorAddress: reqValidator.toString(16),
        agentId: reqAgentId.toString(),
        requestUri: reqUri,
        timestamp: reqTimestamp.toString()
      }
    });
    console.log(`📊 READ DATA - get_request: validator=${reqValidator.toString(16).slice(0, 16)}..., agentId=${reqAgentId}, timestamp=${reqTimestamp}`);
    
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
      outputs: { 
        validationCount: agentValidations.length,
        requestHashes: agentValidations.map(h => h.toString(16))
      }
    });
    console.log(`📊 READ DATA - get_agent_validations: count=${agentValidations.length}`);
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 6: Get Validator Requests
    // ===================================================================
    console.log('Test 6: Get Validator Requests');
    console.log('────────────────────────────────────────');
    
    const validatorRequests = await validationRegistry.get_validator_requests(validatorAccountAddress);
    console.log(`   Request count: ${validatorRequests.length}`);
    assert(validatorRequests.length >= 1, 'Should have at least 1 request');
    
    testData.readOperations.push({
      operation: 'get_validator_requests',
      inputs: { validatorAddress: validatorAccountAddress },
      outputs: { 
        requestCount: validatorRequests.length,
        requestHashes: validatorRequests.map(h => h.toString(16))
      }
    });
    console.log(`📊 READ DATA - get_validator_requests: count=${validatorRequests.length}`);
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 7: Submit Validation Response (Approved)
    // ===================================================================
    console.log('Test 7: Submit Validation Response (Approved)');
    console.log('────────────────────────────────────────');
    
    validationRegistry.connect(validator);
    
    const response1 = 1; // Approved
    const responseUri1 = 'ipfs://validation-resp1.json';
    const responseHashValue1 = BigInt(Date.now()) + 0x111111n;
    const tag1 = 0xDEADBEEFn;
    
    const responseTx1 = await validationRegistry.validation_response(
      toUint256(usedRequestHash1),
      response1,
      responseUri1,
      toUint256(responseHashValue1),
      toUint256(tag1)
    );
    await waitForTx(responseTx1.transaction_hash, validator);
    
    console.log(`   Response: ${response1} (Approved)`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_response',
      inputs: {
        requestHash: usedRequestHash1.toString(16),
        response: response1,
        responseUri: responseUri1,
        responseHash: responseHashValue1.toString(),
        tag: tag1.toString()
      },
      transactionHash: responseTx1.transaction_hash,
      submittedBy: validatorAccountAddress
    });
    
    passed++;

    // ===================================================================
    // Test 8: Get Validation Status
    // ===================================================================
    console.log('Test 8: Get Validation Status');
    console.log('────────────────────────────────────────');
    
    const validationStatus = await validationRegistry.get_validation_status(toUint256(usedRequestHash1));
    const statusValidator = validationStatus[0];
    const statusAgentId = validationStatus[1];
    const statusResponse = validationStatus[2];
    const statusTag = validationStatus[3];
    const statusTimestamp = validationStatus[4];
    
    console.log(`   Validator: ${statusValidator.toString(16).slice(0, 16)}...`);
    console.log(`   Agent ID: ${statusAgentId}`);
    console.log(`   Response: ${statusResponse}`);
    console.log(`   Tag: ${statusTag}`);
    console.log(`   Timestamp: ${statusTimestamp}`);
    
    assert(BigInt(statusResponse) === BigInt(response1), 'Response should match');
    assert(BigInt(statusTag) === tag1, 'Tag should match');
    
    testData.readOperations.push({
      operation: 'get_validation_status',
      inputs: { requestHash: usedRequestHash1.toString(16) },
      outputs: {
        validatorAddress: statusValidator.toString(16),
        agentId: statusAgentId.toString(),
        response: statusResponse.toString(),
        tag: statusTag.toString(),
        timestamp: statusTimestamp.toString()
      }
    });
    console.log(`📊 READ DATA - get_validation_status: response=${statusResponse}, tag=${statusTag}, timestamp=${statusTimestamp}`);
    
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
    const requestHashValue2 = BigInt(Date.now()) + 0xFEDCBAn;
    
    const requestTx2 = await validationRegistry.validation_request(
      validatorAccountAddress,
      toUint256(agentId),
      requestUri2,
      toUint256(requestHashValue2)
    );
    await waitForTx(requestTx2.transaction_hash, agentOwner);
    
    const usedRequestHash2 = requestHashValue2;
    
    console.log(`   Request Hash: ${usedRequestHash2.toString(16).slice(0, 16)}...`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_request',
      requestNumber: 2,
      inputs: {
        validatorAddress: validatorAccountAddress,
        agentId: agentId.toString(),
        requestUri: requestUri2,
        requestHash: requestHashValue2.toString(),
        usedRequestHash: usedRequestHash2.toString(16)
      },
      transactionHash: requestTx2.transaction_hash,
      submittedBy: agentOwnerAccountAddress
    });
    
    passed++;

    // ===================================================================
    // Test 10: Submit Second Validation Response (Rejected)
    // ===================================================================
    console.log('Test 10: Submit Second Validation Response (Rejected)');
    console.log('────────────────────────────────────────');
    
    validationRegistry.connect(validator);
    
    const response2 = 2; // Rejected
    const responseUri2 = 'ipfs://validation-resp2.json';
    const responseHashValue2 = BigInt(Date.now()) + 0x222222n;
    const tag2 = 0xCAFEBABEn;
    
    const responseTx2 = await validationRegistry.validation_response(
      toUint256(usedRequestHash2),
      response2,
      responseUri2,
      toUint256(responseHashValue2),
      toUint256(tag2)
    );
    await waitForTx(responseTx2.transaction_hash, validator);
    
    console.log(`   Response: ${response2} (Rejected)`);
    console.log('   ✅ PASSED\n');
    
    testData.validationOperations.push({
      operation: 'validation_response',
      inputs: {
        requestHash: usedRequestHash2.toString(16),
        response: response2,
        responseUri: responseUri2,
        responseHash: responseHashValue2.toString(),
        tag: tag2.toString()
      },
      transactionHash: responseTx2.transaction_hash,
      submittedBy: validatorAccountAddress
    });
    
    passed++;

    // ===================================================================
    // Test 11: Get Summary (All Tags)
    // ===================================================================
    console.log('Test 11: Get Summary (All Tags)');
    console.log('────────────────────────────────────────');
    
    const summary = await validationRegistry.get_summary(
      toUint256(agentId),
      [validatorAccountAddress],
      toUint256(0) // tag filter (0 = all)
    );
    const summaryCount = summary[0];
    const summaryAvg = summary[1];
    
    console.log(`   Count: ${summaryCount}`);
    console.log(`   Average Response: ${summaryAvg}`);
    
    assert(summaryCount >= 2n, 'Should have at least 2 validations');
    
    testData.summaryOperations.push({
      operation: 'get_summary',
      inputs: {
        agentId: agentId.toString(),
        validatorAddresses: [validatorAccountAddress],
        tagFilter: 0
      },
      outputs: {
        count: summaryCount.toString(),
        averageResponse: summaryAvg.toString()
      }
    });
    console.log(`📊 SUMMARY DATA - get_summary: count=${summaryCount}, avgResponse=${summaryAvg}`);
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 12: Get Summary (Filtered by Tag)
    // ===================================================================
    console.log('Test 12: Get Summary (Filtered by Tag)');
    console.log('────────────────────────────────────────');
    
    const summaryFiltered = await validationRegistry.get_summary(
      toUint256(agentId),
      [validatorAccountAddress],
      toUint256(tag1) // filter by first tag
    );
    const filteredCount = summaryFiltered[0];
    const filteredAvg = summaryFiltered[1];
    
    console.log(`   Count (tag=${tag1.toString(16)}): ${filteredCount}`);
    console.log(`   Average Response: ${filteredAvg}`);
    
    assert(filteredCount >= 1n, 'Should have at least 1 validation with this tag');
    
    testData.summaryOperations.push({
      operation: 'get_summary_filtered',
      inputs: {
        agentId: agentId.toString(),
        validatorAddresses: [validatorAccountAddress],
        tagFilter: tag1.toString()
      },
      outputs: {
        count: filteredCount.toString(),
        averageResponse: filteredAvg.toString()
      }
    });
    console.log(`📊 SUMMARY DATA - get_summary (filtered): count=${filteredCount}, avgResponse=${filteredAvg}`);
    
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
    // Test 14: Multiple Validators for Same Agent
    // ===================================================================
    console.log('Test 14: Multiple Validators Summary');
    console.log('────────────────────────────────────────');
    
    // Get summary with both validator and agent owner as validators
    const multiValidatorSummary = await validationRegistry.get_summary(
      toUint256(agentId),
      [validatorAccountAddress, agentOwnerAccountAddress],
      toUint256(0)
    );
    const multiCount = multiValidatorSummary[0];
    const multiAvg = multiValidatorSummary[1];
    
    console.log(`   Total Count: ${multiCount}`);
    console.log(`   Overall Average: ${multiAvg}`);
    
    assert(multiCount >= 2n, 'Should have at least validations from our validator');
    
    testData.summaryOperations.push({
      operation: 'get_summary_multi_validator',
      inputs: {
        agentId: agentId.toString(),
        validatorAddresses: [validatorAccountAddress, agentOwnerAccountAddress],
        tagFilter: 0
      },
      outputs: {
        totalCount: multiCount.toString(),
        overallAverage: multiAvg.toString()
      }
    });
    console.log(`📊 SUMMARY DATA - get_summary (multi-validator): count=${multiCount}, avgResponse=${multiAvg}`);
    
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 15: Verify Request Details After Response
    // ===================================================================
    console.log('Test 15: Verify Request Details After Response');
    console.log('────────────────────────────────────────');
    
    const requestDetailsAfter = await validationRegistry.get_request(toUint256(usedRequestHash1));
    const afterValidator = requestDetailsAfter[0];
    const afterAgentId = requestDetailsAfter[1];
    
    console.log(`   Validator: ${afterValidator.toString(16).slice(0, 16)}...`);
    console.log(`   Agent ID: ${afterAgentId}`);
    
    assert(
      BigInt(afterValidator) === BigInt(validatorAccountAddress),
      'Validator should remain unchanged'
    );
    assert(BigInt(afterAgentId) === BigInt(agentId), 'Agent ID should remain unchanged');
    
    console.log('   ✅ PASSED\n');
    passed++;

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           ALL VALIDATION TESTS PASSED! 🎉                     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`✅ ${passed}/${passed} tests passed\n`);
    
    // Save comprehensive test data to validation.json
    fs.writeFileSync(
      path.join(__dirname, '..', 'validation.json'),
      JSON.stringify(testData, null, 2)
    );

    console.log('📊 Comprehensive test data saved to validation.json');
    console.log(`   - ${testData.validationOperations.length} validation operations logged`);
    console.log(`   - ${testData.readOperations.length} read operations logged`);
    console.log(`   - ${testData.summaryOperations.length} summary operations logged\n`);

    return { passed, failed };

  } catch (error) {
    failed++;
    console.error('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    throw error;
  }
}

