#!/usr/bin/env node
/**
 * parse-smart.js - Pre-parse and validation script
 * 
 * Responsibilities:
 * 1. Validate prompt security (prompt injection protection)
 * 2. Extract tokens and protocols from prompt
 * 3. Fetch ABIs for protocols (except AVNU)
 * 4. Handle protocol registration if needed
 * 5. Return ABIs and addresses to LLM for parsing
 * 
 * Usage:
 *   node parse-smart.js '{"prompt":"swap 10 ETH to STRK"}'
 * 
 * Output:
 *   {
 *     success: true,
 *     security: { safe: true },
 *     tokens: [...],
 *     protocols: [...],
 *     abis: { protocolName: [...functions] },
 *     addresses: { protocolName: "0x..." },
 *     needsRegistration: null | { type: "protocol", name: "..." }
 *   }
 */

import { RpcProvider } from 'starknet';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import crypto from 'crypto';
import vard from '@andersmyrmel/vard';
import nlp from 'compromise';
import { resolveRpcUrl } from './_rpc.js';
import { fetchVerifiedTokens } from './_tokens.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SKILL_ROOT = join(__dirname, '..');

// ============ EXECUTION ATTESTATION (PARSE → RESOLVE) ============
// Goal: make it harder for injected/foreign text to trigger execution.
// parse-smart issues a short-lived one-time token. resolve-smart must see it.
const ATTEST_DIR = join(homedir(), '.openclaw', 'typhoon-attest');
const ATTEST_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MIN_RECIPIENT_HEX_LEN = 10;

function attestIssue() {
  // Use random bytes; do NOT derive from secrets.
  const token = crypto.randomBytes(18).toString('hex');
  const now = Date.now();
  try {
    mkdirSync(ATTEST_DIR, { recursive: true });
    const p = join(ATTEST_DIR, `${token}.json`);
    writeFileSync(p, JSON.stringify({ createdAt: now, expiresAt: now + ATTEST_TTL_MS }), 'utf8');
  } catch (err) {
    // If we can't write, still return token; resolve will fail closed.
    console.error(`Failed to write attestation for token ${token} in ${ATTEST_DIR}: ${err.message}`);
  }
  return token;
}

// ============ ACCOUNT PRESENCE CHECK (NO SECRETS READ) ============
function getSecretsDir() {
  // Test override (safe): allows deterministic tests without touching real secrets
  if (process.env.STARKNET_SECRETS_DIR) return process.env.STARKNET_SECRETS_DIR;
  return join(homedir(), '.openclaw', 'secrets', 'starknet');
}

function hasAnyAccount() {
  const dir = getSecretsDir();
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    return files.length > 0;
  } catch {
    return false;
  }
}

