import { RpcProvider, Account, constants } from 'starknet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load deployment info
const addressesPath = path.join(__dirname, '..', 'deployed_addresses.json');
const deploymentInfo = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

// Setup provider
const provider = new RpcProvider({
  nodeUrl: deploymentInfo.rpcUrl,
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  blockIdentifier: 'latest',
  retries: 3,
  skipSpecVersionCheck: true
});

// Load OZ accounts
const ozAccountsPath = path.join(__dirname, 'oz_reputation_accounts.json');
const ozAccounts = JSON.parse(fs.readFileSync(ozAccountsPath, 'utf8'));

async function checkBalances() {
  console.log('\n🔍 Checking Account Balances on Sepolia...\n');
  
  const agentOwnerAddress = ozAccounts.agentOwnerAccount.address;
  const clientAddress = ozAccounts.clientAccount.address;
  
  try {
    // STRK token address on Sepolia
    const strkTokenAddress = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';
    
    console.log('Agent Owner Account:');
    console.log(`  Address: ${agentOwnerAddress}`);
    
    try {
      const balance1 = await provider.callContract({
        contractAddress: strkTokenAddress,
        entrypoint: 'balanceOf',
        calldata: [agentOwnerAddress]
      });
      const balanceStrk1 = BigInt(balance1[0]) / BigInt(10**18);
      console.log(`  STRK Balance: ${balanceStrk1} STRK\n`);
    } catch (e) {
      console.log(`  ⚠️  Unable to fetch balance: ${e.message}\n`);
    }
    
    console.log('Client/Validator Account:');
    console.log(`  Address: ${clientAddress}`);
    
    try {
      const balance2 = await provider.callContract({
        contractAddress: strkTokenAddress,
        entrypoint: 'balanceOf',
        calldata: [clientAddress]
      });
      const balanceStrk2 = BigInt(balance2[0]) / BigInt(10**18);
      console.log(`  STRK Balance: ${balanceStrk2} STRK\n`);
    } catch (e) {
      console.log(`  ⚠️  Unable to fetch balance: ${e.message}\n`);
    }
    
    // Get nonces
    console.log('Account Nonces:');
    try {
      const nonce1 = await provider.getNonceForAddress(agentOwnerAddress);
      console.log(`  Agent Owner Nonce: ${nonce1}`);
    } catch (e) {
      console.log(`  Agent Owner Nonce: Unable to fetch`);
    }
    
    try {
      const nonce2 = await provider.getNonceForAddress(clientAddress);
      console.log(`  Client Nonce: ${nonce2}\n`);
    } catch (e) {
      console.log(`  Client Nonce: Unable to fetch\n`);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkBalances();

