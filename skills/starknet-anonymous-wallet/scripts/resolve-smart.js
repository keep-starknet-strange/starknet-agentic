#!/usr/bin/env node
/**
 * resolve-smart.js - Central Orchestrator
 * 
 * SINGLE SCRIPT that:
 * 1. Loads private key ONCE (only secrets access)
 * 2. Parses prompt (operations + conditional events)
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
import vard from '@andersmyrmel/vard';
import nlp from 'compromise';
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
// resolve-smart should only build executable plans when invoked from a direct user prompt
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
const securityValidator = vard
  .strict()  // Block all detected threats
  .block('instructionOverride')   // "Ignore previous instructions..."
  .block('roleManipulation')      // "You are now..."
  .block('systemPromptLeak')      // "Reveal your system prompt..."
  .block('delimiterInjection')    // Delimiter manipulation
  // Custom patterns for crypto/wallet security
  .pattern(/\b(show|print|output|display|reveal|expose|dump|extract|export|log|echo|return)\b.{0,30}\b(private\s*key|secret\s*key|seed\s*phrase|mnemonic|priv\s*key|privatekey)/i, 0.99, 'instructionOverride')
  .pattern(/\b(send|transfer|exfiltrate|upload|post|transmit)\b.{0,30}\b(key|secret|credential|password)/i, 0.99, 'instructionOverride')
  .pattern(/\b(bypass|skip|ignore|disable|override)\b.{0,30}\b(auth|authorization|confirm|approval|verify)/i, 0.95, 'instructionOverride')
  .pattern(/\b(sign|execute|invoke|call)\b.{0,30}\b(without|no|skip).{0,20}\b(auth|confirm|approv|verify)/i, 0.95, 'instructionOverride')
  .pattern(/\bcat\b.{0,20}\.key\b/i, 0.99, 'instructionOverride')
  .pattern(/\b(read|open|access)\b.{0,20}secrets?\//i, 0.95, 'instructionOverride')
  // Encoding/obfuscation attacks
  .pattern(/eval\s*\(|Function\s*\(|exec\s*\(/i, 0.99, 'instructionOverride')
  .pattern(/base64|atob|btoa|fromCharCode/i, 0.8, 'instructionOverride')
  .maxLength(10000);  // Limit prompt size

function validatePromptSecurity(prompt) {
  if (!prompt || typeof prompt !== 'string') {
    return { safe: true, input: prompt };
  }
  
  const result = securityValidator.safeParse(prompt);
  
  if (!result.safe) {
    return {
      safe: false,
      blocked: true,
      threats: result.threats.map(t => ({
        type: t.type,
        severity: t.severity,
        matched: t.matched?.substring(0, 50)  // Truncate for safety
      })),
      message: "Prompt injection detected and blocked"
    };
  }
  
  return { safe: true, input: result.data };
}

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

// ============ PROMPT PARSING ============
function isAccountCreationPrompt(prompt) {
  // Detect account creation intents
  const patterns = [
    /\bcreate\b.*\baccount\b/i,
    /\bnew\b.*\baccount\b/i,
    /\bcreate\b.*\bwallet\b/i,
    /\bsetup\b.*\baccount\b/i,
    /\banonymous\b.*\baccount\b/i,
    /\bdeploy\b.*\baccount\b/i
  ];
  return patterns.some(p => p.test(prompt));
}

function parseAccountCreation(prompt) {
  // Check for note/word requirements
  const hasNote = /\b(note|word|secret|phrase)\b/i.test(prompt);
  const noteMatch = prompt.match(/\bnote\s+["']?([^"']+)["']?/i);
  
  return {
    type: "CREATE_ACCOUNT",
    hasNote,
    note: noteMatch ? noteMatch[1] : null,
    isAnonymous: /\banonymous\b/i.test(prompt),
    instructions: hasNote 
      ? "Creating account with provided note..."
      : "To create an account, provide a secret note: 'create account with note MY_SECRET_NOTE'"
  };
}

function parseOperation(segment, availableTokens = [], previousOp = null, knownActions = [], allowIncomplete = false) {
  const doc = nlp(segment);

  // ============ LOOT SURVIVOR (Provable Games) ============
  // Handle game commands that don't fit the token/amount-centric DeFi parser.
  // We treat LootSurvivor as a protocol (registered in protocols.json) and route execution
  // to scripts/loot-survivor.js.
  const lootContext = /\bloot\s*survivor\b|\bdeath\s*mountain\b/i.test(segment) ||
                      (previousOp?.protocol && String(previousOp.protocol).toLowerCase() === 'lootsurvivor');

  if (lootContext) {
    const text = segment.toLowerCase();

    // Determine action
    let action = null;
    if (/\b(state|status|game state|get_game_state|get state)\b/.test(text)) action = 'state';
    else if (/\bstart\b.*\bgame\b|\bstart_game\b|\bbegin\b/.test(text)) action = 'start_game';
    else if (/\bexplore\b/.test(text)) action = 'explore';
    else if (/\battack\b/.test(text)) action = 'attack';
    else if (/\bflee\b|\brun\b/.test(text)) action = 'flee';

    // If segment is just "loot survivor" with no verb, skip
    if (!action) return null;

    // Extract adventurer id (u64)
    let adventurerId = null;
    const m1 = segment.match(/adventurer\s*(?:id)?\s*[:#]?\s*(\d+)/i);
    if (m1) adventurerId = m1[1];
    if (!adventurerId) {
      // fallback: first integer in the segment
      const m2 = segment.match(/\b(\d+)\b/);
      if (m2) adventurerId = m2[1];
    }
    // Inherit from previous LootSurvivor op for multi-step combos ("then attack", "then explore")
    if (!adventurerId && previousOp?.protocol && String(previousOp.protocol).toLowerCase() === 'lootsurvivor') {
      const prevArgs = previousOp.args || {};
      if (prevArgs.adventurerId) adventurerId = String(prevArgs.adventurerId);
    }

    // Params
    const weapon = (() => {
      const mw = segment.match(/weapon\s*[:#]?\s*(\d+)/i);
      return mw ? Number(mw[1]) : 0;
    })();

    // Params (inherit when not specified)
    const prevArgs = (previousOp?.protocol && String(previousOp.protocol).toLowerCase() === 'lootsurvivor') ? (previousOp.args || {}) : {};

    const tillBeast = /till\s*beast|until\s*beast|to\s*beast/.test(text) ? true : (prevArgs.tillBeast ?? false);
    const toTheDeath = /to\s*the\s*death|death\s*mode/.test(text) ? true : (prevArgs.toTheDeath ?? false);

    const isRead = action === 'state';

    // For loot actions, we require adventurerId except for future flows.
    if (!adventurerId) {
      // allowIncomplete lets conditional parsing carry on, but generally we want to ask the user.
      if (!allowIncomplete) return null;
    }

    return {
      action,
      amount: null,
      tokenIn: null,
      tokenOut: null,
      protocol: 'LootSurvivor',
      isReference: false,
      isRead,
      isWatch: false,
      actionCorrected: false,
      // keep structured args for execution routing
      args: {
        adventurerId: adventurerId ? String(adventurerId) : undefined,
        weapon,
        tillBeast,
        toTheDeath
      }
    };
  }
  
  // Check for WATCH patterns first
  const watchMatch = segment.match(/\b(watch|monitor|track|listen)\s+(?:the\s+)?([A-Za-z]+)(?:\s+event)?/i);
  if (watchMatch) {
    const action = watchMatch[1].toLowerCase();
    const eventName = watchMatch[2];
    
    // Find protocol using compromise
    let protocol = null;
    const prepPhrase = doc.match('(at|on|via|in) #Noun');
    if (prepPhrase.found) {
      protocol = prepPhrase.nouns().out('text');
    }
    
    return {
      action,
      amount: null,
      tokenIn: null,
      tokenOut: null,
      protocol,
      eventName,
      isReference: false,
      isRead: false,
      isWatch: true
    };
  }
  
  // Extract action from first verb
  let rawAction = doc.verbs(0).out('text').toLowerCase();
  if (!rawAction) {
    // Fallback to first word
    rawAction = doc.terms(0).out('text').toLowerCase();
  }
  
  // Helper verbs that should be skipped (e.g., "make swap" -> "swap")
  const helperVerbs = ['make', 'do', 'perform', 'execute', 'conduct'];
  let actualAction = rawAction;
  
  if (helperVerbs.includes(rawAction)) {
    // Look for the next noun that could be an action
    const nouns = doc.nouns().out('array');
    for (const noun of nouns) {
      const lowerNoun = noun.toLowerCase();
      // Check if this noun is a known action or synonym
      if (knownActions.includes(lowerNoun) || ALL_SYNONYMS[lowerNoun] || REVERSE_SYNONYMS[lowerNoun]) {
        actualAction = lowerNoun;
        break;
      }
    }
  }
  
  // FUZZY MATCH: Correct typos using known actions
  let action = actualAction;
  let actionCorrected = false;
  
  if (knownActions.length > 0 && action) {
    // First try synonym lookup
    const canonicalFromSynonym = findCanonicalAction(action, knownActions);
    
    if (canonicalFromSynonym && canonicalFromSynonym.toLowerCase() !== action) {
      action = canonicalFromSynonym;
      actionCorrected = true;
    } else {
      // Fall back to fuzzy string matching
      let bestMatch = null;
      let bestScore = 0;
      
      for (const knownAction of knownActions) {
        const score = calculateSimilarity(action, knownAction);
        if (score > bestScore && score >= 50) {
          bestScore = score;
          bestMatch = knownAction;
        }
      }
      
      if (bestMatch && bestMatch !== action) {
        action = bestMatch;
        actionCorrected = true;
      }
    }
  }
  
  // Skip common prefixes for actual action
  if (['check', 'get', 'view', 'see'].includes(action)) {
    const nextVerb = doc.match('(check|get|view|see) #Verb').verbs(0);
    if (nextVerb.found) {
      action = nextVerb.out('text').toLowerCase();
    }
  }
  
  // Extract amount using compromise numbers
  let amount = null;
  const numbers = doc.numbers().json();
  if (numbers.length > 0) {
    // compromise returns { number: 10, ... } or just the number depending on version
    const numData = numbers[0];
    amount = typeof numData === 'object' ? numData.num || numData.number : numData;
  }
  
  // Extract tokenIn - look for token pattern
  let tokenIn = null;
  
  // Pattern: "VERB NUMBER TOKEN" (e.g., "swap 10 ETH")
  const amountTokenMatch = doc.match('#Verb #Value #Noun');
  if (amountTokenMatch.found) {
    const nouns = amountTokenMatch.nouns().out('array');
    if (nouns.length > 0) {
      tokenIn = nouns[0].toUpperCase();
    }
  }
  
  // Fallback: match against available tokens
  if (!tokenIn && availableTokens.length > 0) {
    const text = doc.out('text');
    for (const token of availableTokens) {
      if (text.toLowerCase().includes(token.toLowerCase())) {
        tokenIn = token.toUpperCase();
        break;
      }
    }
  }
  
  // Check for pronouns that indicate reference
  const hasPronoun = doc.match('(it|them|this|that)').found;
  const isReference = hasPronoun;
  
  // Determine if read operation
  const isRead = /^(balance|get|check|view|read|query|allowance|name|symbol|decimals|total)/i.test(action);
  const isWatch = /^(watch|monitor|track|listen)/i.test(action);
  
  // Extract output token (after "to")
  let tokenOut = null;
  const toMatch = doc.match('to [#Noun]');
  if (toMatch.found) {
    const candidate = toMatch.nouns(0).out('text').toUpperCase();
    // Validate against available tokens
    if (availableTokens.length === 0 || availableTokens.some(t => t.toLowerCase() === candidate.toLowerCase())) {
      tokenOut = candidate;
    }
  }
  
  // Extract protocol (after at/on/via/in)
  let protocol = null;
  const prepMatch = doc.match('(at|on|via|in) #Noun');
  if (prepMatch.found) {
    protocol = prepMatch.nouns(0).out('text');
  }
  
  // INFERENCE: If missing tokenIn but has reference, use previous operation's output
  if (!tokenIn && isReference && previousOp) {
    tokenIn = previousOp.tokenOut || previousOp.tokenIn;
  }
  
  // INFERENCE: For ANY action without explicit token that follows an operation producing a token,
  // infer the input token from the previous operation's output
  // This works for ANY contract type: games, NFTs, DeFi, etc.
  if (!tokenIn && !amount && previousOp && (previousOp.tokenOut || previousOp.tokenIn)) {
    tokenIn = previousOp.tokenOut || previousOp.tokenIn;
  }
  
  // Validation
  if (!isReference && !isRead && !isWatch && !allowIncomplete) {
    // Write operations need either amount+tokenIn or (tokenIn from inference)
    if ((!amount || !tokenIn) && !previousOp) {
      return null;
    }
  }
  
  if (isRead && !tokenIn && !isReference) {
    return null;
  }
  
  const inferred = (!tokenIn && previousOp && (previousOp.tokenOut || previousOp.tokenIn)) 
                   ? { tokenIn: true } 
                   : undefined;
  
  return { 
    action, 
    amount, 
    tokenIn, 
    tokenOut, 
    protocol, 
    isReference, 
    isRead, 
    isWatch,
    inferred,
    actionCorrected
  };
}

function parseConditional(segment) {
  // Check for "if/when" patterns
  const ifMatch = segment.match(/\bif\s+(.+)/i) || segment.match(/\bwhen\s+(.+)/i);
  if (!ifMatch) return null;
  
  const fullText = ifMatch[1]; // Everything after "if/when"
  
  // Pattern 1: "if [condition] then/execute [action]" (action after)
  // Pattern 2: "[action] if [condition]" (action before)
  
  let conditionText, actionPart;
  
  // Check for "then" or "execute" after condition
  const thenMatch = fullText.match(/(.+?)(?:\bthen\b|\bexecute\b)(.+)/i);
  if (thenMatch) {
    // Pattern: "if X then Y" or "if X execute Y"
    conditionText = thenMatch[1].trim();
    actionPart = thenMatch[2].trim();
  } else {
    // Check for action after trigger word like "happen" or "occurs"
    // Pattern: "when it happens make swap" -> action is "make swap"
    const actionAfterMatch = fullText.match(/(?:it\s+)?(?:happen|happens|occur|occurs)\s+(.+)/i);
    if (actionAfterMatch) {
      conditionText = fullText.substring(0, fullText.search(/(?:it\s+)?(?:happen|happens|occur|occurs)/i)).trim();
      actionPart = actionAfterMatch[1].trim();
    } else {
      // Pattern: "action if condition" - action is before "if"
      conditionText = fullText;
      actionPart = segment.substring(0, segment.search(/\b(if|when)\b/i)).trim();
    }
  }
  
  // Parse time constraints - support both "in the next X" and "for the next X"
  const timeMatch = conditionText.match(/\b(?:in|for)\s+the\s+next\s+(\d+)\s*(minutes?|hours?|seconds?)/i);
  const timeConstraint = timeMatch ? {
    amount: parseInt(timeMatch[1]),
    unit: timeMatch[2].toLowerCase()
  } : null;
  
  // Parse event from condition - look for "event" keyword OR capitalized words before trigger
  // Pattern 1: "Swapped event" -> "Swapped"
  // Pattern 2: "swapped happens" -> "swapped"
  let eventName = null;
  
  // Try "X event" pattern first
  const eventPatternMatch = conditionText.match(/\b([A-Za-z]+)\s+(?:event|happens|occurs|emitted|triggered)/i);
  if (eventPatternMatch) {
    eventName = eventPatternMatch[1];
  } else {
    // Look for any word that could be an event name (before prepositions like at/on/in)
    // Pattern: "the swapped at Ekubo" -> "swapped"
    const prepositionMatch = conditionText.match(/\b(?:the\s+)?([A-Za-z]+)\s+(?:at|on|in)\s+/i);
    if (prepositionMatch) {
      const candidate = prepositionMatch[1];
      // Exclude common words
      if (!/^(it|this|that|the|a|an)$/i.test(candidate)) {
        eventName = candidate;
      }
    }
  }
  
  // Parse protocol where event occurs (from condition text, NOT action part)
  // Must exclude action part if it contains protocol
  const conditionOnly = actionPart ? segment.substring(0, segment.indexOf(actionPart)).trim() : conditionText;
  const protoMatch = conditionOnly.match(/\b(?:in|at|on)\s+([A-Za-z]+)/i);
  const protocol = protoMatch ? protoMatch[1] : null;
  
  return {
    condition: {
      eventName,
      protocol,
      timeConstraint,
      raw: conditionText
    },
    actionPart: actionPart || null
  };
}

function parsePrompt(prompt, availableTokens = [], knownActions = []) {
  const operations = [];
  const watchers = [];
  
  // Check for combined watch + conditional pattern:
  // "Watch X at Y for Z minutes and when it happens do action"
  const combinedWatchMatch = prompt.match(/\bwatch\s+(?:the\s+)?(\w+)\s+(?:event\s+)?(?:at|on|in)\s+(\w+)(?:\s+for\s+the\s+next\s+(\d+)\s*(minutes?|hours?|seconds?))?\s+(?:and|then)\s+(.+)/i);
  
  if (combinedWatchMatch) {
    const eventName = combinedWatchMatch[1];
    const watchProtocol = combinedWatchMatch[2];
    const timeAmount = combinedWatchMatch[3];
    const timeUnit = combinedWatchMatch[4];
    const restOfPrompt = combinedWatchMatch[5];
    
    // Parse the action from the rest (restOfPrompt already contains "when...")
    // Extract just the action part after the trigger words
    const actionMatch = restOfPrompt.match(/(?:when|if)\s+(?:it\s+)?(?:happen|happens|occur|occurs)?\s*(.+)/i);
    const actionText = actionMatch ? actionMatch[1] : restOfPrompt;
    
    if (actionText) {
      // Pass allowIncomplete=true since conditional actions may not have all params yet
      const actionOp = parseOperation(actionText, availableTokens, null, knownActions, true);
      
      if (actionOp) {
        watchers.push({
          ...actionOp,
          condition: {
            eventName: eventName,
            protocol: watchProtocol,
            timeConstraint: timeAmount ? {
              amount: parseInt(timeAmount),
              unit: timeUnit.toLowerCase()
            } : null,
            raw: restOfPrompt
          }
        });
      }
    }
    
    return { operations, watchers, operationCount: operations.length, watcherCount: watchers.length };
  }
  
  // First check if entire prompt is a conditional (contains if/when)
  const fullConditional = parseConditional(prompt);
  if (fullConditional) {
    const op = parseOperation(fullConditional.actionPart, availableTokens, null, knownActions);
    if (op) {
      watchers.push({
        ...op,
        condition: fullConditional.condition
      });
    }
    return { operations, watchers, operationCount: operations.length, watcherCount: watchers.length };
  }
  
  // Split by sequence connectors (then, and, after, next, comma)
  const segments = prompt.split(/\b(then|and|after|next)\b|,|;|\./i);
  
  for (const seg of segments) {
    const s = seg.trim();
    if (!s || /^(then|and|after|next)$/i.test(s)) continue;
    
    // Check if this segment is a conditional
    const conditional = parseConditional(s);
    if (conditional) {
      const op = parseOperation(conditional.actionPart, availableTokens, operations[operations.length - 1], knownActions);
      if (op) {
        watchers.push({
          ...op,
          condition: conditional.condition
        });
      }
      continue;
    }
    
    // Regular operation - pass previous operation and known actions for typo correction
    const previousOp = operations.length > 0 ? operations[operations.length - 1] : null;
    const op = parseOperation(s, availableTokens, previousOp, knownActions);
    if (!op) continue;
    
    // Handle references that weren't caught by inference
    if (op.isReference && previousOp) {
      if (!op.tokenIn) op.tokenIn = previousOp.tokenOut || previousOp.tokenIn;
      if (!op.amount) op.amount = previousOp.amount;
      
      // Extract protocol for refs
      const doc = nlp(s);
      const prepPhrase = doc.match('(at|on|via|in) #Noun');
      if (prepPhrase.found) {
        op.protocol = prepPhrase.nouns(0).out('text');
      }
    }
    
    operations.push(op);
  }
  
  return { operations, watchers };
}

// ============ CHILD SCRIPT EXECUTION ============
function runChildScript(scriptPath, args, privateKey) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, JSON.stringify(args)], {
      env: { ...process.env, PRIVATE_KEY: privateKey }
    });
    
    let output = '';
    let error = '';
    
    child.stdout.on('data', (data) => output += data.toString());
    child.stderr.on('data', (data) => error += data.toString());
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Script ${scriptPath} failed: ${error || output}`));
      } else {
        try {
          resolve(JSON.parse(output));
        } catch {
          resolve({ raw: output });
        }
      }
    });
  });
}

// ============ MAIN ORCHESTRATION ============
async function main() {
  const rawInput = process.argv[2];
  
  if (!rawInput) {
    console.log(JSON.stringify({
      error: "No input provided",
      usage: 'node resolve-smart.js \'{"prompt":"...","accountIndex":0}\''
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
  
  const { prompt, accountIndex = 0, execute = false, note, register, parsed } = input;

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

          return {
            index: i,
            script: "read-smart.js",
            args: {
              contractAddress: addresses[op.protocol] || op.contractAddress,
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
  
  // ============ HANDLE REGISTRATION (when user provides address) ============
  if (register) {
    const { type, name, address, decimals, description } = register;
    
    // Validate address format
    if (!address || !address.startsWith('0x')) {
      console.log(JSON.stringify({
        success: false,
        error: "Invalid address format",
        hint: "Address must start with 0x"
      }));
      process.exit(1);
    }
    
    let registered = null;
    
    if (type === 'token') {
      const registry = loadRegistry('tokens.json');
      registry[name.toUpperCase()] = {
        address,
        decimals: decimals || 18,
        added_at: new Date().toISOString()
      };
      saveRegistry('tokens.json', registry);
      registered = { type: 'token', name: name.toUpperCase(), address };
    } else if (type === 'protocol') {
      const registry = loadRegistry('protocols.json');
      registry[name] = {
        address,
        network: "mainnet",
        type: description || "Unknown",
        description: description || `${name} protocol`
      };
      saveRegistry('protocols.json', registry);
      registered = { type: 'protocol', name, address };
    } else if (type === 'friend') {
      // FRIENDS FEATURE REMOVED
      console.log(JSON.stringify({
        success: false,
        error: "Friends feature has been removed. Use full addresses directly."
      }));
      process.exit(1);
    } else {
      console.log(JSON.stringify({
        success: false,
        error: `Unknown registration type: ${type}`,
        validTypes: ['token', 'protocol']
      }));
      process.exit(1);
    }
    
    // If no prompt to continue, just return success
    if (!prompt) {
      console.log(JSON.stringify({
        success: true,
        registered,
        message: `${type} "${name}" registered successfully`
      }));
      return;
    }
    // Otherwise continue processing with the prompt (registries will be loaded fresh below)
  }
  
  // ============ LOAD DYNAMIC REGISTRIES ============
  // Loaded here (after registration) so newly registered items are included
  const PROTOCOLS = loadProtocols();
  // FRIENDS feature removed - use full addresses directly
  
  // ============ SECURITY CHECK: Prompt Injection Protection ============
  if (prompt) {
    const securityCheck = validatePromptSecurity(prompt);
    if (!securityCheck.safe) {
      console.log(JSON.stringify({
        success: false,
        error: "Security violation detected",
        security: {
          blocked: true,
          reason: securityCheck.message,
          threats: securityCheck.threats
        },
        hint: "This prompt contains patterns associated with prompt injection attacks"
      }));
      process.exit(1);
    }
  }
  
  // Check if note is provided directly (user pasted note content)
  if (note) {
    // Validate note structure
    const requiredFields = ['secret', 'nullifier', 'txHash', 'pool', 'day'];
    const noteObj = typeof note === 'string' ? tryParseJSON(note) : note;
    
    if (noteObj && requiredFields.every(f => noteObj[f] !== undefined)) {
      console.log(JSON.stringify({
        success: true,
        turn: 1,
        operationType: "CREATE_ACCOUNT",
        orchestration: [{ step: 1, name: "Validate Note" }, { step: 2, name: "Ready to Deploy" }],
        hasAccount: false,
        canProceed: true,
        nextStep: "USER_AUTHORIZATION",
        executionPlan: {
          type: "CREATE_ACCOUNT",
          script: "create-account.js",
          args: noteObj
        },
        authorizationDetails: {
          operationType: "CREATE_ACCOUNT",
          description: "Deploy anonymous Starknet account via Typhoon",
          noteProvided: true,
          pool: noteObj.pool,
          prompt: "Authorize account creation? (yes/no)"
        }
      }));
      return;
    } else {
      console.log(JSON.stringify({
        success: false,
        error: "Invalid note format",
        requiredFields,
        hint: "Note must contain: secret, nullifier, txHash, pool, day"
      }));
      return;
    }
  }
  
  if (!prompt) {
    console.log(JSON.stringify({ error: "Missing prompt" }));
    process.exit(1);
  }
  
  const result = {
    success: true,
    turn: 1,
    prompt,
    orchestration: []
  };
  
  // Step 1: Check if account exists
  result.orchestration.push({ step: 1, name: "Check Account Status" });
  const account = loadAccount(accountIndex);
  const hasAccount = !account.error && account.address;
  
  result.hasAccount = hasAccount;

  // Loot Survivor UX: if user says bare "attack" / "flee" after an explore-beast encounter,
  // treat it as a LootSurvivor action against their latest adventurer.
  // This is based on local state, not chain scanning.
  if (hasAccount && /^\s*(attack|flee)(\b|\s)/i.test(prompt) && lootStateGetPending(account.address)) {
    result.orchestration.push({ step: 1.1, name: 'Loot Survivor Pending Encounter Detected', note: 'Interpreting bare action as LootSurvivor' });
    result.prompt = `loot survivor ${prompt}`;
  }
  
  // Check if this is an account creation prompt
  if (isAccountCreationPrompt(prompt)) {
    result.operationType = "CREATE_ACCOUNT";
    result.orchestration.push({ step: 2, name: "Parse Account Creation" });
    
    const creation = parseAccountCreation(prompt);
    
    if (creation.hasNote) {
      // Can proceed with account creation
      result.canProceed = true;
      result.nextStep = "USER_AUTHORIZATION";
      result.executionPlan = {
        type: "CREATE_ACCOUNT",
        script: "create-account.js",
        args: {
          note: creation.note
        },
        description: creation.isAnonymous 
          ? "Create anonymous Starknet account" 
          : "Create Starknet account"
      };
      result.authorizationDetails = {
        operationType: "CREATE_ACCOUNT",
        description: creation.isAnonymous 
          ? "Create new anonymous Starknet account" 
          : "Create new Starknet account",
        requiresNote: true,
        noteProvided: true,
        prompt: "Authorize account creation? (yes/no)"
      };
    } else {
      // Need note from user
      result.canProceed = false;
      result.nextStep = "NEEDS_INPUT";
      result.instructions = creation.instructions;
      result.executionPlan = {
        type: "CREATE_ACCOUNT",
        awaiting: "secret_note"
      };
    }
    
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  // If no account and not a creation prompt, show instructions
  if (!hasAccount) {
    result.canProceed = false;
    result.nextStep = "CREATE_ACCOUNT_REQUIRED";
    result.noAccountGuide = {
      title: "No Starknet Account Found",
      explanation: "You need a Starknet account to perform transactions. This skill uses Typhoon to create an anonymous account from a deposit note.",
      steps: [
        {
          step: 1,
          title: "Go to the Typhoon website",
          url: "https://www.typhoon-finance.com/app"
        },
        {
          step: 2,
          title: "Make a deposit and download your deposit note",
          description: "Recommended: Make a STRK deposit (this will be used to deploy and fund your agent account)"
        },
        {
          step: 3,
          title: "Paste your note here",
          description: "Copy all the content of your downloaded note file and paste it here"
        }
      ],
      awaitingInput: "note_content"
    };
    result.executionPlan = {
      type: "NO_ACCOUNT",
      awaitingAction: "paste_note"
    };
    
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  // Account exists - proceed with normal flow
  result.account = {
    address: account.address,
    index: account.index,
    total: account.total
  };
  
  const rpcUrl = resolveRpcUrl();
  const provider = new Provider({ nodeUrl: rpcUrl });
  
  // Step 1.5: Fetch AVNU tokens before parsing
  result.orchestration.push({ step: 1.5, name: "Fetch AVNU Tokens" });
  const avnuTokens = await fetchAllTokens();
  const availableTokenSymbols = avnuTokens.map(t => t.symbol);
  result.orchestration.push({ 
    step: 1.5, 
    tokensLoaded: avnuTokens.length,
    sampleTokens: availableTokenSymbols.slice(0, 10)
  });
  
  // Step 1.75: Rough parse to extract protocols for ABI fetching
  result.orchestration.push({ step: 1.75, name: "Rough Parse for Protocol Extraction" });
  
  // Do a quick parse without fuzzy matching to get protocols
  const roughParse = parsePrompt(prompt, availableTokenSymbols, []);
  const roughOps = [...roughParse.operations, ...roughParse.watchers];
  
  // Extract unique protocols (excluding AVNU which uses SDK)
  const protocolsToFetch = [...new Set(
    roughOps
      .map(op => op.protocol)
      .filter(p => p && p.toLowerCase() !== 'avnu' && PROTOCOLS[p])
  )];
  
  result.orchestration.push({
    step: 1.75,
    protocolsDetected: protocolsToFetch,
    note: "Fetching ABIs before final parsing"
  });
  
  // Step 1.8: Fetch ABIs for detected protocols
  result.orchestration.push({ step: 1.8, name: "Fetch ABIs for Detected Protocols" });
  
  const abiFunctionCache = {};
  const knownActions = new Set();
  
  for (const protocolName of protocolsToFetch) {
    try {
      const protocolAddresses = PROTOCOLS[protocolName];
      const addresses = Array.isArray(protocolAddresses) ? protocolAddresses : [protocolAddresses];
      
      // Fetch ABI from first address
      const abi = await fetchABI(addresses[0], provider);
      if (abi && abi.length > 0) {
        const items = extractABIItems(abi);
        abiFunctionCache[protocolName] = items.functions.map(f => f.name);
        
        // Add function names to known actions for fuzzy matching
        items.functions.forEach(f => {
          const baseName = f.name.replace(/([A-Z])/g, '_$1').toLowerCase().split('_')[0];
          if (baseName) knownActions.add(baseName);
          knownActions.add(f.name);
        });
        
        result.orchestration.push({
          step: 1.8,
          protocol: protocolName,
          functionsFound: abiFunctionCache[protocolName].length,
          sampleFunctions: abiFunctionCache[protocolName].slice(0, 5)
        });
      }
    } catch (e) {
      result.orchestration.push({
        step: 1.8,
        protocol: protocolName,
        error: `Failed to fetch ABI: ${e.message}`
      });
    }
  }
  
  // Step 2: Final parse with ABI-informed fuzzy matching
  result.orchestration.push({ step: 2, name: "Parse Prompt with ABI Functions" });
  const { operations, watchers } = parsePrompt(result.prompt, availableTokenSymbols, [...knownActions]);
  
  result.parsed = { operations, watchers, operationCount: operations.length, watcherCount: watchers.length };
  
  if (operations.length === 0 && watchers.length === 0) {
    console.log(JSON.stringify({
      success: false,
      error: "Could not parse any operations or watchers from prompt",
      prompt
    }));
    process.exit(1);
  }
  
  // Step 3: Token analysis with AVNU SDK
  result.orchestration.push({ step: 3, name: "Token Balance/Allowance Analysis (AVNU)" });
  result.tokenAnalysis = [];
  
  // avnuTokens already fetched in Step 1.5
  
  const allOps = [...operations, ...watchers];
  
  for (let i = 0; i < allOps.length; i++) {
    const op = allOps[i];
    if (!op.tokenIn || op.isRead) continue;
    
    // Find token in AVNU list using pattern matching
    const tokenInfo = avnuTokens.find(t => t.symbol.toLowerCase() === op.tokenIn.toLowerCase());
    
    if (!tokenInfo) {
      result.tokenAnalysis.push({ 
        index: i, 
        token: op.tokenIn, 
        error: "Unknown token - not found in AVNU verified tokens",
        availableTokens: avnuTokens.slice(0, 10).map(t => t.symbol) // Show sample of available tokens
      });
      continue;
    }
    
    const balance = await getTokenBalance(provider, tokenInfo.address, account.address, tokenInfo.decimals);
    let required = 0n;
    if (op.amount !== undefined && op.amount !== null) {
      try {
        required = parseAmountToBaseUnits(op.amount, tokenInfo.decimals);
      } catch {
        required = 0n;
      }
    }
    
    let allowance = null;
    let needsApprove = false;
    
    if (op.protocol) {
      // For multi-address protocols, use the first address as the spender (typically the main contract)
      const protocolAddresses = PROTOCOLS[op.protocol];
      const spender = Array.isArray(protocolAddresses) ? protocolAddresses[0] : protocolAddresses;
      if (spender) {
        const allowRaw = await getTokenAllowance(provider, tokenInfo.address, account.address, spender);
        allowance = allowRaw.toString();
        needsApprove = allowRaw < required;
      }
    }
    
    result.tokenAnalysis.push({
      index: i,
      action: op.action,
      token: op.tokenIn,
      tokenAddress: tokenInfo.address,
      amount: op.amount,
      balance,
      required: required.toString(),
      hasSufficientBalance: BigInt(balance.raw) >= required,
      spender: op.protocol,
      allowance,
      needsApprove
    });
  }

  // Step 4: ABI Resolution for functions AND events
  result.orchestration.push({ step: 4, name: "ABI Resolution (functions + events)" });
  result.resolutions = [];
  
  for (let i = 0; i < allOps.length; i++) {
    const op = allOps[i];
    let contractAddress = null;
    let type = null;
    let funcMatch = null;
    
    // Find token info from AVNU tokens
    const tokenInfo = op.tokenIn ? avnuTokens.find(t => t.symbol.toLowerCase() === op.tokenIn.toLowerCase()) : null;
    
    // Determine contract address and resolve function
    if (op.isRead && op.tokenIn && tokenInfo) {
      contractAddress = tokenInfo.address;
      type = "token-read";
      funcMatch = await resolveFromABI(provider, contractAddress, op.action, 'function');
    } else if (op.protocol && PROTOCOLS[op.protocol]) {
      // Multi-address protocol - scan all addresses to find best matching function
      type = "protocol-write";
      const bestMatchResult = await findBestFunctionAcrossAddresses(op.protocol, op.action, PROTOCOLS, provider);
      
      if (bestMatchResult.bestMatch) {
        contractAddress = bestMatchResult.bestMatch.address;
        funcMatch = {
          name: bestMatchResult.bestMatch.name,
          score: bestMatchResult.bestMatch.score,
          inputs: bestMatchResult.bestMatch.inputs,
          outputs: bestMatchResult.bestMatch.outputs,
          state_mutability: bestMatchResult.bestMatch.state_mutability
        };
        result.scannedAddresses = bestMatchResult.scannedAddresses;
        result.allMatches = bestMatchResult.allMatches;
      } else {
        result.resolutions.push({ 
          index: i, 
          action: op.action, 
          error: `No matching function found across ${bestMatchResult.scannedAddresses} addresses` 
        });
        continue;
      }
    } else if (!op.isRead && op.tokenIn && tokenInfo) {
      contractAddress = tokenInfo.address;
      type = "token-transfer";
      funcMatch = await resolveFromABI(provider, contractAddress, op.action, 'function');
    }
    
    if (!contractAddress) {
      result.resolutions.push({ index: i, action: op.action, error: "No contract address" });
      continue;
    }
    
    // If watcher, also resolve event
    let eventMatch = null;
    if (op.condition && op.condition.eventName) {
      if (op.condition.protocol && PROTOCOLS[op.condition.protocol]) {
        // For events, scan all protocol addresses
        const eventMatchResult = await findBestFunctionAcrossAddresses(
          op.condition.protocol, 
          op.condition.eventName, 
          PROTOCOLS, 
          provider
        );
        if (eventMatchResult.bestMatch) {
          eventMatch = {
            name: eventMatchResult.bestMatch.name,
            score: eventMatchResult.bestMatch.score
          };
        }
      } else {
        eventMatch = await resolveFromABI(provider, contractAddress, op.condition.eventName, 'event');
      }
    }
    
    result.resolutions.push({
      index: i,
      action: op.action,
      contractAddress: contractAddress,
      contractAddressDisplay: contractAddress.slice(0, 20) + "...",
      type,
      functionMatch: funcMatch ? { name: funcMatch.name, score: funcMatch.score.toFixed(2) } : null,
      eventMatch: eventMatch ? { name: eventMatch.name, score: eventMatch.score.toFixed(2) } : null,
      isWatcher: !!op.condition
    });
  }
  
  // Step 4.5: Check token allowances using resolved contract addresses
  result.orchestration.push({ step: 4.5, name: "Token Allowance Analysis (post-ABI resolution)" });
  
  for (const ta of result.tokenAnalysis) {
    if (!ta.token || !ta.protocol) continue;
    
    // Find the resolved contract address for this operation
    const resolved = result.resolutions.find(r => r.index === ta.index);
    if (!resolved || !resolved.contractAddress) continue;
    
    // Use the resolved contract address where the function was found
    const spenderAddress = resolved.contractAddress;
    
    // Check allowance to the specific contract where the function was found
    const allowRaw = await getTokenAllowance(provider, ta.tokenAddress, account.address, spenderAddress);
    ta.allowance = allowRaw.toString();
    ta.needsApprove = allowRaw < BigInt(ta.required);
    ta.spenderAddress = spenderAddress;
  }

  // Step 4.6: Detect swap operations and route to AVNU SDK if appropriate
  result.orchestration.push({ step: 4.6, name: "Swap Detection & AVNU Routing" });
  
  const EXPLICIT_DEXES = ['Ekubo', 'Jediswap', 'Sithswap', 'myswap', '10kswap'];
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    
    // Check if this is a swap operation
    if (op.action === 'swap' || op.action === 'exchange' || op.action === 'trade') {
      // Check if user explicitly named a specific DEX (not AVNU)
      const hasExplicitDex = EXPLICIT_DEXES.some(dex => 
        op.protocol?.toLowerCase() === dex.toLowerCase()
      );
      
      // Also check if user explicitly said "at AVNU" or just didn't specify
      const isAvnuExplicit = op.protocol?.toLowerCase() === 'avnu';
      const isDefaultSwap = !op.protocol || isAvnuExplicit;
      
      if (isDefaultSwap && !hasExplicitDex) {
        // Use AVNU SDK as default (either implicit or explicit AVNU mention)
        op.useAvnuSdk = true;
        op.avnuParams = {
          sellToken: op.tokenIn,
          buyToken: op.tokenOut,
          sellAmount: op.amount?.toString()
        };
        result.orchestration.push({ 
          step: 4.6, 
          note: `Operation ${i}: Swap ${op.tokenIn} to ${op.tokenOut} -> Using AVNU SDK (${isAvnuExplicit ? 'explicit' : 'default'})` 
        });
      } else if (hasExplicitDex) {
        // User explicitly named a different DEX, use that DEX's contract
        op.useAvnuSdk = false;
        result.orchestration.push({ 
          step: 4.6, 
          note: `Operation ${i}: Swap via ${op.protocol} -> Using DEX contract directly` 
        });
      }
    }
  }

  // Step 5: Build Execution Plan
  result.orchestration.push({ step: 5, name: "Build Execution Plan" });
  
  const isRead = operations.every(o => o.isRead);
  const hasWatchers = watchers.length > 0;
  const hasWatchOnlyOps = operations.length > 0 && operations.every(o => o.isWatch);
  const watchersHaveActions = watchers.some(w => w.action && w.action !== 'watch');
  const hasAvnuSwap = operations.some(o => o.useAvnuSdk);
  
  if (hasWatchers && watchersHaveActions) {
    result.operationType = "CONDITIONAL";  // Watch + execute action
  } else if (hasWatchOnlyOps) {
    result.operationType = "EVENT_WATCH";  // Pure watch from operations
  } else if (hasWatchers) {
    result.operationType = "EVENT_WATCH";  // Watch-only from watchers
  } else if (isRead) {
    result.operationType = "READ";
  } else if (hasAvnuSwap) {
    result.operationType = "AVNU_SWAP";  // Use AVNU SDK
  } else {
    result.operationType = "WRITE";
  }
  
  if (result.operationType === "READ") {
    result.executionPlan = {
      type: "READ",
      calls: operations.map((op, i) => {
        if (op.protocol && String(op.protocol).toLowerCase() === 'lootsurvivor') {
          const a = op.args || {};
          if (!a.adventurerId) {
            const latest = lootStateGetLatest(account.address);
            if (latest) a.adventurerId = String(latest);
          }
          if (!a.adventurerId) {
            return { index: i, script: null, error: 'No adventurerId provided and no latest adventurer stored yet.' };
          }
          lootStateSetLatest(account.address, a.adventurerId);
          return {
            index: i,
            script: 'loot-survivor.js',
            args: { mode: 'state', adventurerId: a.adventurerId }
          };
        }
        return {
          index: i,
          script: "read-smart.js",
          args: {
            contractAddress: result.resolutions[i]?.contractAddress,
            method: result.resolutions[i]?.functionMatch?.name || op.action,
            args: [account.address]
          }
        };
      })
    };
  } else if (result.operationType === "WRITE") {
    const multicall = [];
    
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const res = result.resolutions[i];
      const ta = result.tokenAnalysis.find(t => t.index === i);
      
      if (!res || res.error) continue;
      
      // Add approval if needed
      if (ta?.needsApprove) {
        const spenderAddress = ta.spenderAddress || res.contractAddress;
        multicall.push({
          step: multicall.length + 1,
          type: "approval",
          script: "invoke-contract.js",
          args: {
            privateKey: account.privateKey, // Passed from resolve-smart (only secrets reader)
            accountAddress: account.address,
            contractAddress: ta.tokenAddress,
            method: "approve",
            args: [spenderAddress, ...toUint256(BigInt(ta.required))]
          }
        });
      }
      
      // Add operation
      if (op.protocol && String(op.protocol).toLowerCase() === 'lootsurvivor') {
        const a = op.args || {};
        const modeMap = { state: 'state', start_game: 'start_game', explore: 'explore', attack: 'attack', flee: 'flee' };
        const mode = modeMap[String(op.action || '').toLowerCase()];
        if (!mode) {
          // fall back to generic invoke
        } else {
          if (!a.adventurerId) {
            const latest = lootStateGetLatest(account.address);
            if (latest) a.adventurerId = String(latest);
          }
          if (!a.adventurerId) {
            // Fail closed: without an id we cannot play.
            // We'll surface a clear error via the normal pipeline.
            // (Let generic invoke happen if you later support mint_game here.)
          } else {
            lootStateSetLatest(account.address, a.adventurerId);
          }
        }

        if (!a.adventurerId) {
          // fall back to generic invoke
        } else { 
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
      }

      multicall.push({
        step: multicall.length + 1,
        type: "operation",
        script: "invoke-contract.js",
        args: {
          privateKey: account.privateKey, // Passed from resolve-smart (only secrets reader)
          accountAddress: account.address,
          contractAddress: res.contractAddress,
          method: res.functionMatch?.name || op.action,
          args: []
        },
        description: `${res.functionMatch?.name || op.action} ${op.amount || ''} ${op.tokenIn || ''} ${op.tokenOut ? '-> ' + op.tokenOut : ''} at ${op.protocol || 'recipient'}`
      });
    }
    
    result.executionPlan = {
      type: "WRITE",
      multicall,
      requiresAuthorization: true
    };
  } else if (result.operationType === "AVNU_SWAP") {
    // Build AVNU SDK swap plan
    const avnuCalls = [];
    
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      
      if (op.useAvnuSdk) {
        // Use AVNU SDK for this swap
        avnuCalls.push({
          step: avnuCalls.length + 1,
          type: "avnu_swap",
          script: "avnu-swap.js",
          args: {
            sellToken: op.avnuParams.sellToken,
            buyToken: op.avnuParams.buyToken,
            sellAmount: op.avnuParams.sellAmount,
            slippage: 0.001, // 0.1% default slippage
            accountAddress: account.address,
            privateKey: account.privateKey // Passed from resolve-smart (only secrets reader)
          },
          description: `Swap ${op.avnuParams.sellAmount} ${op.avnuParams.sellToken} to ${op.avnuParams.buyToken} via AVNU SDK`
        });
      } else {
        // Use direct DEX contract call
        const res = result.resolutions[i];
        const ta = result.tokenAnalysis.find(t => t.index === i);
        
        if (!res || res.error) continue;
        
        // Add approval if needed
        if (ta?.needsApprove) {
          avnuCalls.push({
            step: avnuCalls.length + 1,
            type: "approval",
            script: "invoke-contract.js",
            args: {
              privateKey: account.privateKey, // Passed from resolve-smart (only secrets reader)
              accountAddress: account.address,
              contractAddress: ta.tokenAddress,
              method: "approve",
              args: [ta.spenderAddress, ...toUint256(BigInt(ta.required))]
            }
          });
        }
        
        // Add DEX operation
        avnuCalls.push({
          step: avnuCalls.length + 1,
          type: "dex_swap",
          script: "invoke-contract.js",
          args: {
            privateKey: account.privateKey, // Passed from resolve-smart (only secrets reader)
            accountAddress: account.address,
            contractAddress: res.contractAddress,
            method: res.functionMatch?.name || op.action,
            args: []
          },
          description: `${res.functionMatch?.name || op.action} ${op.amount || ''} ${op.tokenIn || ''} ${op.tokenOut ? '-> ' + op.tokenOut : ''} at ${op.protocol}`
        });
      }
    }
    
    result.executionPlan = {
      type: "AVNU_SWAP",
      calls: avnuCalls,
      requiresAuthorization: true
    };
  } else if (result.operationType === "CONDITIONAL") {
    // Build watcher plan using EXISTING watch-events-smart.js
    result.executionPlan = {
      type: "CONDITIONAL",
      watchers: watchers.map((w, i) => {
        const res = result.resolutions[operations.length + i];
        return {
          index: i,
          script: "watch-events-smart.js",  // <-- USE EXISTING SCRIPT
          args: {
            contractAddress: res?.contractAddress || PROTOCOLS[w.condition.protocol],
            eventNames: [res?.eventMatch?.name || w.condition.eventName],
            mode: "auto",  // WebSocket with polling fallback
            pollIntervalMs: 3000
          },
          condition: {
            eventName: w.condition.eventName,
            resolvedEvent: res?.eventMatch?.name,
            eventScore: res?.eventMatch?.score,
            protocol: w.condition.protocol
          },
          action: w.action !== 'watch' ? {  // Only if there's an action (not pure watch)
            script: "invoke-contract.js",
            args: {
              privateKey: account.privateKey, // Passed from resolve-smart (only secrets reader)
              accountAddress: account.address,
              contractAddress: res?.contractAddress,
              method: res?.functionMatch?.name || w.action,
              args: []
            }
          } : null
        };
      })
    };
  } else if (result.operationType === "EVENT_WATCH") {
    // Pure event watching (notify only) using EXISTING watch-events-smart.js
    // Get watch operations from operations array (not watchers array)
    const watchOps = operations.filter(o => o.isWatch);
    
    result.executionPlan = {
      type: "EVENT_WATCH",
      watchers: watchOps.map((op, i) => {
        // For multi-address protocols, use the first address (main contract)
        const protocolAddresses = PROTOCOLS[op.protocol];
        const contractAddr = Array.isArray(protocolAddresses) ? protocolAddresses[0] : protocolAddresses;
        return {
          index: i,
          script: "watch-events-smart.js",
          args: {
            contractAddress: contractAddr,
            eventNames: [op.eventName],
            mode: "auto",
            pollIntervalMs: 3000
          },
          description: `Watch for '${op.eventName}' events on ${op.protocol}`,
          protocol: op.protocol
        };
      })
    };
  }
  
  // Step 6: Validation
  result.orchestration.push({ step: 6, name: "Validation" });
  result.errors = [];
  result.warnings = [];
  
  // Check for unknown tokens
  const isDryRun = input.dryRun === true;
  
  for (const ta of result.tokenAnalysis) {
    if (ta.error === "Unknown token") {
      result.errors.push({
        type: "UNKNOWN_TOKEN",
        index: ta.index,
        token: ta.token,
        message: `Token "${ta.token}" is not registered`,
        needsRegistration: true,
        registrationPrompt: {
          question: `What is the contract address for ${ta.token}?`,
          registerWith: {
            type: "token",
            name: ta.token,
            address: "<USER_PROVIDED_ADDRESS>",
            decimals: 18
          }
        }
      });
    } else if (ta.hasSufficientBalance === false && !isDryRun) {
      // Skip balance check in dry run mode
      result.errors.push({
        type: "INSUFFICIENT_BALANCE",
        index: ta.index,
        token: ta.token,
        have: ta.balance.human,
        need: ta.amount
      });
    }
  }
  
  // FRIENDS feature removed - recipients must be full addresses
  // No validation for named recipients
  
  // Check for unresolved protocols
  for (const op of operations) {
    if (op.protocol && !PROTOCOLS[op.protocol]) {
      result.errors.push({
        type: "UNKNOWN_PROTOCOL",
        index: op.index || 0,
        protocol: op.protocol,
        message: `Protocol "${op.protocol}" is not registered`,
        needsRegistration: true,
        registrationPrompt: {
          question: `What is the contract address for ${op.protocol}?`,
          registerWith: {
            type: "protocol",
            name: op.protocol,
            address: "<USER_PROVIDED_ADDRESS>"
          }
        }
      });
    }
  }
  
  // Check for unresolved contracts/functions
  for (const res of result.resolutions) {
    if (res.error === "No contract address" && !result.errors.some(e => e.type === 'UNKNOWN_PROTOCOL')) {
      result.errors.push({
        type: "NO_CONTRACT",
        index: res.index,
        action: res.action,
        message: "Cannot resolve contract address for this operation",
        hint: "Specify the protocol or provide contract address"
      });
    } else if (res.functionMatch && parseFloat(res.functionMatch.score) < 50) {
      result.warnings.push({
        type: "LOW_FUNCTION_MATCH",
        index: res.index,
        requested: res.action,
        resolved: res.functionMatch.name,
        score: res.functionMatch.score
      });
    }
    if (res.eventMatch && parseFloat(res.eventMatch.score) < 50) {
      result.warnings.push({
        type: "LOW_EVENT_MATCH",
        index: res.index,
        requested: res.eventName,
        resolved: res.eventMatch.name,
        score: res.eventMatch.score
      });
    }
  }
  
  // Check for empty execution plan
  if (result.operationType === "WRITE" && result.executionPlan?.multicall?.length === 0) {
    result.errors.push({
      type: "EMPTY_EXECUTION",
      message: "No executable operations could be built",
      hint: "Check token names, contract addresses, and protocol names"
    });
  }
  
  result.canProceed = result.errors.length === 0;
  result.nextStep = result.canProceed 
    ? "USER_AUTHORIZATION" 
    : "RESOLVE_ERRORS";
  
  // Authorization details
  if (result.canProceed && result.operationType !== "READ") {
    result.authorizationDetails = {
      operationType: result.operationType,
      operations: allOps.map((op, i) => ({
        index: i,
        description: op.condition 
          ? `When ${op.condition.eventName} at ${op.condition.protocol}: ${op.action} ${op.amount} ${op.tokenIn}`
          : `${op.action} ${op.amount || ''} ${op.tokenIn || ''} ${op.tokenOut ? '-> ' + op.tokenOut : ''} at ${op.protocol || 'recipient'}`,
        resolvedFunction: result.resolutions[i]?.functionMatch?.name,
        resolvedEvent: result.resolutions[i]?.eventMatch?.name
      })),
      prompt: "Authorize? (yes/no)"
    };
  }
  
  // ============ AUTHORIZATION + EXECUTION ============
  const dryRun = input.dryRun === true;
  const skipAuth = input.skipAuth === true;  // For programmatic use
  
  if (result.canProceed && result.executionPlan && result.operationType !== "READ") {
    // Output authorization prompt and wait for user confirmation
    console.log(JSON.stringify({
      ...result,
      awaitingAuthorization: true,
      authPrompt: `\n${JSON.stringify(result.authorizationDetails, null, 2)}\n\nAuthorize broadcast? (yes/no): `
    }));
    
    // Wait for user input
    const authorized = await waitForAuthorization(skipAuth);
    
    if (!authorized) {
      console.log(JSON.stringify({
        ...result,
        execution: { status: "canceled", reason: "User declined authorization" },
        nextStep: "CANCELED"
      }));
      return;
    }
    
    // User authorized - proceed with execution
    result.authorized = true;
    result.execution = { status: "executing", results: [], dryRun };
    
    if (result.executionPlan.type === "WRITE" && result.executionPlan.multicall?.length > 0) {
      // Execute multicall steps sequentially
      for (const step of result.executionPlan.multicall) {
        if (dryRun) {
          // Simulate successful execution
          result.execution.results.push({
            step: step.step,
            type: step.type,
            success: true,
            txHash: `0xDRYRUN_${step.step}_${Date.now().toString(16)}`,
            simulated: true
          });
        } else {
          try {
            const scriptPath = join(__dirname, step.script);
            const stepResult = await executeScript(scriptPath, step.args);
            result.execution.results.push({
              step: step.step,
              type: step.type,
              success: stepResult.success,
              txHash: stepResult.txHash,
              error: stepResult.error
            });
            
            if (!stepResult.success) {
              result.execution.status = "failed";
              result.execution.failedAt = step.step;
              break;
            }
          } catch (err) {
            result.execution.results.push({
              step: step.step,
              type: step.type,
              success: false,
              error: err.message
            });
            result.execution.status = "failed";
            result.execution.failedAt = step.step;
            break;
          }
        }
      }
      
      if (result.execution.status !== "failed") {
        result.execution.status = "completed";
      }
    } else if (result.executionPlan.type === "READ") {
      if (dryRun) {
        result.execution.status = "completed";
        result.execution.results.push({ success: true, data: "DRY_RUN_READ_RESULT", simulated: true });
      } else {
        try {
          const scriptPath = join(__dirname, result.executionPlan.script);
          const readResult = await executeScript(scriptPath, result.executionPlan.args);
          result.execution.status = "completed";
          result.execution.results.push(readResult);
        } catch (err) {
          result.execution.status = "failed";
          result.execution.results.push({ success: false, error: err.message });
        }
      }
    } else if (result.executionPlan.type === "CREATE_ACCOUNT") {
      if (dryRun) {
        result.execution.status = "completed";
        result.execution.results.push({ 
          success: true, 
          address: `0xDRYRUN_ACCOUNT_${Date.now().toString(16)}`,
          simulated: true 
        });
      } else {
        try {
          const scriptPath = join(__dirname, result.executionPlan.script);
          const createResult = await executeScript(scriptPath, result.executionPlan.args);
          result.execution.status = "completed";
          result.execution.results.push(createResult);
        } catch (err) {
          result.execution.status = "failed";
          result.execution.results.push({ success: false, error: err.message });
        }
      }
    } else if (result.executionPlan.type === "AVNU_SWAP" && result.executionPlan.calls?.length > 0) {
      // Execute AVNU swap steps (can include both AVNU SDK calls and DEX contract calls)
      for (const step of result.executionPlan.calls) {
        if (dryRun) {
          result.execution.results.push({
            step: step.step,
            type: step.type,
            success: true,
            txHash: `0xDRYRUN_${step.type}_${step.step}_${Date.now().toString(16)}`,
            simulated: true
          });
        } else {
          try {
            const scriptPath = join(__dirname, step.script);
            const stepResult = await executeScript(scriptPath, step.args);
            result.execution.results.push({
              step: step.step,
              type: step.type,
              success: stepResult.success || stepResult.transactionHash !== undefined,
              txHash: stepResult.transactionHash || stepResult.txHash,
              error: stepResult.error
            });
            
            if (!stepResult.success && !stepResult.transactionHash) {
              result.execution.status = "failed";
              result.execution.failedAt = step.step;
              break;
            }
          } catch (err) {
            result.execution.results.push({
              step: step.step,
              type: step.type,
              success: false,
              error: err.message
            });
            result.execution.status = "failed";
            result.execution.failedAt = step.step;
            break;
          }
        }
      }
      
      if (result.execution.status !== "failed") {
        result.execution.status = "completed";
      }
    }
    
    result.nextStep = result.execution.status === "completed" ? "DONE" : "EXECUTION_FAILED";
  }
  
  console.log(JSON.stringify(result, null, 2));
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
