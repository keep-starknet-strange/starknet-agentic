#!/usr/bin/env node
/**
 * avnu-swap.js - AVNU SDK Integration for Starknet Swaps
 * 
 * Default swap handler - uses AVNU SDK for all swap operations.
 * This script receives account info via arguments - NO secrets access.
 * 
 * The network comes from the RPC's chain ID (see _network.js): SN_MAIN uses the
 * mainnet AVNU API and paymaster, SN_SEPOLIA the Sepolia ones, and any other
 * chain ID is refused before AVNU is called.
 *
 * Gas is paid through the AVNU paymaster in "default" fee mode (no API key):
 * the fee is taken in `gasToken` (defaults to the sell token) instead of STRK.
 * The account only signs paymaster typed data after starknet.js has checked
 * that it carries exactly the AVNU swap calls plus one gas-token fee transfer
 * no larger than the fee cap.
 *
 * Usage:
 *   node avnu-swap.js '{"sellToken":"ETH","buyToken":"STRK","sellAmount":"0.001","accountAddress":"0x..."}'
 *   node avnu-swap.js '{"sellToken":"ETH","buyToken":"USDC","sellAmount":"0.001","gasToken":"STRK","accountAddress":"0x..."}'
 *   node avnu-swap.js '{"sellToken":"STRK","buyToken":"ETH","sellAmount":"10","maxGasFee":"0.5","accountAddress":"0x..."}'
 */

import { getQuotes, quoteToCalls } from '@avnu/avnu-sdk';
import { RpcProvider, Account, PaymasterRpc } from 'starknet';
import { fileURLToPath } from 'url';
import { resolveRpcUrl } from './_rpc.js';
import { fetchVerifiedTokens } from './_tokens.js';
import { NETWORKS, getNetwork, avnuOptions } from './_network.js';
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
 * Fetch all verified tokens on `network` from AVNU
 */
async function getAllTokens(network) {
  const tokens = await fetchVerifiedTokens(network);
  if (tokens.length === 0) {
    throw new Error(`AVNU returned no verified tokens for ${network.name}; token symbols cannot be resolved`);
  }
  return tokens;
}

/**
 * Match token symbols to AVNU tokens on `network`
 */
async function matchTokens(sellSymbol, buySymbol, network) {
  const tokens = (await getAllTokens(network)).filter(t => typeof t?.symbol === 'string' && t.symbol.length > 0);
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

async function getSwapQuote(sellTokenSymbol, buyTokenSymbol, sellAmount, accountAddress, network) {
  const { sellToken, buyToken } = await matchTokens(sellTokenSymbol, buyTokenSymbol, network);
  
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
  }, avnuOptions(network));
  
  if (!quotes || quotes.length === 0) {
    throw new Error(`No quotes available for this swap on ${network.name}`);
  }
  
  return { quote: quotes[0], sellToken, buyToken };
}

/**
 * Resolve the token that pays gas through the paymaster.
 * Defaults to the sell token, which the account is known to hold.
 */
async function resolveGasToken(gasTokenSymbol, sellToken, network) {
  if (!gasTokenSymbol) return sellToken;
  const needle = String(gasTokenSymbol).toLowerCase();
  const gasToken = (await getAllTokens(network)).find(t =>
    String(t?.symbol || '').toLowerCase() === needle
  );
  if (!gasToken) throw new Error(`Unknown gas token: ${gasTokenSymbol}`);
  return gasToken;
}

const ALLOWED_PAYMASTER_HOSTS = new Set(
  Object.values(NETWORKS).map(n => n.paymasterHost)
);

function assertAllowedPaymasterUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid paymaster URL: ${value}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Paymaster URL must use https: ${value}`);
  }
  if (!ALLOWED_PAYMASTER_HOSTS.has(parsed.hostname)) {
    throw new Error(`Untrusted paymaster host: ${parsed.hostname}`);
  }
  return parsed.toString();
}

/**
 * Like assertAllowedPaymasterUrl, but also rejects the other network's paymaster.
 */
function assertPaymasterUrlForNetwork(value, network) {
  const url = assertAllowedPaymasterUrl(value);
  const host = new URL(url).hostname;
  if (host !== network.paymasterHost) {
    const other = Object.values(NETWORKS).find(n => n.paymasterHost === host);
    throw new Error(`Paymaster ${host} serves ${other?.name ?? 'another network'}, but the RPC is on ${network.name}; use https://${network.paymasterHost} or unset PAYMASTER_URL`);
  }
  return url;
}

/**
 * PAYMASTER_URL if set, else the AVNU paymaster for `network`.
 */
function resolvePaymasterUrl(network) {
  return assertPaymasterUrlForNetwork(
    process.env.PAYMASTER_URL || `https://${network.paymasterHost}`,
    network
  );
}