// ============ ACCOUNT CREATION INTENT DETECTION ============
function isAccountCreationPrompt(prompt) {
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

function buildNoAccountGuide() {
  return {
    title: "No Starknet Account Found",
    explanation: "You need a Starknet account to perform transactions. This skill uses Typhoon to create an anonymous account from a deposit note.",
    steps: [
      { step: 1, title: "Go to the Typhoon website", url: "https://www.typhoon-finance.com/app" },
      { step: 2, title: "Make a deposit and download your deposit note", description: "Recommended: deposit STRK so the account has funds for deploy + fees" },
      { step: 3, title: "Paste your note JSON", description: "Paste the full note JSON (secret, nullifier, txHash, pool, day)" }
    ]
  };
}

// ============ REGISTRY LOADING ============
function loadRegistry(filename) {
  const filepath = join(SKILL_ROOT, filename);
  if (!existsSync(filepath)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(filepath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse registry file ${filepath}: ${err.message}`);
  }
}

function saveRegistry(filename, data) {
  const filepath = join(SKILL_ROOT, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
}

function loadProtocols() {
  const registry = loadRegistry('protocols.json');
  const protocols = {};
  for (const [name, info] of Object.entries(registry)) {
    if (name.startsWith('_')) continue;
    if (info.addresses) {
      protocols[name] = info.addresses.map(a => a.address);
    } else if (info.address) {
      protocols[name] = [info.address];
    }
  }
  return protocols;
}

// ============ SECURITY VALIDATION ============
function validatePromptSecurity(prompt) {
  // Use vard.safe() for basic validation
  const basicCheck = vard.safe(prompt);
  
  if (!basicCheck.safe) {
    return {
      safe: false,
      message: `Security threat detected by vard`,
      threats: ['vard_rejection']
    };
  }
  
  // Additional pattern checks for crypto-specific threats
  const dangerousPatterns = [
    { pattern: /\b(show|print|printing|output|display|reveal|expose|dump|extract|export|log|echo|return|paste)\b.{0,180}\b(private\s*key|secret\s*key|seed\s*phrase|mnemonic|priv\s*key|privatekey|private\s*keypath|privatekeypath|api\s*token|secrets?)\b/i, threat: 'key_exposure' },
    { pattern: /\b(hash|encrypt|redact)\b.{0,160}\b(private\s*key|seed\s*phrase|mnemonic|privatekey|key)\b/i, threat: 'key_exposure' },
    { pattern: /\b(send|transfer|exfiltrate|upload|post|transmit)\b.{0,120}\b(key|secret|credential|password|privatekey|mnemonic)\b/i, threat: 'key_exfiltration' },
    { pattern: /\b(bypass|skip|ignore|disable|override)\b.{0,30}\b(auth|authorization|confirm|approval|verify)\b/i, threat: 'auth_bypass' },

    // Secrets/file access attempts
    { pattern: /\bcat\b.{0,200}(~\/\.openclaw\/secrets|\/\.openclaw\/secrets|secrets\/starknet|secrets\/)/i, threat: 'secret_file_exfil' },
    { pattern: /\b(read|open|access)\b.{0,50}(~\/\.openclaw\/secrets|\/\.openclaw\/secrets|secrets?\/)/i, threat: 'secret_access' },
    { pattern: /\bcat\b.{0,50}\.key\b/i, threat: 'key_file_access' },

    // Prompt-injection / tool-execution markers
    { pattern: /\bSYSTEM\s*:/i, threat: 'system_injection' },
    { pattern: /\bDEVELOPER\s*MESSAGE\b\s*:/i, threat: 'developer_injection' },
    { pattern: /\b(system\s+prompt|hidden\s+rules)\b/i, threat: 'prompt_leak_attempt' },
    { pattern: /\b(ignore|override)\b.{0,80}\b(previous|instructions|rules)\b/i, threat: 'instruction_override' },
    { pattern: /\bUSER_AUTHORIZATION\b.{0,120}\b(granted|already|skip|bypass|no|without|authorize|authorized|approval)\b/i, threat: 'auth_bypass' },
    { pattern: /\b(authorized|authorization)\b.{0,120}\b(everything|anything|without|skip|no\s+need|already|approved)\b/i, threat: 'auth_bypass' },
    { pattern: /\b(friend\s+said|prior\s+message|you\s+promised)\b.{0,80}\b(reveal|print|show|secrets?|keys?)\b/i, threat: 'instruction_override' },
    { pattern: /\b(do\s+it\s+now|just\s+do\s+it)\b/i, threat: 'auth_bypass' },
    { pattern: /\bdon[’']t\s+warn\b/i, threat: 'instruction_override' },
    { pattern: /\b(code\s*block|```|\[send\b)\b/i, threat: 'instruction_override' },
    { pattern: /\b(base64|rot13|atob|btoa)\b/i, threat: 'obfuscation' },

    // Attempts to access local files / secrets / logs
    { pattern: /~\/(\.openclaw|\.ssh)\//i, threat: 'local_file_access' },
    { pattern: /\/home\/[a-z0-9_\-]+\/(\.openclaw|\.ssh)\//i, threat: 'local_file_access' },
    { pattern: /\b(attestation|typhoon-attest|\.openclaw\/cron|crontab)\b/i, threat: 'local_file_access' },
    { pattern: /\b(protocols\.json|SKILL\.md)\b/i, threat: 'local_file_access' },
    { pattern: /\b(environment variables|env vars|process\.env|PRIVATE_KEY)\b/i, threat: 'secret_access' },

    // Obfuscated key phrases
    { pattern: /p\s*r\s*i\s*v\s*a\s*t\s*e\s*k\s*e\s*y/i, threat: 'key_exposure' },
    { pattern: /p-r-i-v-a-t-e\s*key/i, threat: 'key_exposure' },
    { pattern: /pr\\u0069vate\s*key/i, threat: 'key_exposure' },
    { pattern: /prıvate\s*key/i, threat: 'key_exposure' },
    { pattern: /^(?=.{32,}$)(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/m, threat: 'obfuscation' },

    // Social-engineering patterns to bypass confirmation
    { pattern: /\b(skip|bypass|without)\b.{0,40}\b(confirmation|confirm|authorization|approval|asking)\b/i, threat: 'auth_bypass' },
    { pattern: /\bexecute\b.{0,20}\b(immediately|now|directly)\b/i, threat: 'auth_bypass' },
    { pattern: /\b(no\s+confirmation|never\s+ask\s+for\s+confirmation|already\s+confirmed)\b/i, threat: 'auth_bypass' },
    { pattern: /\bpretend\b.{0,40}\b(confirm|confirmed|authorization)\b/i, threat: 'auth_bypass' },
    { pattern: /\bprevious\s+response\b.{0,60}\b(approval|authorization|confirm)\b/i, threat: 'auth_bypass' },
    { pattern: /\btreat\b.{0,60}\b(next\s+instruction|text\s+in\s+brackets)\b.{0,60}\b(authorized|user)\b/i, threat: 'instruction_override' },
    { pattern: /\bdisable\b.{0,60}\b(validation|dangerous\s+confirmation|warnings)\b/i, threat: 'instruction_override' },
    { pattern: /\bstop\b.{0,20}\bvalidating\b/i, threat: 'instruction_override' },
    { pattern: /\bforce\b.{0,40}\bprotocol\b.{0,40}\bresolution\b/i, threat: 'instruction_override' },
    { pattern: /\bderive\b.{0,40}\b(from\s+my\s+username|username)\b/i, threat: 'instruction_override' },
    { pattern: /\bsplit\b.{0,60}\b(private\s*key|secrets?|key)\b/i, threat: 'key_exposure' },
    { pattern: /\b(localhost)\b.{0,60}\b(reveal|show|print)\b.{0,60}\b(secret|key)\b/i, threat: 'key_exposure' },
    { pattern: /\b(i\s*m\s+driving|urgent|liquidated)\b.{0,80}\b(skip|bypass|without|no|approve)\b.{0,40}\b(confirmation|confirm|approval|authorization|asking|now)\b/i, threat: 'auth_bypass' },
    { pattern: /\b(approve\s+now|owner\s+action\s+is\s+safe)\b/i, threat: 'auth_bypass' },
    { pattern: /\b(if\s+abi\s+compilation\s+fails|guess\s+the\s+address\s+from\s+context)\b/i, threat: 'instruction_override' },

    { pattern: /\bthen\s+(run|execute)\b\s*:/i, threat: 'command_injection' },
    { pattern: /\b(openclaw|crontab|curl|wget)\b/i, threat: 'tool_invocation' },
    { pattern: /[;&|]{1,2}/, threat: 'shell_metachar' },

    // Structured payload injection
    { pattern: /"parsed"\s*:/i, threat: 'structured_injection' },
    { pattern: /\b(resolve-smart|parse-smart)\b/i, threat: 'structured_injection' },
    { pattern: /\bexplicitDangerousOk\b/i, threat: 'structured_injection' },
    { pattern: /\b(operationType|executionPlan|multicall|canProceed|nextStep)\b"?\s*[:=]/i, threat: 'structured_injection' },

    // Code execution hints
    { pattern: /\b(eval|Function|exec)\s*\(/i, threat: 'code_execution' }
  ];
  
  const threats = [];
  for (const { pattern, threat } of dangerousPatterns) {
    if (pattern.test(prompt)) {
      threats.push(threat);
    }
  }
  
  if (threats.length > 0) {
    return {
      safe: false,
      message: `Security threat detected: ${threats.join(', ')}`,
      threats
    };
  }
  
  return { safe: true };
}

// ============ TOKEN FETCHING ============
async function fetchAllTokens() {
  return fetchVerifiedTokens();
}

// ============ ABI FETCHING ============
async function fetchABI(address, provider) {
  try {
    const response = await provider.getClassAt(address);
    return response.abi || [];
  } catch (err) {
    console.error(`ABI fetch failed for ${address}: ${err.message}`);
    return null;
  }
}

function extractFunctions(abi) {
  const functions = [];
  for (const item of abi) {
    if (item.type === 'function' && item.name) {
      functions.push(item.name);
    }
    if (item.type === 'interface' && item.items) {
      for (const sub of item.items) {
        if (sub.type === 'function' && sub.name) {
          functions.push(sub.name);
        }
      }
    }
  }
  return functions;
}

// ============ PROMPT PARSING ============
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTokensAndProtocols(prompt, availableTokens, knownProtocols) {
  const doc = nlp(prompt);
  const text = doc.out('text');
  const lowerText = text.toLowerCase();
  
  const foundTokens = [];
  const foundProtocols = [];
  
  // Find protocols FIRST (before tokens, to avoid false positives like "EKUBO")
  const lowerKnownProtocols = knownProtocols.map(p => p.toLowerCase());
  for (let i = 0; i < knownProtocols.length; i++) {
    const protocol = knownProtocols[i];
    const lowerProtocol = lowerKnownProtocols[i];
    // Case-insensitive pattern that matches any casing
    const pattern = new RegExp(`\\b${escapeRegex(lowerProtocol)}\\b`, 'i');
    if (pattern.test(text)) {
      foundProtocols.push(protocol);
    }
  }
  
  // Find tokens - but exclude protocol matches
  for (const token of availableTokens) {
    const pattern = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
    if (pattern.test(text)) {
      // Check if this match is actually a protocol (case insensitive)
      const isProtocol = foundProtocols.some(p => p.toLowerCase() === token.toLowerCase());
      if (!isProtocol) {
        foundTokens.push(token);
      }
    }
  }
  
  return { tokens: foundTokens, protocols: foundProtocols };
}

// ============ MAIN ============
async function main() {
  const rawInput = process.argv[2];
  
  if (!rawInput) {
    console.log(JSON.stringify({
      success: false,
      error: "No input provided"
    }));
    process.exit(1);
  }
  
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (e) {
    console.log(JSON.stringify({
      success: false,
      error: `Invalid JSON: ${e.message}`
    }));
    process.exit(1);
  }
  
  const { prompt, register } = input;
  
  if (!prompt) {
    console.log(JSON.stringify({
      success: false,
      error: "Missing prompt"
    }));
    process.exit(1);
  }
  
  // Step 1: Security validation
  const security = validatePromptSecurity(prompt);
  if (!security.safe) {
    console.log(JSON.stringify({
      success: false,
      error: "Security violation detected",
      security
    }));
    process.exit(1);
  }

  // Issue short-lived execution attestation (parse → resolve)
  const attestation = { token: attestIssue(), expiresInMs: ATTEST_TTL_MS };

  // Step 1.25: Protocol add/register intent (fast path)
  // UX: if user explicitly asks to add/register a protocol, ask for its address.
  const protoIntent = prompt.match(/\b(?:add|register)\s+(?:the\s+)?protocol\s+([A-Za-z0-9_\-]{2,64})\b/i);
  if (protoIntent) {
    const name = protoIntent[1];
    console.log(JSON.stringify({
      success: true,
      security,
      attestation,
      canProceed: false,
      operationType: "REGISTER_PROTOCOL_INTENT",
      nextStep: "PROVIDE_PROTOCOL_ADDRESS",
      needsRegistration: {
        type: "protocol",
        name,
        message: `Protocol "${name}" is not registered`,
        question: `What is the contract address for ${name}?`
      }
    }));
    return;
  }

  // Step 1.5: Account creation intent (fast path)
  // If user is asking to create an account, just return instructions.
  if (isAccountCreationPrompt(prompt)) {
    const hasAcct = hasAnyAccount();
    console.log(JSON.stringify({
      success: true,
      security,
      attestation,
      canProceed: false,
      operationType: "CREATE_ACCOUNT_INTENT",
      hasAccount: hasAcct,
      noAccountGuide: buildNoAccountGuide(),
      nextStep: hasAcct ? "ACCOUNT_ALREADY_EXISTS" : "CREATE_ACCOUNT_REQUIRED",
      message: hasAcct
        ? "Account already exists. You can ask for your address or start sending transactions."
        : "No account found. Follow the steps to create an anonymous Starknet account via Typhoon."
    }));
    return;
  }
  
  // Step 2: Handle registration if provided
  if (register) {
    const { type, name, address } = register;
    
    if (type === 'protocol') {
      if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) {
        console.log(JSON.stringify({
          success: false,
          error: "Invalid name format"
        }));
        process.exit(1);
      }

      if (!address || !address.startsWith('0x')) {
        console.log(JSON.stringify({
          success: false,
          error: "Invalid address format"
        }));
        process.exit(1);
      }
      
      const registry = loadRegistry('protocols.json');
      registry[name] = {
        address,
        network: "mainnet",
        type: "Unknown",
        description: `${name} protocol`
      };
      saveRegistry('protocols.json', registry);
      
      console.log(JSON.stringify({
        success: true,
        registered: { type: 'protocol', name, address }
      }));
      return;
    }
  }

  // Step 2.5: Account presence check
  // parse-smart must not proceed to ABI fetching/LLM parsing if no account exists.
  if (!hasAnyAccount()) {
    console.log(JSON.stringify({
      success: true,
      security,
      attestation,
      canProceed: false,
      needsAccount: true,
      operationType: "NO_ACCOUNT",
      noAccountGuide: buildNoAccountGuide(),
      nextStep: "CREATE_ACCOUNT_REQUIRED"
    }));
    return;
  }
  
  // Step 3: Load data
  const PROTOCOLS = loadProtocols();
  const avnuTokens = await fetchAllTokens();
  const availableTokens = avnuTokens
    .map(t => t?.symbol)
    .filter(s => typeof s === 'string' && s.length > 0);
  // Build minimal token metadata map for tokens mentioned in prompt (symbol -> {address, decimals})
  const tokenMap = {};
  const knownProtocols = Object.keys(PROTOCOLS);
  
  // Step 4: Extract tokens and protocols from prompt
  const { tokens, protocols } = extractTokensAndProtocols(
    prompt,
    availableTokens,
    knownProtocols
  );

  // Loot Survivor aliasing (protocol key is LootSurvivor; users will type "loot survivor" or "death mountain")
  if (/\bloot\s*survivor\b|\bdeath\s*mountain\b/i.test(prompt)) {
    if (!protocols.some(p => p.toLowerCase() === 'lootsurvivor')) {
      protocols.push('LootSurvivor');
    }
  }

  // Step 4.25: Transfer intent quick validation (inform user what's missing)
  // Keep this narrow: only for obvious send/transfer prompts.
  const isTransferIntent = /\b(send|transfer)\b/i.test(prompt);
  if (isTransferIntent) {
    const missing = [];

    // Recipient: look for valid 0x... anywhere; also detect "to <word>" invalid recipient.
    const recipientRegex = new RegExp(`0x[0-9a-fA-F]{${MIN_RECIPIENT_HEX_LEN},}`);
    const exactRecipientRegex = new RegExp(`^0x[0-9a-fA-F]{${MIN_RECIPIENT_HEX_LEN},}$`);
    const recipientMatch = prompt.match(recipientRegex);
    const toWord = prompt.match(/\bto\s+([^\s]+)/i);
    const recipient = recipientMatch ? recipientMatch[0] : null;
    const toCandidate = toWord?.[1] || null;
    const looksHexButTooShort = !!(toCandidate && /^0x[0-9a-fA-F]+$/.test(toCandidate) && toCandidate.length < (2 + MIN_RECIPIENT_HEX_LEN));
    const hasInvalidRecipient = !!(toCandidate && (!exactRecipientRegex.test(toCandidate) || looksHexButTooShort));

    // Amount: first decimal/integer number
    const amountMatch = prompt.match(/\b\d+(?:\.\d+)?\b/);
    const amount = amountMatch ? amountMatch[0] : null;

    // Token: from extracted tokens; fallback to uppercase word heuristic
    let token = tokens[0] || null;
    if (!token) {
      const sym = prompt.match(/\b[A-Z]{2,10}\b/);
      token = sym ? sym[0] : null;
    }

    if (!token) missing.push('tokenSymbol');
    if (!amount) missing.push('amount');
    if (!recipient) missing.push('recipient');

    if (missing.length > 0 || hasInvalidRecipient) {
      const details = [];
      if (hasInvalidRecipient) details.push('Recipient must be a 0x... Starknet address');

      console.log(JSON.stringify({
        success: true,
        security,
        attestation,
        canProceed: false,
        operationType: "PROMPT_INCOMPLETE",
        nextStep: "MISSING_FIELDS",
        missing,
        message: "Your transfer prompt is missing required info.",
        hints: [
          "Example: send 0.5 USDC to 0xabc...",
          "Include: amount + token symbol + recipient 0x address"
        ],
        details
      }));
      return;
    }

    // Unknown token (token not in verified list) → inform user early
    const known = availableTokens.map(t => t.toLowerCase());
    if (token && !known.includes(String(token).toLowerCase())) {
      console.log(JSON.stringify({
        success: true,
        security,
        attestation,
        canProceed: false,
        operationType: "UNKNOWN_TOKEN",
        nextStep: "CHOOSE_TOKEN",
        token,
        message: `Token "${token}" not found in verified token list. Use a verified symbol or provide a contract address.`
      }));
      return;
    }
  }

  // Populate tokenMap only for detected tokens
  for (const sym of tokens) {
    const info = avnuTokens.find(t => t.symbol?.toLowerCase() === sym.toLowerCase());
    if (info?.address) {
      tokenMap[sym.toUpperCase()] = {
        address: info.address,
        decimals: Number(info.decimals ?? 18)
      };
    }
  }
  
  // Step 5: Handle AVNU - treat as normal protocol with fake ABI/address
  const hasAvnuExplicit = protocols.some(p => p.toLowerCase() === 'avnu') ||
                          prompt.toLowerCase().includes('avnu');
  
  // Add AVNU to protocols list if mentioned
  if (hasAvnuExplicit && !protocols.includes('AVNU')) {
    protocols.push('AVNU');
  }
  
  // Step 6: Check for unregistered protocols (AVNU is now treated as registered)
  const mentionedProtocols = extractTokensAndProtocols(
    prompt,
    [],
    prompt.toLowerCase().match(/\b(?:at|on|via|in)\s+([A-Za-z]+)/gi)?.map(m => m.split(/\s+/)[1]) || []
  );
  
  const unregistered = mentionedProtocols.protocols.filter(p => {
    // Skip AVNU - it's treated as a special but registered protocol
    if (p.toLowerCase() === 'avnu') return false;
    return !knownProtocols.some(kp => kp.toLowerCase() === p.toLowerCase());
  });
  
  if (unregistered.length > 0) {
    console.log(JSON.stringify({
      success: true,
      security,
      attestation,
      tokens,
      protocols: [],
      abis: {},
      addresses: {},
      needsRegistration: {
        type: "protocol",
        name: unregistered[0],
        message: `Protocol "${unregistered[0]}" is not registered`,
        question: `What is the contract address for ${unregistered[0]}?`
      }
    }));
    return;
  }
  
  // Step 6.5: No auto-default protocols.
  // NOTE: Do not auto-default AVNU (or any protocol). Protocols must be explicit.
  // This skill is ecosystem-wide, not DeFi-specific.
  
  // Step 7: Fetch ABIs for registered protocols (AVNU gets fake ABI)
  const rpcUrl = resolveRpcUrl();
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const abis = {};
  const addresses = {};
  
  for (const protocol of protocols) {
    // AVNU gets fake ABI and address so LLM treats it like any protocol
    if (protocol.toLowerCase() === 'avnu') {
      addresses[protocol] = '0x01';  // Special marker address
      abis[protocol] = ['swap'];     // Single function ABI
      continue;
    }

    // VESU gets fake ABI and address so LLM treats it like any protocol
    // Actual execution is routed to scripts/vesu-pool.js which calls Pool.modify_position.
    if (protocol.toLowerCase() === 'vesu') {
      addresses[protocol] = '0x02';
      abis[protocol] = ['supply', 'borrow', 'position'];
      continue;
    }
    
    if (PROTOCOLS[protocol]) {
      const address = Array.isArray(PROTOCOLS[protocol]) 
        ? PROTOCOLS[protocol][0] 
        : PROTOCOLS[protocol];
      
      addresses[protocol] = address;
      
      try {
        const abi = await fetchABI(address, provider);
        abis[protocol] = abi === null ? [] : extractFunctions(abi);
      } catch (e) {
        abis[protocol] = [];
      }
    }
  }
  
  // Step 8: Return data to LLM
  console.log(JSON.stringify({
    success: true,
    security,
    attestation,
    tokens,
    protocols,
    tokenMap,
    abis,
    addresses,
    needsRegistration: null,
    note: "LLM should parse prompt using ABI functions to determine correct operation"
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.log(JSON.stringify({
      success: false,
      error: err.message
    }));
    process.exit(1);
  });
}

export { validatePromptSecurity, fetchAllTokens };