import { Account, Contract, RpcProvider, cairo, shortString, constants } from 'starknet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Load deployed addresses
const addressesPath = path.join(__dirname, '..', 'deployed_addresses.json');

if (!fs.existsSync(addressesPath)) {
  console.error('❌ Error: deployed_addresses.json not found');
  console.error('');
  console.error('Please deploy contracts first:');
  console.error('  cd .. && npm run deploy (in scripts folder)');
  process.exit(1);
}

const deploymentInfo = JSON.parse(fs.readFileSync(addressesPath, 'utf8'));

// Validate RPC URL from environment
if (!process.env.STARKNET_RPC_URL) {
  console.error('❌ Error: STARKNET_RPC_URL not set in .env file');
  console.error('   Copy .env.example to .env and configure your settings');
  process.exit(1);
}

// Setup provider for Sepolia testnet
export const rpcUrl = process.env.STARKNET_RPC_URL;
export const provider = new RpcProvider({
  nodeUrl: rpcUrl,
  chainId: constants.StarknetChainId.SN_SEPOLIA,
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

// Validate required environment variables
function validateEnvVar(name, value) {
  if (!value) {
    console.error(`❌ Error: ${name} not set in .env file`);
    console.error('   Copy .env.example to .env and configure your settings');
    process.exit(1);
  }
  return value;
}

// Sepolia testnet accounts - loaded from environment variables (required)
export const SEPOLIA_ACCOUNT_1 = {
  address: validateEnvVar('DEPLOYER_ADDRESS', process.env.DEPLOYER_ADDRESS),
  privateKey: validateEnvVar('DEPLOYER_PRIVATE_KEY', process.env.DEPLOYER_PRIVATE_KEY),
};

export const SEPOLIA_ACCOUNT_2 = {
  address: validateEnvVar('TEST_ACCOUNT_ADDRESS', process.env.TEST_ACCOUNT_ADDRESS),
  privateKey: validateEnvVar('TEST_ACCOUNT_PRIVATE_KEY', process.env.TEST_ACCOUNT_PRIVATE_KEY),
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