/**
 * Execute an AVNU quote through the account's paymaster, paying gas in
 * `gasTokenAddress`.
 *
 * avnu-sdk's executeSwap signs whatever typed data the paymaster returns.
 * Account.executePaymasterTransaction instead rebuilds the paymaster
 * transaction and refuses to sign unless its calls equal `calls` plus one
 * `gasTokenAddress` transfer of at most `maxFeeInGasToken`.
 *
 * `maxGasFee` (gas token base units) optionally caps the fee independently of
 * the paymaster's own estimate.
 */
async function executeAvnuSwap(quote, account, slippage = DEFAULT_SLIPPAGE, gasTokenAddress = quote.sellTokenAddress, maxGasFee) {
  if (!gasTokenAddress) throw new Error('Missing gas token address');

  const network = await getNetwork(account.provider);
  assertPaymasterUrlForNetwork(account.paymaster.nodeUrl, network);
  if (BigInt(network.chainId) !== BigInt(quote.chainId)) {
    throw new Error(`Quote chainId ${quote.chainId} does not match account chainId ${network.chainId}`);
  }

  const { calls } = await quoteToCalls({
    quoteId: quote.quoteId,
    takerAddress: account.address,
    slippage,
    executeApprove: true,
  }, avnuOptions(network));

  const paymasterDetails = { feeMode: { mode: 'default', gasToken: gasTokenAddress } };
  const estimate = await account.estimatePaymasterTransactionFee(calls, paymasterDetails);
  const estimatedFeeInGasToken = BigInt(estimate.estimated_fee_in_gas_token);
  const maxFeeInGasToken = BigInt(estimate.suggested_max_fee_in_gas_token);

  // starknet.js skips the fee cap when maxFeeInGasToken is falsy, so a zero
  // estimate would leave the fee transfer unbounded.
  if (maxFeeInGasToken <= 0n) {
    throw new Error(`Paymaster returned a non-positive max fee: ${maxFeeInGasToken}`);
  }
  if (maxGasFee !== undefined && maxFeeInGasToken > maxGasFee) {
    throw new Error(`Paymaster max fee ${maxFeeInGasToken} exceeds maxGasFee ${maxGasFee} (gas token base units)`);
  }

  const result = await account.executePaymasterTransaction(calls, paymasterDetails, maxFeeInGasToken);

  return { transactionHash: result.transaction_hash, estimatedFeeInGasToken, maxFeeInGasToken };
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
    maxGasFee,
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

  // The RPC's chain ID picks the AVNU API and paymaster; unknown chains stop here.
  const rpcUrl = resolveRpcUrl();
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  let network;
  try {
    network = await getNetwork(provider);
  } catch (err) {
    console.log(JSON.stringify({
      error: `Network detection failed: ${err.message}`,
      nextStep: 'CONFIGURE_RPC'
    }));
    process.exit(1);
  }

  let paymaster;
  try {
    paymaster = new PaymasterRpc({
      nodeUrl: resolvePaymasterUrl(network),
    });
  } catch (err) {
    console.log(JSON.stringify({
      error: `Paymaster initialization failed: ${err.message}`,
      nextStep: 'CONFIGURE_PAYMASTER'
    }));
    process.exit(1);
  }
  
  // Create account from passed arguments (no secrets access).
  // executePaymasterTransaction talks to the account's own paymaster.
  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey,
    paymaster
  });
  
  try {
    // Step 1: Get quote
    console.error(JSON.stringify({
      step: "quote",
      status: "fetching",
      network: network.name,
      sellToken,
      buyToken,
      sellAmount
    }));
    
    const { quote, sellToken: sellTokenData, buyToken: buyTokenData } = await getSwapQuote(sellToken, buyToken, sellAmount, account.address, network);
    
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
    
    const gasTokenData = await resolveGasToken(gasToken, sellTokenData, network);
    
    let maxGasFeeUnits;
    if (maxGasFee != null) {
      try {
        maxGasFeeUnits = amountToBigInt(maxGasFee, gasTokenData.decimals);
      } catch (e) {
        throw new Error(`Invalid maxGasFee: ${e.message}`);
      }
    }
    
    // Step 2: Execute swap
    console.error(JSON.stringify({
      step: "execute",
      status: "executing",
      slippage: `${slippage * 100}%`,
      feeMode: "default",
      gasToken: gasTokenData.symbol,
      ...(maxGasFeeUnits !== undefined && { maxGasFee: maxGasFeeUnits.toString() })
    }));
    
    const result = await executeAvnuSwap(quote, account, slippage, gasTokenData.address, maxGasFeeUnits);
    
    console.log(JSON.stringify({
      success: true,
      step: "execute",
      status: "success",
      transactionHash: result.transactionHash,
      network: network.name,
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
      estimatedFeeInGasToken: result.estimatedFeeInGasToken.toString(),
      maxFeeInGasToken: result.maxFeeInGasToken.toString(),
      explorer: `${network.explorerTxUrl}${result.transactionHash}`
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
