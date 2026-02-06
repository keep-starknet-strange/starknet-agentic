/**
 * Starknet Account Setup Template
 *
 * This template demonstrates the complete account creation workflow:
 * 1. Generate keys
 * 2. Compute address
 * 3. Fund the address
 * 4. Deploy the account
 */

import {
  RpcProvider,
  Account,
  hash,
  ec,
  stark,
  CallData,
} from 'starknet';

// Configuration
const RPC_URL = 'https://starknet-sepolia.public.blastapi.io/rpc/v0_8';

// OpenZeppelin Account class hash (v0.17.0)
const OZ_CLASS_HASH = '0x540d7f5ec7ecf317e68d48564934cb99259781b1ee3cedbbc37ec5337f8e688';

// ArgentX Account class hash (v0.4.0) - uncomment to use
// const ARGENT_CLASS_HASH = '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f';

interface AccountKeys {
  privateKey: string;
  publicKey: string;
  address: string;
  classHash: string;
  constructorCalldata: string[];
}

/**
 * Step 1 & 2: Generate keys and compute address
 */
function computeAccountAddress(classHash: string = OZ_CLASS_HASH): AccountKeys {
  // Generate new private key
  const privateKey = stark.randomAddress();

  // Derive public key from private key
  const publicKey = ec.starkCurve.getStarkKey(privateKey);

  // Prepare constructor calldata
  // OpenZeppelin: just the public key
  // ArgentX: [publicKey, guardian (0 for none)]
  const constructorCalldata = CallData.compile({ publicKey });

  // Compute the future address
  const address = hash.calculateContractAddressFromHash(
    publicKey, // salt
    classHash,
    constructorCalldata,
    0 // deployer address (0 for UDC)
  );

  return {
    privateKey,
    publicKey,
    address,
    classHash,
    constructorCalldata,
  };
}

/**
 * Step 3: Check balance (before funding)
 */
async function checkBalance(provider: RpcProvider, address: string): Promise<bigint> {
  try {
    const balance = await provider.getBalance(address);
    return BigInt(balance.toString());
  } catch {
    return 0n;
  }
}

/**
 * Step 4: Deploy the account
 */
async function deployAccount(
  provider: RpcProvider,
  keys: AccountKeys
): Promise<{ transactionHash: string; account: Account }> {
  // Create account instance (not yet deployed on-chain)
  const account = new Account({
    provider,
    address: keys.address,
    signer: keys.privateKey,
    cairoVersion: '1',
  });

  // Deploy the account
  const { transaction_hash } = await account.deployAccount({
    classHash: keys.classHash,
    constructorCalldata: keys.constructorCalldata,
    addressSalt: keys.publicKey,
  });

  // Wait for deployment to complete
  await provider.waitForTransaction(transaction_hash);

  return { transactionHash: transaction_hash, account };
}

/**
 * Full workflow
 */
async function createNewAccount(): Promise<void> {
  console.log('Creating new Starknet account...\n');

  // Initialize provider
  const provider = await RpcProvider.create({ nodeUrl: RPC_URL });
  const chainId = await provider.getChainId();
  console.log('Network:', chainId);

  // Step 1 & 2: Generate keys and compute address
  const keys = computeAccountAddress();
  console.log('\nGenerated keys:');
  console.log('  Private key:', keys.privateKey);
  console.log('  Public key:', keys.publicKey);
  console.log('  Address:', keys.address);

  // Step 3: Check if address needs funding
  const balance = await checkBalance(provider, keys.address);
  console.log('\nCurrent balance:', balance.toString(), 'wei');

  if (balance === 0n) {
    console.log('\n⚠️  Account needs funding before deployment!');
    console.log('   Send STRK to:', keys.address);
    console.log('   Minimum required: ~0.001 STRK for deployment');
    return;
  }

  // Step 4: Deploy the account
  console.log('\nDeploying account...');
  const { transactionHash, account } = await deployAccount(provider, keys);

  console.log('\n✅ Account deployed successfully!');
  console.log('   Transaction hash:', transactionHash);
  console.log('   Account address:', account.address);

  // Verify deployment
  const nonce = await account.getNonce();
  console.log('   Current nonce:', nonce);
}

/**
 * Connect to existing account
 */
async function connectExistingAccount(
  address: string,
  privateKey: string
): Promise<Account> {
  const provider = await RpcProvider.create({ nodeUrl: RPC_URL });

  const account = new Account({
    provider,
    address,
    signer: privateKey,
    cairoVersion: '1', // Explicit for performance, auto-detected if omitted
  });

  // Verify connection
  const nonce = await account.getNonce();
  console.log('Connected to account:', address);
  console.log('Current nonce:', nonce);

  return account;
}

// Run if executed directly
// createNewAccount().catch(console.error);

export {
  computeAccountAddress,
  checkBalance,
  deployAccount,
  createNewAccount,
  connectExistingAccount,
  type AccountKeys,
};
