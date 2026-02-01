import { 
  createAccount, 
  identityRegistry, 
  waitForTransaction, 
  toUint256,
  assert 
} from '../setup.js';

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Identity Registry E2E Tests                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    // Setup: Create accounts
    const agentOwner = createAccount(0);
    const otherUser = createAccount(1);

    console.log(`👤 Agent Owner: ${agentOwner.address.slice(0, 10)}...`);
    console.log(`👤 Other User:  ${otherUser.address.slice(0, 10)}...`);
    console.log('');

    // ===================================================================
    // Test 1: Register Agent with Token URI
    // ===================================================================
    console.log('Test 1: Register Agent with Token URI');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(agentOwner);
    const tokenUri = 'ipfs://QmTest123/agent.json';
    
    const registerTx = await identityRegistry.register_with_token_uri(tokenUri);
    await waitForTransaction(registerTx.transaction_hash);
    
    // Get the newly registered agent ID (should be the current total)
    const agentId = await identityRegistry.total_agents();
    console.log(`   Agent ID: ${agentId}`);
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 2: Verify Total Agents
    // ===================================================================
    console.log('Test 2: Verify Total Agents');
    console.log('────────────────────────────────────────');
    
    const totalAgents = await identityRegistry.total_agents();
    console.log(`   Total Agents: ${totalAgents}`);
    assert(totalAgents >= 1n, 'Should have at least 1 agent');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 3: Verify Agent Ownership
    // ===================================================================
    console.log('Test 3: Verify Agent Ownership');
    console.log('────────────────────────────────────────');
    
    const owner = await identityRegistry.owner_of(toUint256(agentId));
    const ownerStr = typeof owner === 'string' ? owner : `0x${owner.toString(16)}`;
    console.log(`   Owner: ${ownerStr.slice(0, 10)}...`);
    assert(BigInt(owner) === BigInt(agentOwner.address), 'Owner should match agent owner');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 4: Verify Token URI
    // ===================================================================
    console.log('Test 4: Verify Token URI');
    console.log('────────────────────────────────────────');
    
    const retrievedTokenUri = await identityRegistry.token_uri(toUint256(agentId));
    console.log(`   Token URI: ${retrievedTokenUri}`);
    assert(retrievedTokenUri === tokenUri, 'Token URI should match');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 5: Check Agent Exists
    // ===================================================================
    console.log('Test 5: Check Agent Exists');
    console.log('────────────────────────────────────────');
    
    const exists = await identityRegistry.agent_exists(toUint256(agentId));
    console.log(`   Exists: ${exists}`);
    assert(exists === true, 'Agent should exist');
    
    const notExists = await identityRegistry.agent_exists(toUint256(9999));
    assert(notExists === false, 'Non-existent agent should return false');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 6: Set Metadata
    // ===================================================================
    console.log('Test 6: Set Metadata');
    console.log('────────────────────────────────────────');
    
    const setMetadataTx = await identityRegistry.set_metadata(
      toUint256(agentId),
      'agentName',
      'AliceAgent'
    );
    await waitForTransaction(setMetadataTx.transaction_hash);
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 7: Get Metadata
    // ===================================================================
    console.log('Test 7: Get Metadata');
    console.log('────────────────────────────────────────');
    
    const metadata = await identityRegistry.get_metadata(
      toUint256(agentId),
      'agentName'
    );
    console.log(`   Metadata 'agentName': ${metadata}`);
    assert(metadata === 'AliceAgent', 'Metadata should match');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 8: Update Metadata
    // ===================================================================
    console.log('Test 8: Update Metadata');
    console.log('────────────────────────────────────────');
    
    const updateMetadataTx = await identityRegistry.set_metadata(
      toUint256(agentId),
      'agentName',
      'AliceAgentV2'
    );
    await waitForTransaction(updateMetadataTx.transaction_hash);
    
    const updatedMetadata = await identityRegistry.get_metadata(
      toUint256(agentId),
      'agentName'
    );
    console.log(`   Updated Metadata: ${updatedMetadata}`);
    assert(updatedMetadata === 'AliceAgentV2', 'Metadata should be updated');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 9: Unauthorized Set Metadata (Should Fail)
    // ===================================================================
    console.log('Test 9: Unauthorized Set Metadata (Should Fail)');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(otherUser);
    
    try {
      await identityRegistry.set_metadata(
        toUint256(agentId),
        'agentName',
        'Hacked'
      );
      console.log('   ❌ FAILED - Should have thrown error');
      process.exit(1);
    } catch (error) {
      console.log(`   Expected error: ${error.message.slice(0, 50)}...`);
      console.log('   ✅ PASSED\n');
    }

    // ===================================================================
    // Test 10: Approve and Transfer
    // ===================================================================
    console.log('Test 10: Approve and Transfer');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(agentOwner);
    
    // Approve other user
    const approveTx = await identityRegistry.approve(
      otherUser.address,
      toUint256(agentId)
    );
    await waitForTransaction(approveTx.transaction_hash);
    console.log('   Approved');
    
    // Transfer to other user
    const transferTx = await identityRegistry.transfer_from(
      agentOwner.address,
      otherUser.address,
      toUint256(agentId)
    );
    await waitForTransaction(transferTx.transaction_hash);
    console.log('   Transferred');
    
    // Verify new owner
    const newOwner = await identityRegistry.owner_of(toUint256(agentId));
    const newOwnerStr = typeof newOwner === 'string' ? newOwner : `0x${newOwner.toString(16)}`;
    console.log(`   New Owner: ${newOwnerStr.slice(0, 10)}...`);
    assert(BigInt(newOwner) === BigInt(otherUser.address), 'Owner should be other user');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 11: New Owner Can Set Metadata
    // ===================================================================
    console.log('Test 11: New Owner Can Set Metadata');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(otherUser);
    
    const newOwnerMetadataTx = await identityRegistry.set_metadata(
      toUint256(agentId),
      'newOwner',
      'true'
    );
    await waitForTransaction(newOwnerMetadataTx.transaction_hash);
    
    const newOwnerMetadata = await identityRegistry.get_metadata(
      toUint256(agentId),
      'newOwner'
    );
    assert(newOwnerMetadata === 'true', 'New owner should be able to set metadata');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 12: Register Multiple Agents
    // ===================================================================
    console.log('Test 12: Register Multiple Agents');
    console.log('────────────────────────────────────────');
    
    identityRegistry.connect(agentOwner);
    
    const agent2Tx = await identityRegistry.register_with_token_uri('ipfs://agent2.json');
    await waitForTransaction(agent2Tx.transaction_hash);
    
    const agent3Tx = await identityRegistry.register_with_token_uri('ipfs://agent3.json');
    await waitForTransaction(agent3Tx.transaction_hash);
    
    const totalAfter = await identityRegistry.total_agents();
    console.log(`   Total Agents: ${totalAfter}`);
    assert(totalAfter >= 3n, 'Should have at least 3 agents');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Test 13: Register with Metadata
    // ===================================================================
    console.log('Test 13: Register with Metadata');
    console.log('────────────────────────────────────────');
    
    const agentMetadata = [
      { key: 'name', value: 'BobAgent' },
      { key: 'version', value: '1.0' },
    ];
    
    const registerWithMetadataTx = await identityRegistry.register_with_metadata(
      'ipfs://bob.json',
      agentMetadata
    );
    await waitForTransaction(registerWithMetadataTx.transaction_hash);
    
    const bobAgentId = await identityRegistry.total_agents();
    const bobName = await identityRegistry.get_metadata(bobAgentId, 'name');
    const bobVersion = await identityRegistry.get_metadata(bobAgentId, 'version');
    
    console.log(`   Agent ${bobAgentId} - Name: ${bobName}, Version: ${bobVersion}`);
    assert(bobName === 'BobAgent', 'Name should match');
    assert(bobVersion === '1.0', 'Version should match');
    console.log('   ✅ PASSED\n');

    // ===================================================================
    // Summary
    // ===================================================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║              ALL IDENTITY TESTS PASSED! 🎉                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`✅ 13/13 tests passed`);
    console.log('');

    return { passed: 13, failed: 0 };

  } catch (error) {
    console.error('');
    console.error('❌ TEST SUITE FAILED');
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run tests if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

export default runTests;

