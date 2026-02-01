import { Account, Contract, RpcProvider, cairo, shortString, constants } from 'starknet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load deployed addresses
const addressesPath = path.join(__dirname, '..', 'deployed_addresses.json');

if (!fs.existsSync(addressesPath)) {
  console.error('❌ Error: deployed_addresses.json not found');
  console.error('');
  console.error('Please deploy contracts first:');
  console.error('  cd .. && ./scripts/deploy_local.sh');
  process.exit(1);
}

const deploymentInfo = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

// Setup provider for Sepolia testnet
export const rpcUrl = deploymentInfo.rpcUrl;
export const provider = new RpcProvider({
  nodeUrl: rpcUrl,
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  // Use 'latest' block instead of 'pending' for better compatibility
  blockIdentifier: 'latest',
  retries: 3,
  // Skip spec version check as Alchemy may report different versions
  skipSpecVersionCheck: true
});

console.log(`📡 Connected to: ${rpcUrl}`);

// Load contract ABIs
function loadAbi(contractName) {
  const abiPath = path.join(__dirname, '..', 'target', 'dev', `erc8004_${contractName}.contract_class.json`);
  
  if (!fs.existsSync(abiPath)) {
    console.error(`❌ Error: ABI not found for ${contractName}`);
    console.error(`   Expected: ${abiPath}`);
    console.error('');
    console.error('Please build contracts first:');
    console.error('  cd .. && scarb build');
    process.exit(1);
  }
  
  const contract = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  return contract.abi;
}

const identityAbi = loadAbi('IdentityRegistry');
const reputationAbi = loadAbi('ReputationRegistry');
const validationAbi = loadAbi('ValidationRegistry');

// Create contract instances
export const identityRegistry = new Contract(
  identityAbi,
  deploymentInfo.contracts.identityRegistry.address,
  provider
);

export const reputationRegistry = new Contract(
  reputationAbi,
  deploymentInfo.contracts.reputationRegistry.address,
  provider
);

export const validationRegistry = new Contract(
  validationAbi,
  deploymentInfo.contracts.validationRegistry.address,
  provider
);

// Sepolia testnet accounts
export const SEPOLIA_ACCOUNT_1 = {
  address: '0x04a6b1f403E879B54Ba3e68072FE4C3aAf8Eb3617a51d8fea59b769432AbBF50',
  privateKey: '0x0038ea6d7f8df0f1d3d29004deb72390028c1d15be04f1b089f9841d235a7d33',
};

export const SEPOLIA_ACCOUNT_2 = {
  address: '0x0065b981f8384a76dB7277691421177CB896957f33cA7275a99344eC495AE3A5',
  privateKey: '0x03573b568c42ae7eabd5891c2f7ac4523d4c51d2db4f2e3b00d7a5ecd9d1d7b2',
};

// For compatibility, expose as array (tests use index 0, 1, 2)
export const PREDEPLOYED_ACCOUNTS = [
  SEPOLIA_ACCOUNT_1,  // agentOwner
  SEPOLIA_ACCOUNT_2,  // otherUser
  SEPOLIA_ACCOUNT_2,  // additional tests can use account 2
];

// Helper: Create account for testing
export function createAccount(accountIndex = 0) {
  if (accountIndex >= PREDEPLOYED_ACCOUNTS.length) {
    throw new Error(`Account index ${accountIndex} out of range (max: ${PREDEPLOYED_ACCOUNTS.length - 1})`);
  }

  const { address, privateKey } = PREDEPLOYED_ACCOUNTS[accountIndex];
  const account = new Account(provider, address, privateKey);

  // Clear nonce cache to ensure fresh nonce is fetched from network
  // This prevents "invalid nonce" errors from previous test runs
  if (account.signer && account.signer.nonce !== undefined) {
    delete account.signer.nonce;
  }

  return account;
}

// Helper: Wait for transaction
export async function waitForTransaction(txHash) {
  console.log(`   ⏳ Waiting for tx: ${txHash.slice(0, 10)}...`);
  try {
    const receipt = await provider.waitForTransaction(txHash);
    console.log(`   ✅ Confirmed`);
    return receipt;
  } catch (error) {
    console.error(`   ❌ Transaction failed:`, error.message);
    throw error;
  }
}

// Helper: Format values
export function toFelt(value) {
  return cairo.felt(value);
}

export function toUint256(value) {
  return cairo.uint256(value);
}

export function toBigInt(value) {
  return BigInt(value);
}

// Helper: Assert with message
export function assert(condition, message) {
  if (!condition) {
    console.error(`   ❌ Assertion failed: ${message}`);
    throw new Error(message);
  }
}

// Export deployment info
export const addresses = {
  identityRegistry: deploymentInfo.contracts.identityRegistry.address,
  reputationRegistry: deploymentInfo.contracts.reputationRegistry.address,
  validationRegistry: deploymentInfo.contracts.validationRegistry.address,
};

// rpcUrl is already exported above

console.log('✅ Setup complete');
console.log('');

