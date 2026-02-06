/**
 * SNIP-6 Signature Verification Test for setAgentWallet
 * 
 * This test demonstrates the signature flow for setting an agent wallet:
 * 1. Compute the message hash (same as Cairo contract)
 * 2. Sign the hash with the new wallet's private key
 * 3. Call set_agent_wallet with the signature
 */

import { Account, Contract, RpcProvider, ec, hash, cairo } from 'starknet';
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
let deploymentInfo;
try {
  deploymentInfo = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', '..', 'deployed_addresses.json'), 'utf8')
  );
} catch (e) {
  console.error('Error loading deployment info:', e.message);
  process.exit(1);
}

// Setup provider (starknet.js v7.6.4 compatible)
const rpcUrl = validateEnvVar('STARKNET_RPC_URL');
const provider = new RpcProvider({
  nodeUrl: rpcUrl,
});

console.log('🔐 SNIP-6 Signature Verification Test for setAgentWallet\n');
console.log('═══════════════════════════════════════════════════════════════\n');

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
 * Compute the wallet set hash exactly as the Cairo contract does:
 * poseidon_hash_span([agent_id.low, agent_id.high, new_wallet, owner, deadline])
 */
function computeWalletSetHash(agentId, newWallet, owner, deadline) {
  const u256 = toUint256(agentId);
  
  // Prepare the data array matching Cairo's implementation
  const hashData = [
    u256.low.toString(),      // agent_id.low
    u256.high.toString(),     // agent_id.high  
    newWallet,                // new_wallet (ContractAddress as felt252)
    owner,                    // owner (ContractAddress as felt252)
    deadline.toString(),      // deadline (u64 as felt252)
  ];
  
  // Use starknet.js poseidon hash
  const messageHash = hash.computePoseidonHash(hashData[0], hashData[1]);
  let finalHash = messageHash;
  for (let i = 2; i < hashData.length; i++) {
    finalHash = hash.computePoseidonHash(finalHash, hashData[i]);
  }
  
  return finalHash;
}

/**
 * Alternative: Use poseidonHashMany which matches poseidon_hash_span
 */
function computeWalletSetHashV2(agentId, newWallet, owner, deadline) {
  const u256 = toUint256(agentId);
  
  // poseidonHashMany expects array of BigInt-like values
  const hashData = [
    BigInt(u256.low),
    BigInt(u256.high),
    BigInt(newWallet),
    BigInt(owner),
    BigInt(deadline),
  ];
  
  return hash.computePoseidonHashOnElements(hashData);
}

/**
 * Sign a message hash with the wallet's private key
 */
function signMessage(privateKey, messageHash) {
  const signature = ec.starkCurve.sign(messageHash, privateKey);
  return [signature.r.toString(), signature.s.toString()];
}

