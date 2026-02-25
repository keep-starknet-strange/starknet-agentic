#!/usr/bin/env node
/**
 * typhoon-starknet-account: invoke-contract.js
 * 
 * State-changing contract call. ABI fetched from chain.
 * For ERC20 transfer: use "to" + "amount" (auto-converts decimals).
 * 
 * INPUT: JSON as first argument
 * {
 *   "accountAddress": "0x...",
 *   "contractAddress": "0x...",
 *   "method": "transfer",
 *   "args": ["0x...", "1000000000000000000"],  // raw OR
 *   "to": "0x...",                              // ERC20 shorthand
 *   "amount": "20"                              // human amount
 * }
 */

import { Provider, Account, Contract } from 'starknet';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, isAbsolute } from 'path';
import { homedir } from 'os';

import { resolveRpcUrl } from './_rpc.js';

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function getSecretsDir() {
  return join(homedir(), '.openclaw', 'secrets', 'starknet');
}

function loadPrivateKeyByAccountAddress(accountAddress) {
  const dir = getSecretsDir();
  if (!existsSync(dir)) fail('Missing secrets directory: ~/.openclaw/secrets/starknet');

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
      fail('Account is missing privateKeyPath (file-based key is required).');
    }

    const keyPath = isAbsolute(data.privateKeyPath)
      ? data.privateKeyPath
      : join(dir, data.privateKeyPath);

    if (!existsSync(keyPath)) fail(`Private key file not found: ${keyPath}`);
    const privateKey = readFileSync(keyPath, 'utf8').trim();
    if (!privateKey) fail('Private key file is empty.');
    return privateKey;
  }

  fail(`Account not found in ~/.openclaw/secrets/starknet for address: ${accountAddress}`);
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

  if (!input.accountAddress) fail('Missing "accountAddress".');
  if (!input.contractAddress) fail('Missing "contractAddress".');
  if (!input.method) fail('Missing "method".');
  if (input.privateKey) fail('Do not pass privateKey in JSON input.');

  const privateKey = loadPrivateKeyByAccountAddress(input.accountAddress);

  const rpcUrl = resolveRpcUrl();
  const provider = new Provider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address: input.accountAddress,
    signer: privateKey
  });

  const classResponse = await provider.getClassAt(input.contractAddress);
  if (!classResponse.abi) fail('Contract has no ABI on chain.');

  const contract = new Contract({
    abi: classResponse.abi,
    address: input.contractAddress,
    providerOrAccount: account
  });

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
