#!/usr/bin/env node
/**
 * avnu-swap.js - AVNU SDK Integration for Starknet Swaps
 * 
 * Default swap handler - uses AVNU SDK for all swap operations.
 * This script receives account info via arguments - NO secrets access.
 * 
 * Usage:
 *   node avnu-swap.js '{"sellToken":"ETH","buyToken":"STRK","sellAmount":"0.001","accountAddress":"0x..."}'
 */

import { getQuotes, executeSwap } from '@avnu/avnu-sdk';
import { RpcProvider, Account, PaymasterRpc } from 'starknet';
import { fileURLToPath } from 'url';
import { resolveRpcUrl } from './_rpc.js';
import { fetchVerifiedTokens } from './_tokens.js';



const DEFAULT_SLIPPAGE = 0.001; // 0.1%

function amountToBigInt(amount, decimals) {
  const dec = Number(decimals ?? 18);
  if (!Number.isInteger(dec) || dec < 0) throw new Error('Invalid decimals');
  const s = String(amount).trim();
  if (!/^\d+(?:\.\d+)?$/.test(s)) throw new Error(`Invalid amount format: ${amount}`);
  const [i, f = ''] = s.split('.');
  if (f.length > dec) throw new Error(`Too many decimal places: ${f.length} > ${dec}`);
  const frac = (f + '0'.repeat(dec)).slice(0, dec);
  const digits = `${i}${frac}`.replace(/^0+(?=\d)/, '');
  return BigInt(digits || '0');
}

/**
 * Fetch all verified tokens from AVNU
 */
async function getAllTokens() {
  return fetchVerifiedTokens();
}

/**
 * Match token symbols to AVNU tokens
 */
async function matchTokens(sellSymbol, buySymbol) {
  const tokens = await getAllTokens();
  const safeTokens = tokens.filter((t) => typeof t?.symbol === 'string' && t.symbol.length > 0);
  const normalizedSell = String(sellSymbol || '').toLowerCase();
  const normalizedBuy = String(buySymbol || '').toLowerCase();
  
  const sellToken = safeTokens.find(t => 
    String(t?.symbol || '').toLowerCase() === normalizedSell
  );
  
  const buyToken = safeTokens.find(t => 
    String(t?.symbol || '').toLowerCase() === normalizedBuy
  );
  
  return { sellToken, buyToken };
}

async function getSwapQuote(sellTokenSymbol, buyTokenSymbol, sellAmount, accountAddress) {
  const { sellToken, buyToken } = await matchTokens(sellTokenSymbol, buyTokenSymbol);
  
  if (!sellToken) throw new Error(`Unknown sell token: ${sellTokenSymbol}`);
  if (!buyToken) throw new Error(`Unknown buy token: ${buyTokenSymbol}`);
  
  // Parse amount with exact decimal conversion
  const amountBigInt = amountToBigInt(sellAmount, sellToken.decimals);
  
  const quotes = await getQuotes({
    sellTokenAddress: sellToken.address,
    buyTokenAddress: buyToken.address,
    sellAmount: amountBigInt,
    takerAddress: accountAddress,
    size: 1,
  });
  
  if (!quotes || quotes.length === 0) {
    throw new Error("No quotes available for this swap");
  }
  
  return { quote: quotes[0], sellToken, buyToken };
}

let cachedPaymaster = null;

function getPaymaster() {
  if (cachedPaymaster) return cachedPaymaster;
  cachedPaymaster = new PaymasterRpc({
    nodeUrl: process.env.PAYMASTER_URL || 'https://starknet.paymaster.avnu.fi',
  });
  return cachedPaymaster;
}

async function executeAvnuSwap(quote, account, slippage = DEFAULT_SLIPPAGE) {
  const result = await executeSwap({
    paymaster: getPaymaster(),
    provider: account,
    quote,
    slippage,
  });
  
  return result;
}

async function main() {
  const rawInput = process.argv[2];
  
  if (!rawInput) {
    console.log(JSON.stringify({
      error: "No input provided",
      usage: 'node avnu-swap.js \'{"sellToken":"ETH","buyToken":"STRK","sellAmount":"0.001","accountAddress":"0x..."}\''
    }));
    process.exit(1);
  }
  
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (e) {
    console.log(JSON.stringify({ error: `Invalid JSON: ${e.message}` }));
    process.exit(1);
  }
  
  const { 
    sellToken, 
    buyToken, 
    sellAmount, 
    slippage = DEFAULT_SLIPPAGE,
    accountAddress,
    privateKey: privateKeyInput
  } = input;
  
  if (!sellToken || !buyToken || !sellAmount) {
    console.log(JSON.stringify({
      error: "Missing required fields: sellToken, buyToken, sellAmount"
    }));
    process.exit(1);
  }
  
  const privateKey = privateKeyInput || process.env.PRIVATE_KEY;
  if (!accountAddress || !privateKey) {
    console.log(JSON.stringify({
      error: "Missing required fields: accountAddress and private key (input.privateKey or PRIVATE_KEY env)"
    }));
    process.exit(1);
  }
  
  // Create account from passed arguments (no secrets access)
  const rpcUrl = resolveRpcUrl();
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey
  });
  
  try {
    const emitProgress = (payload) => {
      console.error(JSON.stringify(payload));
    };

    // Step 1: Get quote
    emitProgress({
      step: "quote",
      status: "fetching",
      sellToken,
      buyToken,
      sellAmount
    });
    
    const { quote, sellToken: sellTokenData, buyToken: buyTokenData } = await getSwapQuote(sellToken, buyToken, sellAmount, account.address);
    
    emitProgress({
      step: "quote",
      status: "success",
      buyAmount: quote.buyAmount.toString(),
      gasFees: quote.gasFees.toString(),
      routes: quote.routes,
      sellToken,
      buyToken,
      sellTokenAddress: sellTokenData.address,
      buyTokenAddress: buyTokenData.address
    });
    
    // Step 2: Execute swap
    emitProgress({
      step: "execute",
      status: "executing",
      slippage: `${slippage * 100}%`
    });
    
    const result = await executeAvnuSwap(quote, account, slippage);
    
    // Single machine-readable payload on stdout for downstream parsers
    console.log(JSON.stringify({
      success: true,
      transactionHash: result.transactionHash,
      sellToken,
      buyToken,
      sellAmount,
      buyAmount: quote.buyAmount.toString(),
      gasFees: quote.gasFees.toString(),
      sellTokenAddress: sellTokenData.address,
      buyTokenAddress: buyTokenData.address,
      explorer: `https://starkscan.co/tx/${result.transactionHash}`
    }));
    
  } catch (err) {
    console.log(JSON.stringify({
      error: err.message,
      step: err.step || "unknown"
    }));
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
}

// Export for use as module
export { getSwapQuote, executeAvnuSwap, matchTokens, getAllTokens };
