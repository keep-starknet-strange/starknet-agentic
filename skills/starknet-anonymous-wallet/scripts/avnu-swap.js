#!/usr/bin/env node
/**
 * avnu-swap.js - AVNU SDK Integration for Starknet Swaps
 * 
 * Default swap handler - uses AVNU SDK for all swap operations.
 * This script receives account info via arguments - NO secrets access.
 * 
 * Usage:
 *   node avnu-swap.js '{"sellToken":"ETH","buyToken":"STRK","sellAmount":"0.001","accountAddress":"0x...","privateKey":"0x..."}'
 */

import { getQuotes, executeSwap, fetchTokens } from '@avnu/avnu-sdk';
import { RpcProvider, Account, PaymasterRpc } from 'starknet';
import { resolveRpcUrl } from './_rpc.js';



// Token cache to avoid repeated API calls
let tokenCache = null;
let lastTokenFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all verified tokens from AVNU
 */
async function getAllTokens() {
  const now = Date.now();
  if (tokenCache && (now - lastTokenFetch) < CACHE_TTL) {
    return tokenCache;
  }
  
  const tokens = await fetchTokens({
    page: 0,
    size: 200, // Get up to 200 tokens
    tags: ['Verified']
  });
  
  tokenCache = tokens.content || [];
  lastTokenFetch = now;
  return tokenCache;
}

/**
 * Match token symbols to AVNU tokens
 */
async function matchTokens(sellSymbol, buySymbol) {
  const tokens = await getAllTokens();
  
  const sellToken = tokens.find(t => 
    t.symbol.toLowerCase() === sellSymbol.toLowerCase()
  );
  
  const buyToken = tokens.find(t => 
    t.symbol.toLowerCase() === buySymbol.toLowerCase()
  );
  
  return { sellToken, buyToken };
}

async function getSwapQuote(sellTokenSymbol, buyTokenSymbol, sellAmount, accountAddress) {
  const { sellToken, buyToken } = await matchTokens(sellTokenSymbol, buyTokenSymbol);
  
  if (!sellToken) throw new Error(`Unknown sell token: ${sellTokenSymbol}`);
  if (!buyToken) throw new Error(`Unknown buy token: ${buyTokenSymbol}`);
  
  // Parse amount with correct decimals
  const amountBigInt = BigInt(Math.floor(parseFloat(sellAmount) * (10 ** sellToken.decimals)));
  
  const quotes = await getQuotes({
    sellTokenAddress: sellToken.address,
    buyTokenAddress: buyToken.address,
    sellAmount: amountBigInt,
    takerAddress: accountAddress,
    size: 3, // Get top 3 quotes for comparison
  });
  
  if (!quotes || quotes.length === 0) {
    throw new Error("No quotes available for this swap");
  }
  
  return { quote: quotes[0], sellToken, buyToken };
}

const paymaster = new PaymasterRpc({
  nodeUrl: 'https://starknet.paymaster.avnu.fi',
});

async function executeAvnuSwap(quote, account, slippage = 0.01) {
  const result = await executeSwap({
    paymaster: paymaster,
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
      usage: 'node avnu-swap.js \'{"sellToken":"ETH","buyToken":"STRK","sellAmount":"0.001","accountAddress":"0x...","privateKey":"0x..."}\''
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
    slippage = 0.001,
    accountAddress,
    privateKey
  } = input;
  
  if (!sellToken || !buyToken || !sellAmount) {
    console.log(JSON.stringify({
      error: "Missing required fields: sellToken, buyToken, sellAmount"
    }));
    process.exit(1);
  }
  
  if (!accountAddress || !privateKey) {
    console.log(JSON.stringify({
      error: "Missing required fields: accountAddress, privateKey (passed from resolve-smart.js)"
    }));
    process.exit(1);
  }
  
  // Create account from passed arguments (no secrets access)
  const rpcUrl = resolveRpcUrl();
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account(
    provider,
    accountAddress,
    privateKey
  );
  
  try {
    // Step 1: Get quote
    console.log(JSON.stringify({
      step: "quote",
      status: "fetching",
      sellToken,
      buyToken,
      sellAmount
    }));
    
    const { quote, sellToken: sellTokenData, buyToken: buyTokenData } = await getSwapQuote(sellToken, buyToken, sellAmount, account.address);
    
    console.log(JSON.stringify({
      step: "quote",
      status: "success",
      buyAmount: quote.buyAmount.toString(),
      gasFees: quote.gasFees.toString(),
      routes: quote.routes,
      sellToken,
      buyToken,
      sellTokenAddress: sellTokenData.address,
      buyTokenAddress: buyTokenData.address
    }));
    
    // Step 2: Execute swap
    console.log(JSON.stringify({
      step: "execute",
      status: "executing",
      slippage: `${slippage * 100}%`
    }));
    
    const result = await executeAvnuSwap(quote, account, slippage);
    
    console.log(JSON.stringify({
      step: "execute",
      status: "success",
      transactionHash: result.transactionHash,
      sellToken,
      buyToken,
      sellAmount,
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

main().catch(err => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});

// Export for use as module
export { getSwapQuote, executeAvnuSwap, matchTokens, getAllTokens };