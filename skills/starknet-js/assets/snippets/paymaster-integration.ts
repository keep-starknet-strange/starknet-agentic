/**
 * Starknet Paymaster Integration Template
 *
 * This template demonstrates:
 * - Sponsored transactions (dApp pays gas)
 * - Alternative gas tokens (user pays with USDC, etc.)
 * - Time-bounded execution
 *
 * Install: npm install starknet
 */

import {
  RpcProvider,
  Account,
  PaymasterRpc,
  Contract,
  CallData,
  cairo,
  type Call,
  type PaymasterDetails,
} from 'starknet';

// Configuration
const RPC_URL = 'https://starknet-sepolia.public.blastapi.io/rpc/v0_8';
const PAYMASTER_URL = 'https://sepolia.paymaster.avnu.fi';

// Common token addresses (Sepolia)
const TOKENS = {
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  USDC: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080',
};

/**
 * Create account with paymaster support
 */
async function createPaymasterAccount(
  address: string,
  privateKey: string
): Promise<Account> {
  const provider = await RpcProvider.create({ nodeUrl: RPC_URL });

  // Initialize paymaster
  const paymaster = new PaymasterRpc({
    nodeUrl: PAYMASTER_URL,
  });

  // Create account with paymaster
  const account = new Account({
    provider,
    address,
    signer: privateKey,
    paymaster,
  });

  return account;
}

/**
 * Get supported gas tokens from paymaster
 */
async function getSupportedTokens(account: Account): Promise<void> {
  if (!account.paymaster) {
    throw new Error('Account has no paymaster configured');
  }

  const tokens = await account.paymaster.getSupportedTokens();

  console.log('Supported gas tokens:');
  tokens.forEach((token) => {
    console.log(`  ${token.token_address}`);
    console.log(`    Decimals: ${token.decimals}`);
    console.log(`    Price in STRK: ${token.priceInStrk}`);
  });
}

/**
 * Execute sponsored transaction (dApp pays gas)
 */
async function executeSponsoredTransaction(
  account: Account,
  calls: Call[]
): Promise<string> {
  const feeDetails: PaymasterDetails = {
    feeMode: { mode: 'sponsored' },
  };

  const { transaction_hash } = await account.executePaymasterTransaction(
    calls,
    feeDetails
  );

  console.log('Sponsored transaction submitted:', transaction_hash);

  // Wait for confirmation
  await account.waitForTransaction(transaction_hash);
  console.log('Transaction confirmed!');

  return transaction_hash;
}

/**
 * Execute transaction with alternative gas token
 */
async function executeWithGasToken(
  account: Account,
  calls: Call[],
  gasTokenAddress: string
): Promise<string> {
  const feeDetails: PaymasterDetails = {
    feeMode: {
      mode: 'default',
      gasToken: gasTokenAddress,
    },
  };

  // Estimate fee in gas token
  const feeEstimate = await account.estimatePaymasterTransactionFee(
    calls,
    feeDetails
  );

  console.log('Fee estimate:');
  console.log(`  Gas token amount: ${feeEstimate.suggested_max_fee_in_gas_token}`);
  console.log(`  Overall fee: ${feeEstimate.overall_fee}`);

  // Execute with the estimated fee
  const { transaction_hash } = await account.executePaymasterTransaction(
    calls,
    feeDetails,
    feeEstimate.suggested_max_fee_in_gas_token
  );

  console.log('Transaction submitted:', transaction_hash);

  await account.waitForTransaction(transaction_hash);
  console.log('Transaction confirmed!');

  return transaction_hash;
}

/**
 * Execute time-bounded transaction
 */
async function executeTimeBoundedTransaction(
  account: Account,
  calls: Call[],
  validForSeconds: number = 300 // 5 minutes default
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const feeDetails: PaymasterDetails = {
    feeMode: { mode: 'sponsored' },
    timeBounds: {
      executeAfter: now,
      executeBefore: now + validForSeconds,
    },
  };

  const { transaction_hash } = await account.executePaymasterTransaction(
    calls,
    feeDetails
  );

  console.log('Time-bounded transaction submitted:', transaction_hash);
  console.log(`  Valid from: ${new Date(now * 1000).toISOString()}`);
  console.log(`  Valid until: ${new Date((now + validForSeconds) * 1000).toISOString()}`);

  await account.waitForTransaction(transaction_hash);
  console.log('Transaction confirmed!');

  return transaction_hash;
}

