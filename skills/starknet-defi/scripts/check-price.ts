#!/usr/bin/env tsx
/**
 * Check Token Price via avnu
 *
 * Usage: npx tsx scripts/check-price.ts ETH USDC
 * Requires .env with STARKNET_RPC_URL
 */

import 'dotenv/config';
import { getQuotes, fetchVerifiedTokenBySymbol } from '@avnu/avnu-sdk';

const TOKENS: Record<string, string> = {
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  USDC: '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8',
  USDT: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
};

const DECIMALS: Record<string, number> = {
  ETH: 18, STRK: 18, USDC: 6, USDT: 6,
};

async function resolveToken(symbol: string): Promise<{ address: string; decimals: number; symbol: string }> {
  const upper = symbol.toUpperCase();
  if (TOKENS[upper]) {
    return { address: TOKENS[upper], decimals: DECIMALS[upper], symbol: upper };
  }
  const token = await fetchVerifiedTokenBySymbol(symbol);
  return { address: token.address, decimals: token.decimals, symbol: token.symbol };
}

async function main() {
  const [sellSymbol = 'ETH', buySymbol = 'USDC'] = process.argv.slice(2);

  const sell = await resolveToken(sellSymbol);
  const buy = await resolveToken(buySymbol);

  const sellAmount = BigInt(10 ** sell.decimals); // 1 unit

  console.log(`\nFetching price: 1 ${sell.symbol} → ${buy.symbol}...`);

  const quotes = await getQuotes({
    sellTokenAddress: sell.address,
    buyTokenAddress: buy.address,
    sellAmount,
  });

  if (!quotes.length) {
    console.error('No quotes available for this pair.');
    process.exit(1);
  }

  const best = quotes[0];
  const buyAmount = Number(best.buyAmount) / (10 ** buy.decimals);

  console.log(`\n  Price: 1 ${sell.symbol} = ${buyAmount.toFixed(6)} ${buy.symbol}`);
  console.log(`  Routes: ${best.routes?.map((r: any) => `${r.name} (${(r.percent * 100).toFixed(0)}%)`).join(', ') || 'N/A'}`);
  console.log(`  Gas (USD): $${best.gasFeesInUsd?.toFixed(4) || 'N/A'}`);
}

main().catch(console.error);
