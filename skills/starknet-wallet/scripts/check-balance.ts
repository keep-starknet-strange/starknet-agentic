#!/usr/bin/env tsx
/**
 * Check Token Balance
 *
 * Usage: tsx check-balance.ts
 * Requires .env with STARKNET_RPC_URL and STARKNET_ACCOUNT_ADDRESS
 * Optional: STARKNET_RPC_SPEC_VERSION=0.9.0|0.10.0
 * Optional: TOKEN=ETH|STRK|USDC|USDT or TOKEN_ADDRESS=0x...
 */

import 'dotenv/config';
import { RpcProvider, Contract, uint256 } from 'starknet';
import { fetchTokenByAddress, fetchVerifiedTokenBySymbol } from '@avnu/avnu-sdk';

const ERC20_ABI = [{
  name: 'balanceOf',
  type: 'function',
  inputs: [{ name: 'account', type: 'felt' }],
  outputs: [{ name: 'balance', type: 'Uint256' }],
  stateMutability: 'view',
}];

type TokenInfo = {
  address: string;
  symbol: string;
  decimals: number;
};

type SupportedRpcSpecVersion = '0.9.0' | '0.10.0';

function resolveRpcSpecVersion(value: string | undefined): SupportedRpcSpecVersion {
  const normalized = value?.trim();
  if (!normalized || normalized.startsWith('0.9')) {
    return '0.9.0';
  }
  if (normalized.startsWith('0.10')) {
    return '0.10.0';
  }
  throw new Error(
    `Unsupported STARKNET_RPC_SPEC_VERSION: "${normalized}". Expected 0.9.x or 0.10.x`,
  );
}

async function resolveToken(tokenSymbolOrAddress?: string): Promise<TokenInfo> {
  if (!tokenSymbolOrAddress || tokenSymbolOrAddress.toUpperCase() === 'ETH') {
    const token = await fetchVerifiedTokenBySymbol('ETH');
    return { address: token.address, symbol: token.symbol, decimals: token.decimals };
  }

  if (tokenSymbolOrAddress.startsWith('0x')) {
    const token = await fetchTokenByAddress(tokenSymbolOrAddress);
    return { address: token.address, symbol: token.symbol, decimals: token.decimals };
  }

  const token = await fetchVerifiedTokenBySymbol(tokenSymbolOrAddress);
  return { address: token.address, symbol: token.symbol, decimals: token.decimals };
}

async function main() {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const rpcSpecVersion = resolveRpcSpecVersion(process.env.STARKNET_RPC_SPEC_VERSION);
  const address = process.env.STARKNET_ACCOUNT_ADDRESS;
  const tokenInput = process.env.TOKEN || process.env.TOKEN_ADDRESS;

  if (!rpcUrl || !address) {
    console.error('Missing STARKNET_RPC_URL or STARKNET_ACCOUNT_ADDRESS');
    process.exit(1);
  }

  try {
    console.log('Resolving token via avnu...');
    const tokenInfo = await resolveToken(tokenInput);

    console.log('Checking balance...');
    const provider = new RpcProvider({
      nodeUrl: rpcUrl,
      specVersion: rpcSpecVersion,
    });
    const contract = new Contract({ abi: ERC20_ABI, address: tokenInfo.address, providerOrAccount: provider });

    const balanceResult = await contract.balanceOf(address);
    const balanceRaw = balanceResult?.balance ?? balanceResult;
    const balance = typeof balanceRaw === 'bigint'
      ? balanceRaw
      : uint256.uint256ToBN(balanceRaw);
    const formatted = Number(balance) / (10 ** tokenInfo.decimals);

    console.log(`Balance: ${formatted.toFixed(4)} ${tokenInfo.symbol}`);
    console.log(`Address: ${address}`);
    console.log(`Token: ${tokenInfo.address}`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
