#!/usr/bin/env node
/**
 * typhoon-starknet-account: check-allowance.js
 *
 * Check ERC20 allowance to determine if approve is needed.
 * ABI fetched from chain.
 *
 * INPUT: JSON as first argument
 * {
 *   "tokenAddress": "0x...",
 *   "ownerAddress": "0x...",
 *   "spenderAddress": "0x...",
 *
 *   // Provide ONE of the following:
 *   "requiredAmount": "<raw>"            // base units (wei)
 *   "requiredAmountHuman": "20"         // human amount, will fetch decimals()
 * }
 *
 * OUTPUT:
 * {
 *   success,
 *   currentAllowance,
 *   requiredAmount,
 *   needsApprove
 * }
 */

import { Provider, Contract } from 'starknet';

const RPC_URL = 'https://rpc.starknet.lava.build:443';

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function toRawAmount(humanAmount, decimals) {
  const [whole, frac = ''] = String(humanAmount).split('.');
  const fracPadded = frac.padEnd(decimals, '0').slice(0, decimals);
  // handle empty whole like ".5"
  const wholeSafe = whole === '' ? '0' : whole;
  return BigInt(wholeSafe + fracPadded).toString();
}

function normalizeU256(v) {
  // Common shapes returned by starknet.js parsing:
  // - bigint
  // - string
  // - number
  // - { low, high }
  // - { low: '...', high: '...' }
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  if (typeof v === 'string') {
    // decimal or hex
    return v.startsWith('0x') ? BigInt(v) : BigInt(v);
  }
  if (v && typeof v === 'object') {
    // u256 struct
    if ('low' in v && 'high' in v) {
      const low = normalizeU256(v.low);
      const high = normalizeU256(v.high);
      return low + (high << 128n);
    }
    // Some ABIs may return {0: low, 1: high}
    if ('0' in v && '1' in v) {
      const low = normalizeU256(v[0]);
      const high = normalizeU256(v[1]);
      return low + (high << 128n);
    }
  }
  throw new Error('Unsupported u256/allowance return type');
}

async function main() {
  const raw = process.argv[2];
  if (!raw) fail('No input.');

  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    fail(`JSON parse error: ${e.message}`);
  }

  if (!input.tokenAddress) fail('Missing "tokenAddress".');
  if (!input.ownerAddress) fail('Missing "ownerAddress".');
  if (!input.spenderAddress) fail('Missing "spenderAddress".');

  const hasRaw = input.requiredAmount !== undefined && input.requiredAmount !== null;
  const hasHuman = input.requiredAmountHuman !== undefined && input.requiredAmountHuman !== null;
  if (!hasRaw && !hasHuman) {
    fail('Missing required amount. Provide "requiredAmount" or "requiredAmountHuman".');
  }
  if (hasRaw && hasHuman) {
    fail('Provide only one: "requiredAmount" OR "requiredAmountHuman".');
  }

  const provider = new Provider({ nodeUrl: RPC_URL });

  const classResponse = await provider.getClassAt(input.tokenAddress);
  if (!classResponse.abi) fail('Token has no ABI on chain.');

  const token = new Contract({ abi: classResponse.abi, address: input.tokenAddress, provider });

  // Compute required amount in base units
  let requiredAmount;
  if (hasRaw) {
    requiredAmount = String(input.requiredAmount);
  } else {
    let decimals = 18;
    try {
      const d = await token.call('decimals', []);
      decimals = Number(d.toString());
    } catch {
      // keep default
    }
    requiredAmount = toRawAmount(input.requiredAmountHuman, decimals);
  }

  // Read allowance
  const allowanceRes = await token.call('allowance', [input.ownerAddress, input.spenderAddress]);
  const currentAllowance = normalizeU256(allowanceRes);
  const required = BigInt(requiredAmount);

  const needsApprove = currentAllowance < required;

  console.log(JSON.stringify({
    success: true,
    tokenAddress: input.tokenAddress,
    ownerAddress: input.ownerAddress,
    spenderAddress: input.spenderAddress,
    currentAllowance: currentAllowance.toString(),
    requiredAmount,
    needsApprove,
  }));
}

main().catch((err) => fail(err.message));
