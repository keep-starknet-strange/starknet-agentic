#!/usr/bin/env node
/**
 * read-smart.js - Purely dynamic ABI-based function resolution
 * 
 * NO hardcoded patterns, NO standard assumptions.
 * Fetches ABI, analyzes prompt, finds best match purely by string analysis.
 */

import { Provider, shortString } from 'starknet';

import { resolveRpcUrl } from './_rpc.js';

function extractFunctions(abi) {
  const funcs = [];
  for (const item of abi) {
    if (item.type === 'function' && item.name) funcs.push(item);
    if (item.type === 'interface' && item.items) {
      for (const sub of item.items) {
        if (sub.type === 'function' && sub.name) funcs.push(sub);
      }
    }
  }
  return funcs;
}

function tokenize(str) {
  // Split by camelCase, snake_case, kebab-case
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/^_/, '')
    .toLowerCase()
    .split(/[_\-]+/)
    .filter(Boolean);
}

function calculateSimilarity(action, funcName) {
  const a = action.toLowerCase();
  const f = funcName.toLowerCase();
  
  // Exact match
  if (f === a) return 100;
  
  // One contains the other
  if (f.includes(a)) return 70 + (a.length / f.length) * 20;
  if (a.includes(f)) return 60 + (f.length / a.length) * 20;
  
  // Token overlap analysis
  const aTokens = tokenize(action);
  const fTokens = tokenize(funcName);
  
  let score = 0;
  let matchedTokens = 0;
  
  for (const at of aTokens) {
    for (const ft of fTokens) {
      if (at === ft) {
        score += 30;
        matchedTokens++;
      } else if (ft.includes(at)) {
        score += 20;
        matchedTokens++;
      } else if (at.includes(ft)) {
        score += 15;
        matchedTokens++;
      } else {
        // Check for common substrings (bounded)
        const minLen = Math.min(at.length, ft.length);
        const maxSubstringLen = Math.min(5, minLen);
        for (let len = 3; len <= maxSubstringLen; len++) {
          for (let i = 0; i <= at.length - len; i++) {
            const sub = at.substring(i, i + len);
            if (ft.includes(sub)) {
              score += len * 2;
              break;
            }
          }
          if (score >= 120) break;
        }
      }
    }
  }
  
  // Bonus for multiple token matches
  if (matchedTokens >= 2) score += 10;
  
  // Character-level Levenshtein-inspired similarity
  const maxLen = Math.max(a.length, f.length);
  if (maxLen > 0) {
    let common = 0;
    const minL = Math.min(a.length, f.length);
    for (let i = 0; i < minL; i++) {
      if (a[i] === f[i]) common++;
    }
    score += (common / maxLen) * 25;
  }
  
  return score;
}

function findBestMatch(action, functions) {
  let best = null;
  let bestScore = 0;
  
  for (const fn of functions) {
    const score = calculateSimilarity(action, fn.name);
    if (score > bestScore) {
      bestScore = score;
      best = fn;
    }
  }
  
  // Adaptive threshold
  const threshold = action.length <= 3 ? 15 : action.length <= 6 ? 10 : 8;
  return bestScore >= threshold ? best : null;
}

function decodeShortString(value) {
  try {
    if (typeof value === 'string' && value.startsWith('0x')) {
      const decoded = shortString.decodeShortString(value);
      if (decoded && /^[\x20-\x7E]+$/.test(decoded)) return decoded;
    }
    return value;
  } catch {
    return value;
  }
}

function serialize(v, decodeStrings = false) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(x => serialize(x, decodeStrings));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = serialize(val, decodeStrings);
    return o;
  }
  if (decodeStrings && typeof v === 'string') return decodeShortString(v);
  return v;
}


function normalizeAbi(rawAbi) {
  if (!rawAbi) return null;
  if (Array.isArray(rawAbi)) return rawAbi;
  if (typeof rawAbi === 'string') {
    try { return JSON.parse(rawAbi); } catch { return null; }
  }
  if (typeof rawAbi === 'object') {
    if (Array.isArray(rawAbi.abi)) return rawAbi.abi;
    if (typeof rawAbi.abi === 'string') {
      try { return JSON.parse(rawAbi.abi); } catch { return null; }
    }
  }
  return null;
}

function isUint256LikeOutput(functionAbi) {
  const outputs = functionAbi?.outputs || [];
  if (!Array.isArray(outputs) || outputs.length === 0) return false;
  return outputs.some((out) => {
    const t = String(out?.type || out?.name || '').toLowerCase();
    return t.includes('uint256') || t.includes('u256') || t.includes('core::integer::u256');
  });
}

