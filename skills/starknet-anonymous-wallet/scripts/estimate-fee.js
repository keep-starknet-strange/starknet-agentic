#!/usr/bin/env node
/**
 * typhoon-starknet-account: estimate-fee.js
 *
 * Preflight: estimate fee/resource bounds for a single call or multicall.
 *
 * INPUT: JSON as first argument
 * {
 *   "privateKeyPath": "/path/to/key",
 *   "accountAddress": "0x...",
 *   "calls": [
 *     {"contractAddress":"0x...","method":"...","args":[...]}
 *   ]
 * }
 *
 * OUTPUT: JSON with fee estimate.
 */

import { Provider, Account, Contract } from 'starknet';
import fs from 'fs';

const RPC_URL = process.env.STARKNET_RPC_URL;

function jsonStringifySafe(obj) {
  return JSON.stringify(obj, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

function fail(message, stack) {
  console.error(jsonStringifySafe({ error: message, stack }));
  process.exit(1);
}

async function buildPopulatedCalls(provider, calls) {
  const cache = new Map();
  const populated = [];

  for (let i = 0; i < calls.length; i++) {
    const c = calls[i];
    if (!c.contractAddress) fail(`Call ${i}: missing "contractAddress".`);
    if (!c.method) fail(`Call ${i}: missing "method".`);

    let abi = cache.get(c.contractAddress);
    if (!abi) {
      const cls = await provider.getClassAt(c.contractAddress);
      if (!cls.abi) fail(`Call ${i}: contract has no ABI on chain.`);
      abi = cls.abi;
      cache.set(c.contractAddress, abi);
    }

    const contract = new Contract({ abi, address: c.contractAddress, provider });
    populated.push(contract.populate(c.method, c.args || []));
  }

  return populated;
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

  if (!input.privateKeyPath) fail('Missing "privateKeyPath".');
  if (!input.accountAddress) fail('Missing "accountAddress".');
  if (!Array.isArray(input.calls) || input.calls.length === 0) fail('Missing non-empty "calls" array.');

  if (!fs.existsSync(input.privateKeyPath)) fail(`Key not found: ${input.privateKeyPath}`);
  const privateKey = fs.readFileSync(input.privateKeyPath, 'utf-8').trim();

  const provider = new Provider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: input.accountAddress, signer: privateKey });

  const populatedCalls = await buildPopulatedCalls(provider, input.calls);

  const estimate = await account.estimateInvokeFee(populatedCalls);

  console.log(jsonStringifySafe({
    success: true,
    callCount: input.calls.length,
    estimate,
  }));
}

main().catch((err) => fail(err?.message || String(err), err?.stack));
