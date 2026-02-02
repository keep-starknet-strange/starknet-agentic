#!/usr/bin/env tsx
/**
 * Check Token Balance
 *
 * Usage: tsx check-balance.ts
 * Requires .env with STARKNET_RPC_URL and STARKNET_ACCOUNT_ADDRESS
 * Optional: TOKEN_ADDRESS=0x... (defaults to ETH)
 */

import 'dotenv/config';
import { RpcProvider, Contract, uint256 } from 'starknet';

const ETH = '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7';
const STRK = '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d';

const ERC20_ABI = [{
  name: 'balanceOf',
  type: 'function',
  inputs: [{ name: 'account', type: 'felt' }],
  outputs: [{ name: 'balance', type: 'Uint256' }],
  stateMutability: 'view',
}, {
  name: 'decimals',
  type: 'function',
  inputs: [],
  outputs: [{ name: 'decimals', type: 'felt' }],
  stateMutability: 'view',
}];

async function main() {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const address = process.env.STARKNET_ACCOUNT_ADDRESS;
  const token = process.env.TOKEN_ADDRESS || ETH;

  if (!rpcUrl || !address) {
    console.error('❌ Missing STARKNET_RPC_URL or STARKNET_ACCOUNT_ADDRESS');
    process.exit(1);
  }

  try {
    console.log('🔍 Checking balance...');
    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const contract = new Contract(ERC20_ABI, token, provider);

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
    ]);

    const balanceBigInt = uint256.uint256ToBN(balance);
    const formatted = Number(balanceBigInt) / (10 ** Number(decimals));

    console.log(`✅ Balance: ${formatted.toFixed(4)} tokens`);
    console.log(`   Address: ${address}`);
    console.log(`   Token: ${token}`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
