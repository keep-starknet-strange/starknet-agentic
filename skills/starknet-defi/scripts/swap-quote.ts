#!/usr/bin/env tsx
/**
 * Get Swap Quote via avnu
 *
 * Usage: npx tsx scripts/swap-quote.ts ETH USDC 0.1
 * Requires .env with STARKNET_RPC_URL and AGENT_ADDRESS
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
  const [sellSymbol, buySymbol, amountStr] = process.argv.slice(2);
  if (!sellSymbol || !buySymbol || !amountStr) {
    console.error('Usage: npx tsx scripts/swap-quote.ts <SELL_TOKEN> <BUY_TOKEN> <AMOUNT>');
    console.error('Example: npx tsx scripts/swap-quote.ts ETH USDC 0.1');
    process.exit(1);
  }

  const sell = await resolveToken(sellSymbol);
  const buy = await resolveToken(buySymbol);
  const amount = parseFloat(amountStr);
  const sellAmount = BigInt(Math.floor(amount * (10 ** sell.decimals)));

  const takerAddress = process.env.AGENT_ADDRESS || '0x0';

  console.log(`\nFetching quote: ${amount} ${sell.symbol} → ${buy.symbol}...`);

  const quotes = await getQuotes({
    sellTokenAddress: sell.address,
    buyTokenAddress: buy.address,
    sellAmount,
    takerAddress,
  });

  if (!quotes.length) {
    console.error('No quotes available.');
    process.exit(1);
  }

  const best = quotes[0];
  const buyAmount = Number(best.buyAmount) / (10 ** buy.decimals);

  console.log(`\n  Sell:         ${amount} ${sell.symbol}`);
  console.log(`  Receive:      ${buyAmount.toFixed(6)} ${buy.symbol}`);
  console.log(`  Rate:         1 ${sell.symbol} = ${(buyAmount / amount).toFixed(6)} ${buy.symbol}`);
  console.log(`  Sell (USD):   $${best.sellAmountInUsd?.toFixed(2) || 'N/A'}`);
  console.log(`  Buy (USD):    $${best.buyAmountInUsd?.toFixed(2) || 'N/A'}`);
  console.log(`  Price Impact: ${best.priceImpact != null ? (best.priceImpact / 100).toFixed(2) + '%' : 'N/A'}`);
  console.log(`  Gas (USD):    $${best.gasFeesInUsd?.toFixed(4) || 'N/A'}`);
  console.log(`  Routes:       ${best.routes?.map((r: any) => `${r.name} (${(r.percent * 100).toFixed(0)}%)`).join(', ') || 'N/A'}`);
  console.log(`  Quote ID:     ${best.quoteId}`);
}

main().catch(console.error);