async function main() {
  const rawInput = process.argv[2];
  
  if (!rawInput) {
    console.log(JSON.stringify({
      error: "No input provided",
      usage: 'node read-smart.js \'{"contractAddress":"0x...","method":"balance","args":["0x..."]}\''
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
  
  const { contractAddress, method, args = [], decodeShortStrings = false } = input;
  
  if (!contractAddress) {
    console.log(JSON.stringify({ error: "Missing contractAddress" }));
    process.exit(1);
  }
  
  const rpcUrl = resolveRpcUrl();
  const provider = new Provider({ nodeUrl: rpcUrl });
  
  // Fetch ABI from blockchain
  let abi;
  try {
    const classResponse = await provider.getClassAt(contractAddress);
    abi = normalizeAbi(classResponse?.abi ?? classResponse);
    if (!abi || !Array.isArray(abi) || abi.length === 0) {
      console.log(JSON.stringify({ error: "Contract has no ABI on chain" }));
      process.exit(1);
    }
  } catch (err) {
    console.log(JSON.stringify({ error: `Failed to fetch ABI: ${err.message}` }));
    process.exit(1);
  }
  
  const functions = extractFunctions(abi);
  
  if (functions.length === 0) {
    console.log(JSON.stringify({ error: "No functions found in ABI" }));
    process.exit(1);
  }
  
  // No method provided - list available functions
  if (!method) {
    console.log(JSON.stringify({
      success: true,
      contractAddress,
      availableFunctions: functions.map(f => f.name),
      message: "Provide a method name to call"
    }));
    process.exit(0);
  }
  
  // Check exact match first
  const exactMatch = functions.find(f => f.name === method);
  let resolvedMethod = method;
  let matchedFunction = exactMatch;
  
  // If no exact match, use purely dynamic analysis
  if (!exactMatch) {
    matchedFunction = findBestMatch(method, functions);
    if (matchedFunction) {
      resolvedMethod = matchedFunction.name;
    }
  }
  
  // Execute call
  try {
    let result;
    let rawResult = null;
    let uint256 = null;

    try {
      result = await contract.call(resolvedMethod, args);
    } catch (typedCallErr) {
      // Fallback to raw RPC call when typed call path fails (e.g. ABI parser quirks)
      const r = await provider.callContract({
        contractAddress,
        entrypoint: resolvedMethod,
        calldata: args.map(String)
      });
      rawResult = Array.isArray(r) ? r : (r?.result || null);
      result = rawResult;
    }

    if (!rawResult) {
      try {
        const r = await provider.callContract({
          contractAddress,
          entrypoint: resolvedMethod,
          calldata: args.map(String)
        });
        rawResult = Array.isArray(r) ? r : (r?.result || null);
      } catch {
        // ignore
      }
    }

    if (rawResult && Array.isArray(rawResult) && rawResult.length === 2 && isUint256LikeOutput(matchedFunction)) {
      const low = BigInt(rawResult[0]);
      const high = BigInt(rawResult[1]);
      uint256 = {
        low: String(rawResult[0]),
        high: String(rawResult[1]),
        value: (low + (high << 128n)).toString()
      };
    }
    
    const output = {
      success: true,
      contractAddress,
      method: resolvedMethod,
      requestedMethod: method !== resolvedMethod ? method : undefined,
      matchScore: !exactMatch && matchedFunction ? 
        calculateSimilarity(method, resolvedMethod).toFixed(2) : undefined,
      args,
      result: serialize(result, decodeShortStrings),
      raw: rawResult
    };
    
    if (uint256) output.uint256 = uint256;
    
    console.log(JSON.stringify(output, null, 2));
    
  } catch (err) {
    // Show all functions sorted by relevance on error
    const scored = functions
      .map(f => ({ 
        name: f.name, 
        score: calculateSimilarity(method, f.name),
        stateMutability: f.stateMutability 
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    
    console.log(JSON.stringify({
      success: false,
      error: err.message,
      requestedMethod: method,
      resolvedMethod: method !== resolvedMethod ? resolvedMethod : undefined,
      suggestions: scored,
      allFunctions: functions.map(f => f.name).slice(0, 30)
    }, null, 2));
    process.exit(1);
  }
}

main().catch(err => {
  console.log(JSON.stringify({ error: err.message }));
  process.exit(1);
});
