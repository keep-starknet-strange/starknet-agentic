#!/usr/bin/env node
/**
 * resolve-smart.js - Central Orchestrator
 * 
 * SINGLE SCRIPT that:
 * 1. Loads private key ONCE (only secrets access)
 * 2. Executes pre-parsed operations (no natural-language parsing)
 * 3. Resolves functions AND events from ABIs
 * 4. Orchestrates child scripts with private key passed as argument
 * 5. Handles event watching with callbacks
 */

import { Provider, CallData } from 'starknet';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { fetchTokens } from '@avnu/avnu-sdk';
import { findCanonicalAction, ALL_SYNONYMS } from './synonyms.js';

import { resolveRpcUrl } from './_rpc.js';

// ============ LOOT SURVIVOR LATEST ADVENTURER (LOCAL UX STATE) ============
// We intentionally do NOT scan chain/indexers for "latest adventurer".
// Instead we persist the last-used adventurerId per account locally.
const LOOT_STATE_DIR = join(homedir(), '.openclaw', 'typhoon-loot-survivor');
const LOOT_STATE_FILE = join(LOOT_STATE_DIR, 'latest.json');

function lootStateLoad() {
  try {
    if (!existsSync(LOOT_STATE_FILE)) return {};
    return JSON.parse(readFileSync(LOOT_STATE_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function lootStateGetEntry(map, accountAddress) {
  const v = map[String(accountAddress).toLowerCase()];
  // Backward compat: older versions stored just the latest adventurerId as a string
  if (typeof v === 'string') return { latestAdventurerId: v, pendingEncounter: false };
  if (v && typeof v === 'object') {
    return {
      latestAdventurerId: v.latestAdventurerId ? String(v.latestAdventurerId) : null,
      pendingEncounter: Boolean(v.pendingEncounter)
    };
  }
  return { latestAdventurerId: null, pendingEncounter: false };
}

function lootStateWriteEntry(map, accountAddress, entry) {
  map[String(accountAddress).toLowerCase()] = {
    latestAdventurerId: entry.latestAdventurerId ? String(entry.latestAdventurerId) : null,
    pendingEncounter: Boolean(entry.pendingEncounter)
  };
}

function lootStateGetLatest(accountAddress) {
  if (!accountAddress) return null;
  const map = lootStateLoad();
  return lootStateGetEntry(map, accountAddress).latestAdventurerId;
}

function lootStateGetPending(accountAddress) {
  if (!accountAddress) return false;
  const map = lootStateLoad();
  return lootStateGetEntry(map, accountAddress).pendingEncounter;
}

function lootStateSetLatest(accountAddress, adventurerId) {
  if (!accountAddress || !adventurerId) return;
  try {
    mkdirSync(LOOT_STATE_DIR, { recursive: true });
    const map = lootStateLoad();
    const entry = lootStateGetEntry(map, accountAddress);
    entry.latestAdventurerId = String(adventurerId);
    lootStateWriteEntry(map, accountAddress, entry);
    writeFileSync(LOOT_STATE_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
  } catch {
    // best-effort only
  }
}

function lootStateSetPending(accountAddress, pending) {
  if (!accountAddress) return;
  try {
    mkdirSync(LOOT_STATE_DIR, { recursive: true });
    const map = lootStateLoad();
    const entry = lootStateGetEntry(map, accountAddress);
    entry.pendingEncounter = Boolean(pending);
    lootStateWriteEntry(map, accountAddress, entry);
    writeFileSync(LOOT_STATE_FILE, JSON.stringify(map, null, 2) + '\n', 'utf8');
  } catch {
    // best-effort only
  }
}

// ============ DYNAMIC REGISTRY LOADING ============
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_ROOT = join(__dirname, '..');

// ============ EXECUTION ATTESTATION (PARSE → RESOLVE) ============
// resolve-smart should only build executable plans from structured parsed input
// that passed through parse-smart (which issues a short-lived one-time token).
const ATTEST_DIR = join(homedir(), '.openclaw', 'typhoon-attest');

function verifyAndConsumeAttestation(token) {
  if (process.env.TYPHOON_ATTEST_DISABLE === '1') return { ok: true, disabled: true };
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
  if (!/^[a-f0-9]{20,64}$/i.test(token)) return { ok: false, reason: 'format' };

  const p = join(ATTEST_DIR, `${token}.json`);
  if (!existsSync(p)) return { ok: false, reason: 'not_found' };

  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const now = Date.now();
    if (data.expiresAt && now > Number(data.expiresAt)) {
      try { unlinkSync(p); } catch {}
      return { ok: false, reason: 'expired' };
    }
    // One-time consume
    try { unlinkSync(p); } catch {}
    return { ok: true };
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
}

function loadRegistry(filename) {
  const filepath = join(SKILL_ROOT, filename);
  try {
    if (existsSync(filepath)) {
      return JSON.parse(readFileSync(filepath, 'utf8'));
    }
  } catch (e) {
    // Ignore, return empty
  }
  return {};
}

function saveRegistry(filename, data) {
  const filepath = join(SKILL_ROOT, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
}

// ============ AVNU TOKEN FETCHING ============
// Token cache to avoid repeated API calls
let tokenCache = null;
let lastTokenFetch = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchAllTokens() {
  const now = Date.now();
  if (tokenCache && (now - lastTokenFetch) < CACHE_TTL) {
    return tokenCache;
  }
  
  try {
    const tokens = await fetchTokens({
      page: 0,
      size: 200, // Get up to 200 tokens
      tags: ['Verified']
    });
    
    tokenCache = tokens.content || [];
    lastTokenFetch = now;
    return tokenCache;
  } catch (e) {
    console.error(JSON.stringify({ warning: `Failed to fetch AVNU tokens: ${e.message}` }));
    return tokenCache || []; // Return cached or empty on error
  }
}

function loadProtocols() {
  const registry = loadRegistry('protocols.json');
  const protocols = {};
  for (const [name, info] of Object.entries(registry)) {
    if (name.startsWith('_')) continue; // Skip comments
    
    // Support both old format (single address) and new format (addresses array)
    if (info.addresses) {
      // New format: multiple addresses
      protocols[name] = info.addresses.map(a => a.address);
    } else if (info.address) {
      // Old format: single address
      protocols[name] = [info.address];
    }
  }
  return protocols;
}

// ============ MULTI-ADDRESS ABI SCANNING ============
async function fetchABI(address, provider) {
  try {
    const response = await provider.getClassAt(address);
    return response.abi || [];
  } catch (e) {
    return [];
  }
}

async function findBestFunctionAcrossAddresses(protocolName, action, protocols, provider) {
  const addresses = protocols[protocolName];
  if (!addresses || addresses.length === 0) {
    return { error: `No addresses found for protocol ${protocolName}` };
  }
  
  let bestMatch = null;
  let bestScore = 0;
  let allFunctions = [];
  
  // Scan all addresses
  for (const address of addresses) {
    const abi = await fetchABI(address, provider);
    const functions = extractABIItems(abi).functions;
    
    for (const func of functions) {
      const score = calculateSimilarity(action, func.name);
      allFunctions.push({
        name: func.name,
        address: address,
        score: score,
        inputs: func.inputs || [],
        outputs: func.outputs || [],
        state_mutability: func.state_mutability || 'external'
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          name: func.name,
          address: address,
          score: score,
          inputs: func.inputs || [],
          outputs: func.outputs || [],
          state_mutability: func.state_mutability || 'external',
          fullABI: abi
        };
      }
    }
  }
  
  // Sort all functions by score for reference
  allFunctions.sort((a, b) => b.score - a.score);
  
  return {
    bestMatch: bestMatch,
    allMatches: allFunctions.slice(0, 10), // Top 10 matches
    scannedAddresses: addresses.length,
    protocolName: protocolName
  };
}

function loadFriends() {
  // FRIENDS FEATURE REMOVED - recipients must be addresses
  return {};
}

// ============ PROMPT INJECTION PROTECTION ============
// ============ CONFIGURATION (loaded from JSON files) ============
// Loaded dynamically in main() to allow registration during execution

// ============ HELPERS ============
function tryParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// ============ SECRETS MANAGEMENT (SINGLE ACCESS) ============
function getSecretsDir() {
  return join(homedir(), '.openclaw', 'secrets', 'starknet');
}

function loadAccount(index = 0) {
  const dir = getSecretsDir();
  if (!existsSync(dir)) return { error: "No secrets directory" };
  
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length === 0) return { error: "No accounts found" };
  if (!files[index]) return { error: `Account index ${index} not found` };
  
  const accountPath = join(dir, files[index]);
  const data = JSON.parse(readFileSync(accountPath, 'utf8'));
  
  // Load private key from .key file or inline
  let privateKey = null;
  if (data.privateKeyPath && existsSync(data.privateKeyPath)) {
    privateKey = readFileSync(data.privateKeyPath, 'utf8').trim();
  } else if (data.privateKey) {
    privateKey = data.privateKey;
  }
  
  return {
    address: data.address,
    privateKey,
    privateKeyPath: accountPath,
    index,
    total: files.length
  };
}

// ============ ABI ANALYSIS ============
function tokenize(str) {
  return str.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase().split(/[_\-]+/).filter(Boolean);
}

function calculateSimilarity(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  if (t === q) return 100;
  if (t.includes(q)) return 70 + (q.length / t.length) * 20;
  if (q.includes(t)) return 60 + (t.length / q.length) * 15;
  
  let score = 0;
  const qTokens = tokenize(query);
  const tTokens = tokenize(target);
  
  for (const qt of qTokens) {
    for (const tt of tTokens) {
      if (qt === tt) score += 30;
      else if (tt.includes(qt)) score += 20;
      else if (qt.includes(tt)) score += 15;
      else {
        // Common substrings
        for (let len = 3; len <= Math.min(qt.length, tt.length); len++) {
          for (let i = 0; i <= qt.length - len; i++) {
            if (tt.includes(qt.substring(i, i + len))) {
              score += len * 2;
              break;
            }
          }
        }
      }
    }
  }
  
  return score;
}

function extractABIItems(abi) {
  const functions = [];
  const events = [];
  
  for (const item of abi) {
    // Functions
    if (item.type === 'function' && item.name) {
      functions.push(item);
    }
    if (item.type === 'interface' && item.items) {
      for (const sub of item.items) {
        if (sub.type === 'function' && sub.name) functions.push(sub);
      }
    }
    
    // Events
    if (item.type === 'event' && item.name) {
      events.push(item);
    }
    if (item.type === 'interface' && item.items) {
      for (const sub of item.items) {
        if (sub.type === 'event' && sub.name) events.push(sub);
      }
    }
  }
  
  return { functions, events };
}

function isHexAddress(v) {
  return typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v);
}

function findFunctionEntry(abi, name) {
  if (!abi || !name) return null;
  const { functions } = extractABIItems(abi);
  const lower = String(name).toLowerCase();
  return functions.find(f => String(f.name).toLowerCase() === lower) || null;
}

function isComplexAbiType(typeStr) {
  const t = String(typeStr || '').toLowerCase();
  // Conservatively treat these as complex: require named args and full key coverage
  return (
    t.includes('span<') ||
    t.includes('array') ||
    t.includes('struct') ||
    t.includes('tuple') ||
    t.includes('enum')
  );
}

function estimateCalldataLenFromInputs(inputs) {
  if (!Array.isArray(inputs)) return null;
  let n = 0;
  for (const inp of inputs) {
    const t = String(inp?.type || '').toLowerCase();
    if (!t) return null;

    // Complex types: skip strict length enforcement (avoid false positives)
    if (isComplexAbiType(t)) {
      return null;
    }

    // Cairo u256 / Uint256 is typically 2 felts
    if (t === 'u256' || t.endsWith('::u256') || t.includes('uint256') || t.includes('core::integer::u256')) {
      n += 2;
      continue;
    }

    // Default: 1 felt
    n += 1;
  }
  return n;
}

async function resolveFromABI(provider, contractAddress, query, type = 'function') {
  try {
    const resp = await provider.getClassAt(contractAddress);
    if (!resp.abi) return null;
    
    const { functions, events } = extractABIItems(resp.abi);
    const items = type === 'event' ? events : functions;
    
    if (items.length === 0) return null;
    
    let best = null;
    let bestScore = 0;
    
    for (const item of items) {
      const score = calculateSimilarity(query, item.name);
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    
    const threshold = query.length <= 3 ? 20 : query.length <= 6 ? 15 : 10;
    return bestScore >= threshold ? { name: best.name, score: bestScore } : null;
  } catch (err) {
    return null;
  }
}

// ============ TOKEN OPERATIONS ============
async function getTokenBalance(provider, tokenAddress, accountAddress, decimals) {
  try {
    const result = await provider.callContract({
      contractAddress: tokenAddress,
      entrypoint: 'balanceOf',
      calldata: [accountAddress]
    });
    const raw = Array.isArray(result) ? result : (result?.result || []);
    if (raw.length >= 2) {
      const value = BigInt(raw[0]) + (BigInt(raw[1]) << 128n);
      return {
        raw: value.toString(),
        human: (Number(value) / Math.pow(10, decimals)).toFixed(6)
      };
    }
  } catch {}
  return { raw: "0", human: "0" };
}

async function getTokenAllowance(provider, tokenAddress, owner, spender) {
  try {
    const result = await provider.callContract({
      contractAddress: tokenAddress,
      entrypoint: 'allowance',
      calldata: [owner, spender]
    });
    const raw = Array.isArray(result) ? result : (result?.result || []);
    if (raw.length >= 2) {
      return BigInt(raw[0]) + (BigInt(raw[1]) << 128n);
    }
  } catch {}
  return 0n;
}

function toUint256(n) {
  return [(n & ((1n << 128n) - 1n)).toString(), (n >> 128n).toString()];
}

// Parse decimal amount safely into base units (BigInt) given token decimals.
// Accepts integer/decimal strings and numbers (numbers must not be in scientific notation).
function parseAmountToBaseUnits(amount, decimals) {
  const dec = Number(decimals ?? 18);
  if (!Number.isInteger(dec) || dec < 0 || dec > 255) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }

  if (amount === null || amount === undefined) {
    throw new Error('Missing amount');
  }

  // Normalize to string for exact parsing
  let s;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) throw new Error('Amount must be finite');
    // Reject scientific notation to avoid ambiguity/precision loss
    s = String(amount);
    if (/[eE]/.test(s)) {
      throw new Error('Amount in scientific notation not supported; pass amount as a string');
    }
  } else if (typeof amount === 'string') {
    s = amount.trim();
  } else {
    s = String(amount).trim();
  }

  if (!/^[0-9]+(\.[0-9]+)?$/.test(s)) {
    throw new Error(`Invalid amount format: ${s}`);
  }

  const [intPart, fracPartRaw = ''] = s.split('.');
  const fracPart = fracPartRaw;

  if (fracPart.length > dec) {
    throw new Error(`Too many decimal places: got ${fracPart.length}, token supports ${dec}`);
  }

  const base = 10n ** BigInt(dec);
  const intBI = BigInt(intPart || '0');
  const fracPadded = (fracPart + '0'.repeat(dec)).slice(0, dec);
  const fracBI = BigInt(fracPadded || '0');

  return intBI * base + fracBI;
}

// ============ MAIN ORCHESTRATION ============
async function main() {
  const rawInput = process.argv[2];
  
  if (!rawInput) {
    console.log(JSON.stringify({
      error: "No input provided",
      usage: 'node resolve-smart.js \'{"parsed":{...},"accountIndex":0}\''
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
  
  const { accountIndex = 0, execute = false, parsed } = input;

  // Attestation check (must come from parse-smart)
  const attestationToken = input?.attestation?.token || parsed?.attestation?.token;
  const attest = verifyAndConsumeAttestation(attestationToken);
  if (!attest.ok) {
    console.log(JSON.stringify({
      success: false,
      canProceed: false,
      nextStep: 'ATTESTATION_REQUIRED',
      error: 'Missing/invalid attestation (run parse-smart on the direct user prompt before resolve-smart)',
      details: attest
    }));
    process.exit(1);
  }
  
  // ============ HANDLE PRE-PARSED DATA FROM LLM ============
  if (parsed) {
    // LLM has already parsed the prompt, skip to execution
    const result = {
      success: true,
      turn: 1,
      orchestration: [{ step: 0, name: "Using LLM-parsed data" }]
    };
    
    const { operations, operationType, abis, addresses } = parsed;
    
    result.parsed = parsed;
    result.operationType = operationType;
    result.operations = operations;
    
    // Load account
    const account = loadAccount(accountIndex);
    if (account.error) {
      result.error = account.error;
      console.log(JSON.stringify(result));
      process.exit(1);
    }
    
    result.account = {
      address: account.address,
      index: account.index,
      total: account.total
    };
    
    // Build execution plan based on operationType
    const rpcUrl = resolveRpcUrl();
    const provider = new Provider({ nodeUrl: rpcUrl });

    if (operationType === "AVNU_SWAP") {
      const swapOp = operations[0];
      result.executionPlan = {
        type: "AVNU_SWAP",
        calls: [{
          step: 1,
          type: "avnu_swap",
          script: "avnu-swap.js",
          args: {
            sellToken: swapOp.tokenIn,
            buyToken: swapOp.tokenOut,
            sellAmount: swapOp.amount?.toString(),
            slippage: 0.001,
            accountAddress: account.address
          }
        }]
      };
    } else if (operationType === "WRITE") {
      const multicall = [];
      const errors = [];
      const warnings = [];
      let requiresDangerousConfirmation = false;
      
      // For token address/decimals resolution (ERC20 transfers):
      // Prefer tokenMap provided by parse-smart/LLM, fallback to AVNU fetch for backward-compat.
      const providedTokenMap = parsed.tokenMap || parsed.tokens || parsed.tokensInfo || {};
      let avnuTokens = null;
      const findToken = (symbol) => {
        const key = String(symbol || '').toUpperCase();
        const fromMap = providedTokenMap[key];
        if (fromMap?.address) return { symbol: key, address: fromMap.address, decimals: fromMap.decimals ?? 18 };
        return null;
      };
      const findTokenFallback = async (symbol) => {
        const found = findToken(symbol);
        if (found) return found;
        if (!avnuTokens) avnuTokens = await fetchAllTokens();
        const t = avnuTokens.find(x => x.symbol?.toLowerCase() === String(symbol || '').toLowerCase());
        return t ? { symbol: t.symbol, address: t.address, decimals: t.decimals ?? 18 } : null;
      };

      // ABI cache per address (avoid repeated classAt calls)
      const abiCache = new Map();
      const getAbiCached = async (addr) => {
        const key = String(addr);
        if (abiCache.has(key)) return abiCache.get(key);
        let a = [];
        try {
          const resp = await provider.getClassAt(addr);
          a = resp?.abi || [];
        } catch {
          // Retry once with a fresh provider (some RPC hiccups manifest as stuck provider instances)
          try {
            const rpcUrl = resolveRpcUrl();
            const p2 = new Provider({ nodeUrl: rpcUrl });
            const resp2 = await p2.getClassAt(addr);
            a = resp2?.abi || [];
          } catch {
            a = [];
          }
        }
        abiCache.set(key, a);
        return a;
      };
      
      for (let i = 0; i < operations.length; i++) {
        const op = operations[i];
        
        // Check if this is an AVNU operation (protocol "AVNU" or address "0x01")
        const isAvnu = op.protocol?.toLowerCase() === "avnu" || 
                      addresses[op.protocol] === "0x01" ||
                      op.contractAddress === "0x01";

        const isVesu = op.protocol?.toLowerCase() === "vesu" ||
                      addresses[op.protocol] === "0x02" ||
                      op.contractAddress === "0x02";
        
        if (isAvnu) {
          // AVNU swap via SDK
          multicall.push({
            step: multicall.length + 1,
            type: "avnu_swap",
            script: "avnu-swap.js",
            args: {
              sellToken: op.tokenIn,
              buyToken: op.tokenOut,
              sellAmount: op.amount?.toString(),
              slippage: 0.001,
              accountAddress: account.address
            },
            description: `Swap ${op.amount || ''} ${op.tokenIn || ''} to ${op.tokenOut || ''} via AVNU SDK`
          });
        } else if (isVesu) {
          // Vesu high-level pool actions mapped to Pool.modify_position
          multicall.push({
            step: multicall.length + 1,
            type: "vesu",
            script: "vesu-pool.js",
            args: {
              action: String(op.action || '').toLowerCase(),
              pool: op.pool || op.poolName || op.args?.pool,
              user: op.user || op.args?.user || account.address,
              accountAddress: account.address,
              token: op.tokenIn || op.token || op.args?.token,
              amount: op.amount ?? op.args?.amount,
              collateralToken: op.collateralToken || op.args?.collateralToken,
              collateralAmount: op.collateralAmount || op.args?.collateralAmount,
              debtToken: op.debtToken || op.args?.debtToken,
              debtAmount: op.debtAmount || op.args?.debtAmount,
              collateralAsset: op.collateralAsset || op.args?.collateralAsset,
              debtAsset: op.debtAsset || op.args?.debtAsset
            },
            description: `Vesu ${op.action || ''} in ${op.pool || op.poolName || op.args?.pool || ''}`
          });
        } else {
          // Regular contract call
          const errorsBefore = errors.length;
          let contractAddress = addresses?.[op.protocol] || op.contractAddress;
          let funcName = op.action;
          // Prefer named args for ABI compilation; fallback to legacy params[]
          let args = op.args && typeof op.args === 'object' && !Array.isArray(op.args) ? op.args : (op.params || []);
          
          // Special-case: ERC20 transfer by symbol (e.g., "send 20 STRK to 0x...")
          // If no contractAddress provided, resolve from AVNU token list.
          if (!contractAddress && String(op.action).toLowerCase() === 'transfer') {
            const symbol = op.tokenIn || op.protocol; // allow either
            const tokenInfo = await findTokenFallback(symbol);
            if (!tokenInfo?.address) {
              errors.push({ index: i, type: 'UNKNOWN_TOKEN', symbol, message: `Token ${symbol} not found in AVNU verified tokens` });
            } else {
              contractAddress = tokenInfo.address;
              
              const to = op.to || op.recipient || (Array.isArray(op.args) ? op.args[0] : undefined) || (op.args?.to) || (op.args?.recipient);
              if (!to || typeof to !== 'string' || !to.startsWith('0x')) {
                errors.push({ index: i, type: 'MISSING_RECIPIENT', message: 'Missing recipient address (to)' });
              } else if (op.amount === undefined || op.amount === null) {
                errors.push({ index: i, type: 'MISSING_AMOUNT', message: 'Missing transfer amount' });
              } else {
                // Convert human amount to base units
                const decimals = Number(tokenInfo.decimals ?? 18);
                const amountNum = op.amount;

                try {
                  const required = parseAmountToBaseUnits(amountNum, decimals);
                  const [low, high] = toUint256(required);
                  // Named args for starknet.js compilation
                  args = { recipient: to, to, amount: { low, high } };
                } catch (e) {
                  errors.push({ index: i, type: 'INVALID_AMOUNT', message: e.message });
                }
              }
            }
          }
          
          // If still no contract address, record error
          if (!contractAddress) {
            errors.push({ index: i, type: 'NO_CONTRACT', message: 'No contractAddress resolved for operation' });
          }

          // If this op produced any new errors, skip emitting an executable call for it
          if (errors.length > errorsBefore) {
            continue;
          }
          
          // === Enforcement: verify function exists in onchain ABI + basic arg shape ===
          const fullAbi = await getAbiCached(contractAddress);
          const entry = findFunctionEntry(fullAbi, funcName);
          if (!entry) {
            errors.push({ index: i, type: 'ABI_FUNCTION_NOT_FOUND', message: `Function ${funcName} not found in ABI for ${contractAddress}` });
            continue;
          }

          // Basic address validation for ContractAddress-like inputs BEFORE compilation
          if (Array.isArray(entry.inputs)) {
            for (let j = 0; j < entry.inputs.length; j++) {
              const inp = entry.inputs[j];
              const t = String(inp?.type || '').toLowerCase();
              const isAddr = t.includes('contractaddress') || t === 'address' || t.endsWith('::contractaddress');
              if (!isAddr) continue;

              const v = Array.isArray(args) ? args[j] : args?.[inp.name];
              if (typeof v !== 'string' || !isHexAddress(v)) {
                errors.push({ index: i, type: 'INVALID_ADDRESS_ARG', message: `Invalid address for ${inp.name || `arg${j}`} (must be 0x...)` });
              }
            }
          }
          if (errors.length > errorsBefore) {
            continue;
          }

          // Loot Survivor: route to specialized script instead of generic ABI compilation
          if (op.protocol && String(op.protocol).toLowerCase() === 'lootsurvivor') {
            const a = op.args || {};
            const modeMap = {
              state: 'state',
              start_game: 'start_game',
              explore: 'explore',
              attack: 'attack',
              flee: 'flee'
            };
            const mode = modeMap[String(op.action || '').toLowerCase()];
            if (!mode) {
              errors.push({ index: i, type: 'LOOT_SURVIVOR_UNKNOWN_ACTION', message: `Unknown LootSurvivor action: ${op.action}` });
              continue;
            }
            if (!a.adventurerId) {
              // UX: default to latest adventurer id for this account
              const latest = lootStateGetLatest(account.address);
              if (latest) a.adventurerId = String(latest);
            }
            if (!a.adventurerId) {
              errors.push({
                index: i,
                type: 'MISSING_ADVENTURER_ID',
                message: 'No adventurerId provided and no "latest" adventurer stored yet. Start/mint a game once or specify: "adventurer 123".'
              });
              continue;
            }

            // Persist best-effort for subsequent steps/prompts
            lootStateSetLatest(account.address, a.adventurerId);

            multicall.push({
              step: multicall.length + 1,
              type: 'operation',
              script: 'loot-survivor.js',
              args: {
                mode,
                adventurerId: a.adventurerId,
                weapon: a.weapon ?? 0,
                tillBeast: a.tillBeast ?? false,
                toTheDeath: a.toTheDeath ?? false,
                accountAddress: account.address,
                privateKey: account.privateKey
              },
              description: `LootSurvivor ${mode} adventurer ${a.adventurerId}`
            });
            continue;
          }

          // Dangerous/admin function denylist (fail closed unless explicitly allowed)
          const dangerousName = String(entry.name || '').toLowerCase();
          const dangerousPatterns = [
            /^upgrade/, /upgrade$/, /set_?admin/, /set_?owner/, /transfer_?ownership/, /accept_?ownership/,
            /^initialize$/, /^init$/, /migrate/, /set_?implementation/, /set_?class_hash/, /set_?upgrade_delay/,
            /add_?admin/, /remove_?admin/, /grant_?role/, /revoke_?role/, /set_?role/
          ];
          const isDangerous = dangerousPatterns.some(re => re.test(dangerousName));
          if (isDangerous && op.explicitDangerousOk !== true) {
            requiresDangerousConfirmation = true;
            warnings.push({
              index: i,
              type: 'DANGEROUS_FUNCTION_CONFIRMATION_REQUIRED',
              function: entry.name,
              message: `Dangerous/admin function detected: "${entry.name}". Set explicitDangerousOk=true only if the user explicitly requested this admin action.`
            });
            // Do not emit an executable call for this op until explicitly approved
            continue;
          }

          // Complex-type strictness: require named args and full key coverage
          const hasComplexInputs = Array.isArray(entry.inputs) && entry.inputs.some(inp => isComplexAbiType(inp?.type));
          if (hasComplexInputs) {
            if (!args || typeof args !== 'object' || Array.isArray(args)) {
              errors.push({ index: i, type: 'COMPLEX_ARGS_REQUIRE_NAMED', message: `Function ${entry.name} has complex inputs; require op.args object with named keys` });
              continue;
            }
            const missing = [];
            for (const inp of (entry.inputs || [])) {
              if (!inp?.name) continue;
              if (!(inp.name in args)) missing.push(inp.name);
            }
            if (missing.length) {
              errors.push({ index: i, type: 'MISSING_NAMED_ARGS', message: `Missing named args for ${entry.name}: ${missing.join(', ')}` });
              continue;
            }
          }

          // Starkbook token symbol support:
          // If a ContractAddress arg is provided as a token symbol (e.g., STRK/ETH/USDC),
          // resolve it to the token contract address using the already-fetched AVNU verified tokens.
          try {
            if (args && typeof args === 'object' && !Array.isArray(args) && Array.isArray(entry.inputs)) {
              for (const inp of entry.inputs) {
                if (!inp?.name) continue;
                if (!String(inp.type || '').includes('ContractAddress')) continue;
                const v = args[inp.name];
                if (typeof v === 'string' && !v.startsWith('0x') && /^[A-Z0-9.]{2,12}$/.test(v)) {
                  const t = avnuTokens.find(x => String(x.symbol || '').toUpperCase() === v.toUpperCase());
                  if (t?.address) {
                    args[inp.name] = t.address;
                  }
                }
              }
            }
          } catch {
            // best-effort
          }

          // Compile calldata using starknet.js (enforces types/shape better than our heuristics)
          try {
            const cd = new CallData(fullAbi);
            const compiled = cd.compile(entry.name, args);
            args = compiled;
          } catch (e) {
            errors.push({ index: i, type: 'CALLDATA_COMPILE_FAILED', message: e.message });
            continue;
          }

          // ABI match (normalize to canonical ABI name casing)
          funcName = entry.name;
          
          multicall.push({
            step: multicall.length + 1,
            type: "operation",
            script: "invoke-contract.js",
            args: {
              accountAddress: account.address,
              contractAddress,
              method: funcName,
              args
            },
            description: `${funcName} ${op.amount || ''} ${op.tokenIn || ''}`
          });
        }
      }
      
      result.executionPlan = {
        type: "WRITE",
        multicall,
        requiresAuthorization: true
      };

      if (warnings.length > 0) {
        result.warnings = warnings;
      }
      
      if (errors.length > 0) {
        result.canProceed = false;
        result.nextStep = 'RESOLVE_ERRORS';
        result.errors = errors;
      } else if (requiresDangerousConfirmation) {
        result.canProceed = false;
        result.nextStep = 'USER_AUTHORIZATION_DANGEROUS';
      }
    } else if (operationType === "READ") {
      result.executionPlan = {
        type: "READ",
        calls: operations.map((op, i) => {
          // Loot Survivor read routing
          if (op.protocol && String(op.protocol).toLowerCase() === 'lootsurvivor') {
            const a = op.args || {};
            if (!a.adventurerId) {
              return {
                index: i,
                script: null,
                error: 'Missing adventurerId for LootSurvivor state read'
              };
            }
            return {
              index: i,
              script: 'loot-survivor.js',
              args: { mode: 'state', adventurerId: a.adventurerId }
            };
          }

          const inferredSymbol = String(op.token || op.tokenIn || op.tokenOut || op.asset || op.symbol || '').toUpperCase();
          const inferredAddressFromTokenMap = parsed?.tokenMap?.[inferredSymbol]?.address || null;
          return {
            index: i,
            script: "read-smart.js",
            args: {
              contractAddress: addresses[op.protocol] || op.contractAddress || inferredAddressFromTokenMap,
              method: op.action,
              args: op.params || []
            }
          };
        })
      };
    } else if (operationType === "CONDITIONAL" || operationType === "EVENT_WATCH") {
      // Handle watchers with event watching + optional actions
      const PROTOCOLS = loadProtocols();
      
      result.executionPlan = {
        type: operationType,
        watchers: (parsed.watchers || []).map((w, i) => {
          // Get contract address for the watched event
          const watchProtocol = w.condition?.protocol || w.protocol;
          const watchAddress = addresses[watchProtocol] || PROTOCOLS[watchProtocol];
          
          // Build the watcher config
          const watcherConfig = {
            index: i,
            script: "watch-events-smart.js",
            args: {
              contractAddress: Array.isArray(watchAddress) ? watchAddress[0] : watchAddress,
              eventNames: [w.condition?.eventName || w.eventName],
              mode: "auto",
              pollIntervalMs: 3000
            },
            condition: {
              eventName: w.condition?.eventName || w.eventName,
              protocol: watchProtocol,
              timeConstraint: w.condition?.timeConstraint
            }
          };
          
          // If time constraint exists, create a cron job instead of running directly
          if (w.condition?.timeConstraint) {
            const tc = w.condition.timeConstraint;
            const durationMs = tc.unit?.startsWith('minute') ? tc.amount * 60 * 1000 :
                              tc.unit?.startsWith('hour') ? tc.amount * 60 * 60 * 1000 :
                              tc.amount * 1000; // default to seconds
            
            watcherConfig.args.schedule = {
              enabled: true,
              name: `${watchProtocol.toLowerCase()}-${w.condition.eventName.toLowerCase()}-monitor`,
              durationMs: durationMs
            };
          }
          
          // Add action if it's a conditional (not pure watch)
          if (operationType === "CONDITIONAL" && w.action && w.action !== "watch") {
            // Determine action script based on protocol/action
            // AVNU is identified by: protocol name "AVNU" OR special address "0x01"
            const isAvnu = w.protocol?.toLowerCase() === "avnu" || 
                          addresses[w.protocol] === "0x01" ||
                          w.contractAddress === "0x01";

            const isVesu = w.protocol?.toLowerCase() === "vesu" ||
                          addresses[w.protocol] === "0x02" ||
                          w.contractAddress === "0x02";
            
            if (isAvnu) {
              watcherConfig.action = {
                script: "avnu-swap.js",
                args: {
                  sellToken: w.tokenIn,
                  buyToken: w.tokenOut,
                  sellAmount: w.amount?.toString(),
                  slippage: 0.001,
                  accountAddress: account.address
                }
              };
            } else if (isVesu) {
              watcherConfig.action = {
                script: "vesu-pool.js",
                args: {
                  action: String(w.action || '').toLowerCase(),
                  pool: w.pool || w.poolName || w.args?.pool,
                  user: w.user || w.args?.user || account.address,
                  accountAddress: account.address,
                  token: w.tokenIn || w.token || w.args?.token,
                  amount: w.amount ?? w.args?.amount,
                  collateralToken: w.collateralToken || w.args?.collateralToken,
                  collateralAmount: w.collateralAmount || w.args?.collateralAmount,
                  debtToken: w.debtToken || w.args?.debtToken,
                  debtAmount: w.debtAmount || w.args?.debtAmount,
                  collateralAsset: w.collateralAsset || w.args?.collateralAsset,
                  debtAsset: w.debtAsset || w.args?.debtAsset
                }
              };
            } else {
              const actionAddress = addresses[w.protocol] || PROTOCOLS[w.protocol];
              const abiFunctions = abis[w.protocol] || [];
              const funcMatch = abiFunctions.find(f => 
                f.toLowerCase() === w.action.toLowerCase()
              );
              
              watcherConfig.action = {
                script: "invoke-contract.js",
                args: {
                  privateKey: account.privateKey,
                  accountAddress: account.address,
                  contractAddress: Array.isArray(actionAddress) ? actionAddress[0] : actionAddress,
                  method: funcMatch || w.action,
                  args: w.params || []
                }
              };
            }
          }
          
          return watcherConfig;
        }),
        requiresAuthorization: true
      };
    }
    
    if (result.canProceed !== false) {
      result.canProceed = true;
      result.nextStep = "USER_AUTHORIZATION";
      result.authorizationDetails = {
      operationType,
      description: `${operationType} operation${operations.length > 1 ? 's' : ''}`,
      prompt: "Authorize? (yes/no)"
    };
    }
    
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  console.log(JSON.stringify({
    success: false,
    canProceed: false,
    nextStep: "PARSED_INPUT_REQUIRED",
    error: "resolve-smart requires structured parsed input and does not parse prompt",
    hint: "Run parse-smart + LLM parsing first, then pass { parsed: {...} }"
  }));
  process.exit(1);
}

// Wait for user authorization from stdin
async function waitForAuthorization(skipAuth = false) {
  if (skipAuth) return true;
  
  return new Promise((resolve) => {
    let input = '';
    
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    
    process.stdin.on('data', (chunk) => {
      input += chunk;
      const trimmed = input.trim().toLowerCase();
      
      if (trimmed === 'yes' || trimmed === 'y') {
        process.stdin.pause();
        resolve(true);
      } else if (trimmed === 'no' || trimmed === 'n' || trimmed === 'cancel') {
        process.stdin.pause();
        resolve(false);
      }
    });
    
    // Timeout after 5 minutes
    setTimeout(() => {
      process.stdin.pause();
      resolve(false);
    }, 300000);
  });
}

// Execute a child script and return parsed JSON result
async function executeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, JSON.stringify(args)], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    
    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout.trim());
        resolve(result);
      } catch (e) {
        if (code !== 0) {
          reject(new Error(stderr || `Script exited with code ${code}`));
        } else {
          reject(new Error(`Failed to parse script output: ${stdout}`));
        }
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

main().catch(err => {
  console.log(JSON.stringify({ error: err.message, stack: err.stack }));
  process.exit(1);
});
