#!/usr/bin/env tsx
/**
 * Pool / Liquidity Info via avnu
 *
 * Usage: npx tsx scripts/pool-info.ts ETH/STRK
 * Shows best routes and liquidity for a token pair.
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
  const pairArg = process.argv[2] || 'ETH/STRK';
  const [sellSymbol, buySymbol] = pairArg.split('/');
  if (!sellSymbol || !buySymbol) {
    console.error('Usage: npx tsx scripts/pool-info.ts TOKEN_A/TOKEN_B');
    process.exit(1);
  }

  const sell = await resolveToken(sellSymbol);
  const buy = await resolveToken(buySymbol);

  // Probe multiple amounts to show route depth
  const amounts = [0.01, 0.1, 1, 10].map(a => ({
    label: `${a} ${sell.symbol}`,
    sellAmount: BigInt(Math.floor(a * (10 ** sell.decimals))),
  }));

  console.log(`\nPool info: ${sell.symbol}/${buy.symbol}\n`);

  for (const { label, sellAmount } of amounts) {
    try {
      const quotes = await getQuotes({
        sellTokenAddress: sell.address,
        buyTokenAddress: buy.address,
        sellAmount,
      });
      if (!quotes.length) {
        console.log(`  ${label}: No liquidity`);
        continue;
      }
      const best = quotes[0];
      const buyAmount = Number(best.buyAmount) / (10 ** buy.decimals);
      const routes = best.routes?.map((r: any) => `${r.name}(${(r.percent * 100).toFixed(0)}%)`).join(', ') || 'N/A';
      console.log(`  ${label.padEnd(16)} → ${buyAmount.toFixed(6).padStart(14)} ${buy.symbol}  | Routes: ${routes}`);
    } catch {
      console.log(`  ${label}: Error fetching quote`);
    }
  }
}

main().catch(console.error);
