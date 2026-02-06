import { Account, Contract, RpcProvider, cairo, CallData, hash, byteArray } from 'starknet';
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

console.log('🚀 Reputation Registry E2E Tests (Updated Interface)\n');
console.log('═══════════════════════════════════════════════════════════════\n');

// Load deployment info
const deploymentInfo = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'deployed_addresses.json'), 'utf8')
);

// Setup provider (starknet.js v7.6.4 compatible)
const rpcUrl = validateEnvVar('STARKNET_RPC_URL');
const provider = new RpcProvider({
  nodeUrl: rpcUrl,
});

console.log(`📡 Connected to: ${rpcUrl}\n`);

// Load ABIs
const identityAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'target', 'dev', 'erc8004_IdentityRegistry.contract_class.json'), 'utf8')
).abi;

const reputationAbi = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'target', 'dev', 'erc8004_ReputationRegistry.contract_class.json'), 'utf8')
).abi;

console.log('✅ Contract ABIs loaded\n');

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

/**
 * Convert i128 to BigInt representation for Starknet
 * Positive numbers: just the BigInt
 * Negative numbers: 2's complement in felt252 field
 */
function toI128BigInt(num) {
  if (num >= 0) {
    return BigInt(num);
  } else {
    // FELT_PRIME for Starknet
    const FELT_PRIME = BigInt('0x800000000000011000000000000000000000000000000000000000000000001');
    const absValue = BigInt(Math.abs(num));
    return FELT_PRIME - absValue;
  }
}

/**
 * Helper to invoke give_feedback using account.execute to bypass starknet.js i128 validation
 * Uses CallData.compile with proper ByteArray serialization
 */