/**
 * Example: Transfer tokens with paymaster
 */
async function transferWithPaymaster(
  account: Account,
  tokenAddress: string,
  recipient: string,
  amount: bigint,
  useSponsored: boolean = true
): Promise<string> {
  // Minimal ERC20 ABI for transfer
  const erc20Abi = [
    {
      name: 'transfer',
      type: 'function',
      inputs: [
        { name: 'recipient', type: 'felt' },
        { name: 'amount', type: 'Uint256' },
      ],
      outputs: [{ name: 'success', type: 'felt' }],
    },
  ];

  const contract = new Contract(erc20Abi, tokenAddress, account);

  const call = contract.populate('transfer', {
    recipient,
    amount: cairo.uint256(amount),
  });

  if (useSponsored) {
    return executeSponsoredTransaction(account, [call]);
  } else {
    // Pay with USDC instead of STRK
    return executeWithGasToken(account, [call], TOKENS.USDC);
  }
}

/**
 * Example: Multicall with paymaster
 */
async function multicallWithPaymaster(
  account: Account,
  tokenAddress: string,
  spenderAddress: string,
  amount: bigint
): Promise<string> {
  const erc20Abi = [
    {
      name: 'approve',
      type: 'function',
      inputs: [
        { name: 'spender', type: 'felt' },
        { name: 'amount', type: 'Uint256' },
      ],
      outputs: [{ name: 'success', type: 'felt' }],
    },
  ];

  const contract = new Contract(erc20Abi, tokenAddress, account);

  // Approve + any other operation in single tx
  const approveCall = contract.populate('approve', {
    spender: spenderAddress,
    amount: cairo.uint256(amount),
  });

  const feeDetails: PaymasterDetails = {
    feeMode: { mode: 'sponsored' },
  };

  const { transaction_hash } = await account.executePaymasterTransaction(
    [approveCall],
    feeDetails
  );

  await account.waitForTransaction(transaction_hash);
  return transaction_hash;
}

/**
 * Check if paymaster is available
 */
async function checkPaymasterAvailability(account: Account): Promise<boolean> {
  if (!account.paymaster) {
    console.log('No paymaster configured');
    return false;
  }

  const isAvailable = await account.paymaster.isAvailable();
  console.log('Paymaster available:', isAvailable);
  return isAvailable;
}

/**
 * Full example workflow
 */
async function main() {
  // Replace with your account details
  const ACCOUNT_ADDRESS = '0x...';
  const PRIVATE_KEY = '0x...';
  const RECIPIENT = '0x...';

  try {
    // Create account with paymaster
    const account = await createPaymasterAccount(ACCOUNT_ADDRESS, PRIVATE_KEY);
    console.log('Account created with paymaster support');

    // Check paymaster availability
    const available = await checkPaymasterAvailability(account);
    if (!available) {
      console.log('Paymaster not available, falling back to regular transaction');
      return;
    }

    // Get supported tokens
    await getSupportedTokens(account);

    // Example: Sponsored transfer (dApp pays gas)
    console.log('\n--- Sponsored Transfer ---');
    const txHash1 = await transferWithPaymaster(
      account,
      TOKENS.STRK,
      RECIPIENT,
      1000000000000000n, // 0.001 STRK
      true // sponsored
    );
    console.log('Sponsored transfer complete:', txHash1);

    // Example: Transfer paying with USDC
    console.log('\n--- Transfer with USDC gas ---');
    const txHash2 = await transferWithPaymaster(
      account,
      TOKENS.STRK,
      RECIPIENT,
      1000000000000000n,
      false // pay with USDC
    );
    console.log('USDC gas transfer complete:', txHash2);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Uncomment to run
// main();

export {
  createPaymasterAccount,
  getSupportedTokens,
  executeSponsoredTransaction,
  executeWithGasToken,
  executeTimeBoundedTransaction,
  transferWithPaymaster,
  multicallWithPaymaster,
  checkPaymasterAvailability,
  TOKENS,
};
