#!/usr/bin/env node
/**
 * avnu-swap.js - AVNU SDK Integration for Starknet Swaps
 * 
 * Default swap handler - uses AVNU SDK for all swap operations.
 * This script receives account info via arguments - NO secrets access.
 * 
 * Gas is paid through the AVNU paymaster in "default" fee mode (no API key):
 * the fee is taken in `gasToken` (defaults to the sell token) instead of STRK.
 * 
 * Usage:
 *   node avnu-swap.js '{"sellToken":"ETH","buyToken":"STRK","sellAmount":"0.001","accountAddress":"0x..."}'
 *   node avnu-swap.js '{"sellToken":"ETH","buyToken":"USDC","sellAmount":"0.001","gasToken":"STRK","accountAddress":"0x..."}'
 */

import { getQuotes, executeSwap } from '@avnu/avnu-sdk';
import { RpcProvider, Account, PaymasterRpc } from 'starknet';
import { fileURLToPath } from 'url';
import { resolveRpcUrl } from './_rpc.js';
import { fetchVerifiedTokens } from './_tokens.js';
import { loadPrivateKeyByAccountAddress } from './_keys.js';



const DEFAULT_SLIPPAGE = 0.001; // 0.1%

function amountToBigInt(amount, decimals) {
  const dec = Number(decimals ?? 18);
  if (!Number.isInteger(dec) || dec < 0 || dec > 255) throw new Error('Invalid decimals');
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
  const tokens = (await getAllTokens()).filter(t => typeof t?.symbol === 'string' && t.symbol.length > 0);
  const sellNeedle = String(sellSymbol || '').toLowerCase();
  const buyNeedle = String(buySymbol || '').toLowerCase();

  const sellToken = tokens.find(t =>
    String(t?.symbol || '').toLowerCase() === sellNeedle
  );

  const buyToken = tokens.find(t =>
    String(t?.symbol || '').toLowerCase() === buyNeedle
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
    size: 3, // Get top 3 quotes for comparison
  });
  
  if (!quotes || quotes.length === 0) {
    throw new Error("No quotes available for this swap");
  }
  
  return { quote: quotes[0], sellToken, buyToken };
}

/**
 * Resolve the token that pays gas through the paymaster.
 * Defaults to the sell token, which the account is known to hold.
 */
async function resolveGasToken(gasTokenSymbol, sellToken) {
  if (!gasTokenSymbol) return sellToken;
  const needle = String(gasTokenSymbol).toLowerCase();
  const gasToken = (await getAllTokens()).find(t =>
    String(t?.symbol || '').toLowerCase() === needle
  );
  if (!gasToken) throw new Error(`Unknown gas token: ${gasTokenSymbol}`);
  return gasToken;
}

const DEFAULT_PAYMASTER_URL = 'https://starknet.paymaster.avnu.fi';
const ALLOWED_PAYMASTER_HOSTS = new Set([
  'starknet.paymaster.avnu.fi',
  'sepolia.paymaster.avnu.fi'
]);

function resolvePaymasterUrl() {
  const value = process.env.PAYMASTER_URL || DEFAULT_PAYMASTER_URL;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid PAYMASTER_URL: ${value}`);
  }
  if (!ALLOWED_PAYMASTER_HOSTS.has(parsed.hostname)) {
    throw new Error(`Untrusted paymaster host: ${parsed.hostname}`);
  }
  return parsed.toString();
}

let paymaster = null;

async function executeAvnuSwap(quote, account, slippage = DEFAULT_SLIPPAGE, gasTokenAddress = quote.sellTokenAddress) {
  if (!paymaster) throw new Error('Paymaster not initialized');
  if (!gasTokenAddress) throw new Error('Missing gas token address');

  // avnu-sdk only takes the paymaster path when `paymaster.active` is set;
  // a bare PaymasterRpc is ignored and the account pays its own gas.
  const result = await executeSwap({
    paymaster: {
      active: true,
      provider: paymaster,
      params: {
        version: '0x1',
        feeMode: { mode: 'default', gasToken: gasTokenAddress },
      },
    },
    provider: account,
    quote,
    slippage,
    executeApprove: true,
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
    gasToken,
    accountAddress
  } = input;
  
  if (!sellToken || !buyToken || !sellAmount) {
    console.log(JSON.stringify({
      error: "Missing required fields: sellToken, buyToken, sellAmount"
    }));
    process.exit(1);
  }
  
  if (!accountAddress) {
    console.log(JSON.stringify({
      error: "Missing required field: accountAddress"
    }));
    process.exit(1);
  }

  if (input.privateKey) {
    console.log(JSON.stringify({ error: 'Do not pass privateKey in JSON input.' }));
    process.exit(1);
  }

  const privateKey = loadPrivateKeyByAccountAddress(accountAddress);

  try {
    paymaster = new PaymasterRpc({
      nodeUrl: resolvePaymasterUrl(),
    });
  } catch (err) {
    console.log(JSON.stringify({
      error: `Paymaster initialization failed: ${err.message}`,
      nextStep: 'CONFIGURE_PAYMASTER'
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
    // Step 1: Get quote
    console.error(JSON.stringify({
      step: "quote",
      status: "fetching",
      sellToken,
      buyToken,
      sellAmount
    }));
    
    const { quote, sellToken: sellTokenData, buyToken: buyTokenData } = await getSwapQuote(sellToken, buyToken, sellAmount, account.address);
    
    console.error(JSON.stringify({
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
    
    const gasTokenData = await resolveGasToken(gasToken, sellTokenData);
    
    // Step 2: Execute swap
    console.error(JSON.stringify({
      step: "execute",
      status: "executing",
      slippage: `${slippage * 100}%`,
      feeMode: "default",
      gasToken: gasTokenData.symbol
    }));
    
    const result = await executeAvnuSwap(quote, account, slippage, gasTokenData.address);
    
    console.log(JSON.stringify({
      success: true,
      step: "execute",
      status: "success",
      transactionHash: result.transactionHash,
      sellToken,
      buyToken,
      sellAmount,
      buyAmount: quote.buyAmount.toString(),
      gasFees: quote.gasFees.toString(),
      sellTokenAddress: sellTokenData.address,
      buyTokenAddress: buyTokenData.address,
      feeMode: "default",
      gasToken: gasTokenData.symbol,
      gasTokenAddress: gasTokenData.address,
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
export { getSwapQuote, executeAvnuSwap, matchTokens, getAllTokens, resolveGasToken };
