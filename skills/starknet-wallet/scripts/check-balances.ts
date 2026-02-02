#!/usr/bin/env tsx
/**
 * Check Multiple Token Balances (Batch)
 *
 * Tests the batch balance fetching logic from starknet-mcp-server.
 * Uses BalanceChecker contract with fallback to batch RPC.
 *
 * Usage: tsx check-balances.ts
 * Requires .env with STARKNET_RPC_URL and STARKNET_ACCOUNT_ADDRESS
 */

import 'dotenv/config';
import { RpcProvider, Contract } from 'starknet';

const TOKENS = {
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  USDC: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
  USDT: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
};

const BALANCE_CHECKER_ADDRESS = '0x031ce64a666fbf9a2b1b2ca51c2af60d9a76d3b85e5fbfb9d5a8dbd3fedc9716';

const BALANCE_CHECKER_ABI = [
  {
    type: 'struct',
    name: 'core::integer::u256',
    members: [
      { name: 'low', type: 'core::integer::u128' },
      { name: 'high', type: 'core::integer::u128' },
    ],
  },
  {
    type: 'struct',
    name: 'governance::balance_checker::NonZeroBalance',
    members: [
      { name: 'token', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'balance', type: 'core::integer::u256' },
    ],
  },
  {
    type: 'function',
    name: 'get_balances',
    inputs: [
      { name: 'address', type: 'core::starknet::contract_address::ContractAddress' },
      { name: 'tokens', type: 'core::array::Span::<core::starknet::contract_address::ContractAddress>' },
    ],
    outputs: [
      { type: 'core::array::Span::<governance::balance_checker::NonZeroBalance>' },
    ],
    state_mutability: 'view',
  },
];

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

function normalizeAddress(addr: string): string {
  return '0x' + BigInt(addr).toString(16).padStart(64, '0');
}

function formatAmount(amount: bigint, decimals: number): string {
  const str = amount.toString().padStart(decimals + 1, '0');
  const intPart = str.slice(0, -decimals) || '0';
  const decPart = str.slice(-decimals);
  return `${intPart}.${decPart.slice(0, 6)}`;
}

type TokenBalanceResult = {
  token: string;
  tokenAddress: string;
  balance: bigint;
  decimals: number;
};

async function fetchViaBalanceChecker(
  provider: RpcProvider,
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[]
): Promise<TokenBalanceResult[]> {
  const balanceChecker = new Contract(BALANCE_CHECKER_ABI, BALANCE_CHECKER_ADDRESS, provider);
  const result = await balanceChecker.get_balances(walletAddress, tokenAddresses);

  // BalanceChecker returns array of NonZeroBalance { token, balance }
  // Only tokens with non-zero balance are returned
  // starknet.js converts u256 to bigint automatically
  const balanceMap = new Map<string, bigint>();
  for (const item of result) {
    const addr = normalizeAddress('0x' + BigInt(item.token).toString(16));
    balanceMap.set(addr, BigInt(item.balance));
  }

  const batchProvider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL!, batch: 0 });
  const decimalsResults = await Promise.all(
    tokenAddresses.map(async (addr) => {
      const contract = new Contract(ERC20_ABI, addr, batchProvider);
      return Number(await contract.decimals());
    })
  );

  return tokens.map((token, i) => ({
    token,
    tokenAddress: tokenAddresses[i],
    balance: balanceMap.get(normalizeAddress(tokenAddresses[i])) ?? BigInt(0),
    decimals: decimalsResults[i],
  }));
}

async function fetchViaBatchRpc(
  walletAddress: string,
  tokens: string[],
  tokenAddresses: string[]
): Promise<TokenBalanceResult[]> {
  const batchProvider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL!, batch: 0 });

  const results = await Promise.all(
    tokenAddresses.map(async (addr) => {
      const contract = new Contract(ERC20_ABI, addr, batchProvider);
      const [balanceResult, decimals] = await Promise.all([
        contract.balanceOf(walletAddress),
        contract.decimals(),
      ]);
      // starknet.js v6 returns { balance: bigint }
      const balance = typeof balanceResult === 'bigint' ? balanceResult : balanceResult.balance;
      return {
        balance,
        decimals: Number(decimals),
      };
    })
  );

  return tokens.map((token, i) => ({
    token,
    tokenAddress: tokenAddresses[i],
    balance: results[i].balance,
    decimals: results[i].decimals,
  }));
}

async function main() {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const address = process.env.STARKNET_ACCOUNT_ADDRESS;

  if (!rpcUrl || !address) {
    console.error('❌ Missing STARKNET_RPC_URL or STARKNET_ACCOUNT_ADDRESS');
    process.exit(1);
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const tokens = Object.keys(TOKENS) as (keyof typeof TOKENS)[];
  const tokenAddresses = tokens.map((t) => TOKENS[t]);

  console.log(`🔍 Checking balances for ${address}\n`);
  console.log(`Tokens: ${tokens.join(', ')}\n`);

  // Try BalanceChecker first
  let balances: TokenBalanceResult[];
  let method: string;

  try {
    console.log('📦 Trying BalanceChecker contract...');
    balances = await fetchViaBalanceChecker(provider, address, tokens, tokenAddresses);
    method = 'balance_checker';
    console.log('✅ BalanceChecker succeeded\n');
  } catch (err) {
    console.log(`⚠️  BalanceChecker failed: ${err instanceof Error ? err.message : err}`);
    console.log('📦 Falling back to batch RPC...');
    balances = await fetchViaBatchRpc(address, tokens, tokenAddresses);
    method = 'batch_rpc';
    console.log('✅ Batch RPC succeeded\n');
  }

  console.log('━'.repeat(60));
  console.log('Token'.padEnd(8) + 'Balance'.padEnd(20) + 'Raw');
  console.log('━'.repeat(60));

  for (const b of balances) {
    const formatted = formatAmount(b.balance, b.decimals);
    console.log(
      b.token.padEnd(8) +
      formatted.padEnd(20) +
      b.balance.toString()
    );
  }

  console.log('━'.repeat(60));
  console.log(`\nMethod: ${method}`);
  console.log(`Tokens queried: ${tokens.length}`);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
