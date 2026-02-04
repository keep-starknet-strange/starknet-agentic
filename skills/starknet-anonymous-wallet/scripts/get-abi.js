#!/usr/bin/env node
/**
 * typhoon-starknet-account: get-abi.js
 * 
 * Fetch contract ABI and list available functions.
 * 
 * INPUT: JSON as first argument
 * {
 *   "contractAddress": "0x...",
 *   "query": "optional natural language / keywords"  // optional
 * }
 * 
 * OUTPUT: JSON with rich ABI summary + functions list (and candidates if query provided)
 */

import { Provider } from 'starknet';

import { resolveRpcUrl } from './_rpc.js';

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function extractFunctions(abi) {
  const functions = [];

  for (const item of abi) {
    if (item.type === 'interface' && item.items) {
      for (const fn of item.items) {
        if (fn.type === 'function') {
          functions.push({
            name: fn.name,
            inputs: fn.inputs || [],
            outputs: fn.outputs || [],
            stateMutability: fn.state_mutability || 'external',
            source: {
              kind: 'interface',
              interface: item.name || item.interface_name || null,
            },
          });
        }
      }
    }

    if (item.type === 'function') {
      functions.push({
        name: item.name,
        inputs: item.inputs || [],
        outputs: item.outputs || [],
        stateMutability: item.state_mutability || 'external',
        source: { kind: 'toplevel' },
      });
    }
  }

  return functions;
}

function rankCandidates(functions, query, limit = 10) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  function scoreFn(fn) {
    const name = (fn.name || '').toLowerCase();
    let score = 0;

    for (const t of terms) {
      if (!t) continue;
      if (name === t) score += 50;
      if (name.includes(t)) score += 20;

      for (const inp of fn.inputs || []) {
        const inName = (inp.name || '').toLowerCase();
        const inType = (inp.type || '').toLowerCase();
        if (inName.includes(t)) score += 5;
        if (inType.includes(t)) score += 3;
      }
    }

    // prefer external for action-ish verbs
    if (/(swap|trade|transfer|send|deposit|withdraw|approve|stake|mint|burn)/.test(q)) {
      if (fn.stateMutability === 'external') score += 5;
    }

    return score;
  }

  return functions
    .map((fn) => ({ fn, score: scoreFn(fn) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => ({ score: x.score, ...x.fn }));
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

  if (!input.contractAddress) fail('Missing "contractAddress".');

  const rpcUrl = resolveRpcUrl(input);
  const provider = new Provider({ nodeUrl: rpcUrl });
  const classHash = await provider.getClassHashAt(input.contractAddress);
  const classResponse = await provider.getClassAt(input.contractAddress);

  if (!classResponse.abi) fail('Contract has no ABI on chain.');

  const functions = extractFunctions(classResponse.abi);
  const candidates = input.query ? rankCandidates(functions, input.query, input.limit || 10) : undefined;

  const entrypoints = classResponse.entry_points_by_type
    ? {
        external: (classResponse.entry_points_by_type.EXTERNAL || []).map((e) => e.selector),
        view: (classResponse.entry_points_by_type.L1_HANDLER || []).map((e) => e.selector),
      }
    : undefined;

  console.log(JSON.stringify({
    success: true,
    contractAddress: input.contractAddress,
    classHash,
    functionCount: functions.length,
    functions,
    candidates,
    contractClassVersion: classResponse.contract_class_version,
  }));
}

main().catch(err => fail(err.message));
