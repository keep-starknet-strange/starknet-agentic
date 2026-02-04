#!/usr/bin/env node
/**
 * typhoon-starknet-account: multicall.js
 * 
 * Execute multiple contract calls in a single transaction.
 * Use for approve + action patterns.
 * 
 * INPUT: JSON as first argument
 * {
 *   "privateKeyPath": "/path/to/key",
 *   "accountAddress": "0x...",
 *   "calls": [
 *     {"contractAddress": "0x...", "method": "approve", "args": ["0xspender", "1000"]},
 *     {"contractAddress": "0x...", "method": "swap", "args": [...]}
 *   ]
 * }
 */

import { Provider, Account, Contract, CallData } from 'starknet';
import fs from 'fs';

const RPC_URL = process.env.STARKNET_RPC_URL;

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
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
  if (!input.calls || !Array.isArray(input.calls)) fail('Missing "calls" array.');
  if (input.calls.length === 0) fail('Empty "calls" array.');

  if (!fs.existsSync(input.privateKeyPath)) fail(`Key not found: ${input.privateKeyPath}`);
  const privateKey = fs.readFileSync(input.privateKeyPath, 'utf-8').trim();

  const provider = new Provider({ nodeUrl: RPC_URL });
  const account = new Account({ provider, address: input.accountAddress, signer: privateKey });

  // Build call array
  const callsForExec = [];

  for (let i = 0; i < input.calls.length; i++) {
    const call = input.calls[i];
    
    if (!call.contractAddress) fail(`Call ${i}: missing "contractAddress".`);
    if (!call.method) fail(`Call ${i}: missing "method".`);

    // Fetch ABI
    const classResponse = await provider.getClassAt(call.contractAddress);
    if (!classResponse.abi) fail(`Call ${i}: contract has no ABI.`);

    const contract = new Contract({ abi: classResponse.abi, address: call.contractAddress, provider });
    
    // Populate the call
    const populated = contract.populate(call.method, call.args || []);
    callsForExec.push(populated);
  }

  // Execute multicall
  const result = await account.execute(callsForExec);

  // Wait for transaction
  const receipt = await provider.waitForTransaction(result.transaction_hash);

  console.log(JSON.stringify({
    success: true,
    callCount: input.calls.length,
    transactionHash: result.transaction_hash,
    executionStatus: receipt.execution_status,
    finalityStatus: receipt.finality_status,
    explorer: `https://voyager.online/tx/${result.transaction_hash}`,
  }));
}

main().catch(err => fail(err.message));