async function runTest() {
  try {
    console.log('📡 Connected to:', deploymentInfo.rpcUrl);
    console.log('');

    // Load ABI
    const identityAbi = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, '..', '..', 'target', 'dev', 'erc8004_IdentityRegistry.contract_class.json'),
        'utf8'
      )
    ).abi;

    // Create accounts
    const agentOwner = new Account(provider, ACCOUNT_1.address, ACCOUNT_1.privateKey);
    const newWalletAccount = new Account(provider, ACCOUNT_2.address, ACCOUNT_2.privateKey);

    console.log(`👤 Agent Owner (Account 1): ${agentOwner.address.slice(0, 16)}...`);
    console.log(`👛 New Wallet (Account 2):  ${newWalletAccount.address.slice(0, 16)}...`);
    console.log('');

    // Create contract instance
    const identityRegistry = new Contract(
      identityAbi,
      deploymentInfo.contracts.identityRegistry.address,
      agentOwner
    );

    // ===================================================================
    // Step 1: Register a new agent
    // ===================================================================
    console.log('Step 1: Register a new agent');
    console.log('────────────────────────────────────────');
    
    const registerTx = await identityRegistry.register_with_token_uri('ipfs://wallet-sig-test.json');
    console.log(`   ⏳ Waiting for registration tx...`);
    await provider.waitForTransaction(registerTx.transaction_hash);
    
    const agentId = await identityRegistry.total_agents();
    console.log(`   ✅ Agent registered with ID: ${agentId}`);
    console.log('');

    // ===================================================================
    // Step 2: Get current wallet (should be owner initially)
    // ===================================================================
    console.log('Step 2: Check initial wallet');
    console.log('────────────────────────────────────────');
    
    const initialWallet = await identityRegistry.get_agent_wallet(cairo.uint256(agentId));
    console.log(`   Initial wallet: ${BigInt(initialWallet).toString(16).slice(0, 16)}...`);
    console.log(`   (Should match agent owner)`);
    console.log('');

    // ===================================================================
    // Step 3: Prepare signature for set_agent_wallet
    // ===================================================================
    console.log('Step 3: Prepare SNIP-6 signature');
    console.log('────────────────────────────────────────');
    
    // Deadline: 5 minutes from now (MAX_DEADLINE_DELAY is 300 seconds)
    const currentTime = Math.floor(Date.now() / 1000);
    const deadline = currentTime + 250; // 4 minutes to be safe
    
    console.log(`   Agent ID: ${agentId}`);
    console.log(`   New Wallet: ${newWalletAccount.address}`);
    console.log(`   Owner: ${agentOwner.address}`);
    console.log(`   Deadline: ${deadline} (${new Date(deadline * 1000).toISOString()})`);
    console.log('');

    // Compute message hash (matching Cairo's _compute_wallet_set_hash)
    const messageHash = computeWalletSetHashV2(
      BigInt(agentId),
      newWalletAccount.address,
      agentOwner.address,
      deadline
    );
    console.log(`   Message Hash: ${messageHash}`);

    // Sign the message with the NEW wallet's private key
    const signature = signMessage(ACCOUNT_2.privateKey, messageHash);
    console.log(`   Signature r: ${signature[0].slice(0, 20)}...`);
    console.log(`   Signature s: ${signature[1].slice(0, 20)}...`);
    console.log('');

    // ===================================================================
    // Step 4: Call set_agent_wallet with signature
    // ===================================================================
    console.log('Step 4: Call set_agent_wallet');
    console.log('────────────────────────────────────────');
    
    try {
      const setWalletTx = await identityRegistry.set_agent_wallet(
        cairo.uint256(agentId),
        newWalletAccount.address,
        deadline,
        signature
      );
      
      console.log(`   ⏳ Waiting for set_agent_wallet tx: ${setWalletTx.transaction_hash.slice(0, 20)}...`);
      await provider.waitForTransaction(setWalletTx.transaction_hash);
      console.log('   ✅ Transaction confirmed!');
      console.log('');

      // ===================================================================
      // Step 5: Verify the wallet was updated
      // ===================================================================
      console.log('Step 5: Verify wallet update');
      console.log('────────────────────────────────────────');
      
      const updatedWallet = await identityRegistry.get_agent_wallet(cairo.uint256(agentId));
      const updatedWalletHex = BigInt(updatedWallet).toString(16);
      const expectedWalletHex = BigInt(newWalletAccount.address).toString(16);
      
      console.log(`   Updated wallet: 0x${updatedWalletHex}`);
      console.log(`   Expected:       0x${expectedWalletHex}`);
      
      if (updatedWalletHex === expectedWalletHex) {
        console.log('   ✅ Wallet successfully updated!');
      } else {
        console.log('   ❌ Wallet mismatch!');
      }
      console.log('');

    } catch (error) {
      console.log(`   ❌ set_agent_wallet failed: ${error.message}`);
      console.log('');
      console.log('   This could be due to:');
      console.log('   1. Hash computation mismatch between JS and Cairo');
      console.log('   2. Signature format issue');
      console.log('   3. Deadline expired or invalid');
      console.log('');
      console.log('   Full error:', error);
    }

    // ===================================================================
    // Summary
    // ===================================================================
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           SNIP-6 SIGNATURE TEST COMPLETE                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

  } catch (error) {
    console.error('\n❌ TEST FAILED\n');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

// Export for use with test runner
export default runTest;

// Run immediately when script is executed
runTest().then(() => process.exit(0)).catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
