#!/usr/bin/env node
/**
 * typhoon-starknet-account: invoke-contract.js
 * 
 * State-changing contract call. ABI fetched from chain.
 * For ERC20 transfer: use "to" + "amount" (auto-converts decimals).
 * 
 * INPUT: JSON as first argument
 * {
 *   "privateKey": "0x...",      // Private key passed from resolve-smart.js
 *   "accountAddress": "0x...",
 *   "contractAddress": "0x...",
 *   "method": "transfer",
 *   "args": ["0x...", "1000000000000000000"],  // raw OR
 *   "to": "0x...",                              // ERC20 shorthand
 *   "amount": "20"                              // human amount
 * }
 */

import { Provider, Account, Contract } from 'starknet';

import { resolveRpcUrl } from './_rpc.js';

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

  if (!input.privateKey) fail('Missing "privateKey" (passed from resolve-smart.js).');
  if (!input.accountAddress) fail('Missing "accountAddress".');
  if (!input.contractAddress) fail('Missing "contractAddress".');
  if (!input.method) fail('Missing "method".');

  const privateKey = input.privateKey;

  const rpcUrl = resolveRpcUrl();
  const provider = new Provider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address: input.accountAddress,
    signer: privateKey
  });

  const classResponse = await provider.getClassAt(input.contractAddress);
  if (!classResponse.abi) fail('Contract has no ABI on chain.');

  const contract = new Contract(classResponse.abi, input.contractAddress, account);

  // Build args
  let args = input.args || [];

  // ERC20 shorthand: transfer(to, amountHuman)
  if (input.method === 'transfer' && input.to && input.amount) {
    let decimals = 18;
    try {
      decimals = Number((await contract.call('decimals', [])).toString());
    } catch {}
    args = [input.to, toRaw(String(input.amount), decimals)];
  }

  // ERC20 shorthand: approve(spender, amountHuman)
  if (input.method === 'approve' && input.spender && input.amount) {
    let decimals = 18;
    try {
      decimals = Number((await contract.call('decimals', [])).toString());
    } catch {}
    args = [input.spender, toRaw(String(input.amount), decimals)];
  }

  const waitForTx = input.waitForTx !== false;
  const result = await contract.invoke(input.method, args, { waitForTransaction: waitForTx });

  const output = {
    success: true,
    method: input.method,
    contractAddress: input.contractAddress,
    txHash: result.transaction_hash,
    explorer: `https://voyager.online/tx/${result.transaction_hash}`,
  };

  if (waitForTx && result.execution_status) {
    output.executionStatus = result.execution_status;
    output.finalityStatus = result.finality_status;
  }

  console.log(JSON.stringify(output));
}

function toRaw(amount, decimals) {
  const [whole, frac = ''] = amount.split('.');
  return BigInt(whole + frac.padEnd(decimals, '0').slice(0, decimals)).toString();
}

main().catch(err => fail(err.message));