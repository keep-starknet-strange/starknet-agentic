#!/usr/bin/env node
/**
 * typhoon-starknet-account: simulate.js
 *
 * Preflight: simulate a single call or multicall without sending a tx.
 *
 * INPUT: JSON as first argument
 * {
 *   "privateKeyPath": "/path/to/key",
 *   "accountAddress": "0x...",
 *   "calls": [
 *     {"contractAddress":"0x...","method":"...","args":[...]}
 *   ],
 *   "skipValidate": true,   // optional, default true
 *   "skipExecute": false    // optional
 * }
 */

import { Provider, Account, Contract, TransactionType } from 'starknet';
import fs from 'fs';

const RPC_URL = process.env.STARKNET_RPC_URL;

function fail(message) {
  console.error(JSON.stringify({ error: message }));
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

  const skipValidate = input.skipValidate !== false; // default true
  const skipExecute = input.skipExecute;

  const invocations = [{ type: TransactionType.INVOKE, payload: populatedCalls }];

  const sim = await account.simulateTransaction(invocations, { skipValidate, skipExecute });

  console.log(JSON.stringify({
    success: true,
    callCount: input.calls.length,
    simulation: sim,
  }));
}

main().catch((err) => fail(err.message));
