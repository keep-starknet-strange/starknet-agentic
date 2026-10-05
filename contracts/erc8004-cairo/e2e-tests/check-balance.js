import { RpcProvider, constants, uint256 } from 'starknet';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Validate required environment variables
function validateEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`❌ Error: ${name} not set in .env file`);
    process.exit(1);
  }
  return value;
}

// Setup provider
const rpcUrl = validateEnvVar('STARKNET_RPC_URL');
const provider = new RpcProvider({
  nodeUrl: rpcUrl,
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  blockIdentifier: 'latest',
  retries: 3,
});

// The two accounts the E2E tests sign with (see setup.js)
const accounts = [
  { label: 'Agent Owner', envVar: 'DEPLOYER_ADDRESS', address: validateEnvVar('DEPLOYER_ADDRESS') },
  { label: 'Client/Validator', envVar: 'TEST_ACCOUNT_ADDRESS', address: validateEnvVar('TEST_ACCOUNT_ADDRESS') },
];

// STRK token (same address on Sepolia and mainnet); V3 transaction fees are paid in STRK
const strkTokenAddress = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

function formatStrk(amount) {
  const whole = amount / 10n ** 18n;
  const fraction = (amount % 10n ** 18n).toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${fraction}`;
}

async function checkBalances() {
  console.log('\n🔍 Checking Account Balances on Sepolia...\n');

  for (const { label, envVar, address } of accounts) {
    console.log(`${label} (${envVar}):`);
    console.log(`  Address: ${address}`);

    try {
      const [low, high] = await provider.callContract({
        contractAddress: strkTokenAddress,
        entrypoint: 'balanceOf',
        calldata: [address],
      });
      console.log(`  STRK Balance: ${formatStrk(uint256.uint256ToBN({ low, high }))} STRK`);
    } catch (e) {
      console.log(`  ⚠️  Unable to fetch balance: ${e.message}`);
    }

    try {
      const nonce = await provider.getNonceForAddress(address);
      console.log(`  Nonce: ${nonce}\n`);
    } catch (e) {
      console.log(`  Nonce: Unable to fetch (${e.message})\n`);
    }
  }
}

checkBalances();
