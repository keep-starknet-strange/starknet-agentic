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
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';
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

function getSecretsDir() {
  return join(homedir(), '.openclaw', 'secrets', 'starknet');
}

function loadPrivateKeyByAccountAddress(accountAddress) {
  const dir = getSecretsDir();
  if (!existsSync(dir)) throw new Error('Missing secrets directory: ~/.openclaw/secrets/starknet');

  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const target = String(accountAddress).toLowerCase();

  for (const file of files) {
    const accountPath = join(dir, file);
    let data;
    try {
      data = JSON.parse(readFileSync(accountPath, 'utf8'));
    } catch {
      continue;
    }

    if (String(data.address || '').toLowerCase() !== target) continue;

    if (!(typeof data.privateKeyPath === 'string' && data.privateKeyPath.trim().length > 0)) {
      throw new Error('Account is missing privateKeyPath (file-based key is required).');
    }

    const keyPath = isAbsolute(data.privateKeyPath)
      ? data.privateKeyPath
      : join(dir, data.privateKeyPath);

    if (!existsSync(keyPath)) throw new Error(`Private key file not found: ${keyPath}`);
    const privateKey = readFileSync(keyPath, 'utf8').trim();
    if (!privateKey) throw new Error('Private key file is empty.');
    return privateKey;
  }

  throw new Error(`Account not found in ~/.openclaw/secrets/starknet for address: ${accountAddress}`);
}

const paymaster = new PaymasterRpc({
  nodeUrl: resolvePaymasterUrl(),
});

async function executeAvnuSwap(quote, account, slippage = DEFAULT_SLIPPAGE) {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.log(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
}

// Export for use as module
export { getSwapQuote, executeAvnuSwap, matchTokens, getAllTokens };