async function invokeFeedback(account, contractAddress, abi, agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackUri, feedbackHash) {
  // Use CallData to compile arguments
  // ByteArray needs to be converted using byteArrayFromString
  // feedback_hash is u256
  const calldata = CallData.compile({
    agent_id: cairo.uint256(agentId),
    value: toI128BigInt(value),  // BigInt for i128
    value_decimals: valueDecimals,
    tag1: byteArray.byteArrayFromString(tag1),
    tag2: byteArray.byteArrayFromString(tag2),
    endpoint: byteArray.byteArrayFromString(endpoint),
    feedback_uri: byteArray.byteArrayFromString(feedbackUri),
    feedback_hash: cairo.uint256(feedbackHash),  // u256
  });
  
  const result = await account.execute([{
    contractAddress: contractAddress,
    entrypoint: 'give_feedback',
    calldata: calldata,
  }]);
  
  return result;
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
    feedbackOperations: [],
    readOperations: [],
    summaryOperations: []
  };

  try {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         Reputation Registry E2E Tests                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // ===================================================================
    // Setup: Create Accounts
    // ===================================================================
    console.log('Setup: Connecting Accounts');
    console.log('────────────────────────────────────────');
    
    const agentOwner = new Account(provider, ACCOUNT_1.address, ACCOUNT_1.privateKey);
    const client = new Account(provider, ACCOUNT_2.address, ACCOUNT_2.privateKey);
    
    console.log(`   👤 Agent Owner: ${agentOwner.address.slice(0, 16)}...`);
    console.log(`   👤 Client:      ${client.address.slice(0, 16)}...`);
    console.log('   ✅ Accounts Connected\n');
    
    testData.accounts = {
      agentOwner: { address: agentOwner.address },
      client: { address: client.address }
    };

    // Create contract instances
    const identityRegistry = new Contract(
      identityAbi,
      deploymentInfo.contracts.identityRegistry.address,
      agentOwner
    );
    
    const reputationRegistry = new Contract(
      reputationAbi,
      deploymentInfo.contracts.reputationRegistry.address,
      client
    );

    // ===================================================================
    // Test 1: Register Agent
    // ===================================================================
    console.log('Test 1: Register Agent');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(agentOwner);
    
    const registerTx = await identityRegistry.register_with_token_uri('ipfs://reputation-test-agent.json');
    await waitForTx(registerTx.transaction_hash, agentOwner);
    
    const agentId = await identityRegistry.total_agents();
    console.log(`   Agent ID: ${agentId}`);
    console.log('   ✅ PASSED\n');
    
    testData.agent = { agentId: agentId.toString(), owner: agentOwner.address };
    passed++;

    // ===================================================================
    // Test 2: Get Identity Registry
    // ===================================================================
    console.log('Test 2: Get Identity Registry');
    console.log('────────────────────────────────────────');
    
    const identityRegAddr = await reputationRegistry.get_identity_registry();
    console.log(`   Identity Registry: ${identityRegAddr.toString(16).slice(0, 16)}...`);
    assert(
      BigInt(identityRegAddr) === BigInt(identityRegistry.address),
      'Identity registry address should match'
    );
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 3: Give Feedback (Positive Value)
    // ===================================================================
    console.log('Test 3: Give Feedback (Positive Value)');
    console.log('────────────────────────────────────────');
    
    // Interface: give_feedback(agent_id, value, value_decimals, tag1, tag2, endpoint, feedback_uri, feedback_hash)
    // value: i128, value_decimals: u8 (0-18)
    const feedback1Value = 100; // Positive feedback value
    const feedback1Decimals = 0;
    const tag1 = "quality";
    const tag2 = "service";
    const endpoint = "ipfs://feedback1.json";
    const feedbackUri1 = "ipfs://feedback1-details.json";
    const feedbackHash1 = BigInt(Date.now()); // Simple hash for testing
    
    // Use account.execute to bypass i128 validation issue in starknet.js
    const feedbackTx1 = await invokeFeedback(
      client,
      deploymentInfo.contracts.reputationRegistry.address,
      reputationAbi,
      agentId,
      feedback1Value,
      feedback1Decimals,
      tag1,
      tag2,
      endpoint,
      feedbackUri1,
      feedbackHash1
    );
    await waitForTx(feedbackTx1.transaction_hash, client);
    
    console.log(`   Value: ${feedback1Value}, Decimals: ${feedback1Decimals}`);
    console.log(`   Tags: "${tag1}", "${tag2}"`);
    console.log('   ✅ PASSED\n');
    
    testData.feedbackOperations.push({
      operation: 'give_feedback',
      feedbackNumber: 1,
      inputs: { agentId: agentId.toString(), value: feedback1Value, decimals: feedback1Decimals, tag1, tag2, endpoint },
      transactionHash: feedbackTx1.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 4: Read Feedback
    // ===================================================================
    console.log('Test 4: Read Feedback');
    console.log('────────────────────────────────────────');
    
    const feedback = await reputationRegistry.read_feedback(
      toUint256(agentId),
      client.address,
      1 // 1-based index
    );
    
    // Debug: print the actual structure
    console.log(`   Raw feedback structure: ${JSON.stringify(feedback, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    
    // The return format is flattened: {0: value, 1: decimals, 2: tag1, 3: tag2, 4: is_revoked}
    // Access by numeric index
    const feedbackValue = feedback['0'] ?? feedback[0];
    const feedbackDecimals = feedback['1'] ?? feedback[1];
    const readTag1 = feedback['2'] ?? feedback[2];
    const readTag2 = feedback['3'] ?? feedback[3];
    const feedbackRevoked = feedback['4'] ?? feedback[4];
    
    console.log(`   Value: ${feedbackValue}`);
    console.log(`   Decimals: ${feedbackDecimals}`);
    console.log(`   Revoked: ${feedbackRevoked}`);
    console.log(`   Tag1: ${readTag1}`);
    console.log(`   Tag2: ${readTag2}`);
    
    // Convert to comparable values
    const actualValue = BigInt(feedbackValue?.toString?.() ?? feedbackValue ?? 0);
    const expectedValue = BigInt(feedback1Value);
    
    assert(actualValue === expectedValue, `Value should match: got ${actualValue}, expected ${expectedValue}`);
    assert(Number(feedbackDecimals) === feedback1Decimals, 'Decimals should match');
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'read_feedback',
      inputs: { agentId: agentId.toString(), clientAddress: client.address, index: 1 },
      outputs: { value: feedbackValue?.toString?.() ?? String(feedbackValue), decimals: String(feedbackDecimals), revoked: feedbackRevoked }
    });
    passed++;

    // ===================================================================
    // Test 5: Give Feedback (Negative Value)
    // ===================================================================
    console.log('Test 5: Give Feedback (Negative Value)');
    console.log('────────────────────────────────────────');
    
    const feedback2Value = -50; // Negative feedback
    const feedback2Decimals = 0;
    
    const feedbackTx2 = await invokeFeedback(
      client,
      deploymentInfo.contracts.reputationRegistry.address,
      reputationAbi,
      agentId,
      feedback2Value,
      feedback2Decimals,
      "quality",
      "support",
      "ipfs://feedback2.json",
      "ipfs://feedback2-details.json",
      BigInt(Date.now() + 1)
    );
    await waitForTx(feedbackTx2.transaction_hash, client);
    
    console.log(`   Value: ${feedback2Value}, Decimals: ${feedback2Decimals}`);
    console.log('   ✅ PASSED\n');
    
    testData.feedbackOperations.push({
      operation: 'give_feedback',
      feedbackNumber: 2,
      inputs: { agentId: agentId.toString(), value: feedback2Value, decimals: feedback2Decimals },
      transactionHash: feedbackTx2.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 6: Give Feedback with Decimals
    // ===================================================================
    console.log('Test 6: Give Feedback with Decimals');
    console.log('────────────────────────────────────────');
    
    const feedback3Value = 75; // 7.5 with 1 decimal
    const feedback3Decimals = 1;
    
    const feedbackTx3 = await invokeFeedback(
      client,
      deploymentInfo.contracts.reputationRegistry.address,
      reputationAbi,
      agentId,
      feedback3Value,
      feedback3Decimals,
      "precision",
      "",
      "",
      "ipfs://feedback3-details.json",
      BigInt(Date.now() + 2)
    );
    await waitForTx(feedbackTx3.transaction_hash, client);
    
    console.log(`   Value: ${feedback3Value}, Decimals: ${feedback3Decimals} (actual: 7.5)`);
    console.log('   ✅ PASSED\n');
    
    testData.feedbackOperations.push({
      operation: 'give_feedback',
      feedbackNumber: 3,
      inputs: { agentId: agentId.toString(), value: feedback3Value, decimals: feedback3Decimals },
      transactionHash: feedbackTx3.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 7: Get Clients
    // ===================================================================
    console.log('Test 7: Get Clients');
    console.log('────────────────────────────────────────');
    
    const clients = await reputationRegistry.get_clients(toUint256(agentId));
    
    console.log(`   Clients count: ${clients.length}`);
    assert(clients.length >= 1, 'Should have at least 1 client');
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'get_clients',
      inputs: { agentId: agentId.toString() },
      outputs: { clientsCount: clients.length }
    });
    passed++;

    // ===================================================================
    // Test 8: Get Summary
    // ===================================================================
    console.log('Test 8: Get Summary');
    console.log('────────────────────────────────────────');
    
    // get_summary returns (count: u64, value_sum: i128, mode_decimals: u8)
    const summary = await reputationRegistry.get_summary(
      toUint256(agentId),
      [client.address],
      "", // tag1 filter (empty = all)
      ""  // tag2 filter (empty = all)
    );
    
    const count = summary[0];
    const valueSum = summary[1];
    const modeDecimals = summary[2];
    
    console.log(`   Count: ${count}`);
    console.log(`   Value Sum: ${valueSum}`);
    console.log(`   Mode Decimals: ${modeDecimals}`);
    
    assert(count >= 3n, 'Should have at least 3 feedback entries');
    console.log('   ✅ PASSED\n');
    
    testData.summaryOperations.push({
      operation: 'get_summary',
      inputs: { agentId: agentId.toString(), clients: [client.address], tag1Filter: "", tag2Filter: "" },
      outputs: { count: count.toString(), valueSum: valueSum.toString(), modeDecimals: modeDecimals.toString() }
    });
    passed++;

    // ===================================================================
    // Test 9: Append Response
    // ===================================================================
    console.log('Test 9: Append Response (Agent Owner)');
    console.log('────────────────────────────────────────');
    
    reputationRegistry.connect(agentOwner);
    
    const responseHash = BigInt(Date.now() + 100);
    const responseTx = await reputationRegistry.append_response(
      toUint256(agentId),
      client.address,
      1, // feedback index
      'ipfs://response1.json',
      toUint256(responseHash)  // response_hash (u256)
    );
    await waitForTx(responseTx.transaction_hash, agentOwner);
    
    console.log('   Response appended to feedback #1');
    console.log('   ✅ PASSED\n');
    
    testData.feedbackOperations.push({
      operation: 'append_response',
      inputs: { agentId: agentId.toString(), clientAddress: client.address, feedbackIndex: 1, responseUri: 'ipfs://response1.json', responseHash: responseHash.toString() },
      transactionHash: responseTx.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 10: Revoke Feedback
    // ===================================================================
    console.log('Test 10: Revoke Feedback');
    console.log('────────────────────────────────────────');
    
    reputationRegistry.connect(client);
    
    const revokeTx = await reputationRegistry.revoke_feedback(
      toUint256(agentId),
      1 // feedback index
    );
    await waitForTx(revokeTx.transaction_hash, client);
    
    console.log('   Feedback #1 revoked');
    console.log('   ✅ PASSED\n');
    
    testData.feedbackOperations.push({
      operation: 'revoke_feedback',
      inputs: { agentId: agentId.toString(), feedbackIndex: 1 },
      transactionHash: revokeTx.transaction_hash
    });
    passed++;

    // ===================================================================
    // Test 11: Verify Revoked Feedback
    // ===================================================================
    console.log('Test 11: Verify Revoked Feedback');
    console.log('────────────────────────────────────────');
    
    const revokedFeedback = await reputationRegistry.read_feedback(
      toUint256(agentId),
      client.address,
      1
    );
    
    // Access using the flattened structure: {0: value, 1: decimals, 2: tag1, 3: tag2, 4: is_revoked}
    const isRevoked = revokedFeedback['4'] ?? revokedFeedback[4];
    console.log(`   Is Revoked: ${isRevoked}`);
    assert(isRevoked === true, 'Feedback should be revoked');
    console.log('   ✅ PASSED\n');
    passed++;

    // ===================================================================
    // Test 12: Read All Feedback
    // ===================================================================
    console.log('Test 12: Read All Feedback');
    console.log('────────────────────────────────────────');
    
    const allFeedback = await reputationRegistry.read_all_feedback(
      toUint256(agentId),
      [client.address],
      "",   // tag1 filter (empty = no filter)
      "",   // tag2 filter (empty = no filter)
      true  // include_revoked
    );
    
    // Returns: (clients[], indices[], values[], decimals[], tag1s[], tag2s[], revoked[])
    // Access using flattened structure
    const clientsArr = allFeedback['0'] ?? allFeedback[0] ?? [];
    const indicesArr = allFeedback['1'] ?? allFeedback[1] ?? [];
    const valuesArr = allFeedback['2'] ?? allFeedback[2] ?? [];
    const decimalsArr = allFeedback['3'] ?? allFeedback[3] ?? [];
    const revokedArr = allFeedback['6'] ?? allFeedback[6] ?? [];
    
    console.log(`   Total feedback count: ${valuesArr.length}`);
    
    // Count non-revoked
    let nonRevokedCount = 0;
    for (let i = 0; i < revokedArr.length; i++) {
      if (!revokedArr[i]) nonRevokedCount++;
    }
    console.log(`   Non-revoked count: ${nonRevokedCount}`);
    console.log('   ✅ PASSED\n');
    
    testData.readOperations.push({
      operation: 'read_all_feedback',
      inputs: { agentId: agentId.toString(), clients: [client.address] },
      outputs: { totalCount: valuesArr.length, nonRevokedCount }
    });
    passed++;

    // ===================================================================
    // Summary
    // ===================================================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║         ALL REPUTATION TESTS PASSED! 🎉                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}\n`);

    console.log('🎊 Features tested:');
    console.log('  ✅ Agent registration');
    console.log('  ✅ Give feedback (positive, negative, with decimals)');
    console.log('  ✅ Read feedback');
    console.log('  ✅ Get clients');
    console.log('  ✅ Get summary with new return values');
    console.log('  ✅ Append response');
    console.log('  ✅ Revoke feedback');
    console.log('  ✅ Read all feedback\n');

    // Save test data
    fs.writeFileSync(
      path.join(__dirname, '..', 'reputation_test_data.json'),
      JSON.stringify(testData, null, 2)
    );
    console.log('📊 Test data saved to reputation_test_data.json\n');

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
const isDirectRun = process.argv[1]?.includes('reputation.test.js');
if (isDirectRun) {
  runTests().then(result => {
    process.exit(result.failed === 0 ? 0 : 1);
  }).catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
