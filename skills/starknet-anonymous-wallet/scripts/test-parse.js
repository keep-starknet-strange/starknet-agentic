#!/usr/bin/env node
/**
 * Test script for parsing logic
 */

import nlp from 'compromise';

// Mock data
const availableTokens = ['ETH', 'STRK', 'USDC', 'USDT', 'WBTC', 'DAI'];
const knownActions = ['swap', 'send', 'transfer', 'deposit', 'withdraw', 'stake', 'unstake', 'claim', 'harvest', 'mint', 'burn', 'buy', 'sell', 'trade', 'bridge', 'lock', 'unlock', 'vote', 'propose', 'execute', 'cancel', 'approve', 'check', 'get', 'view', 'read', 'query', 'watch', 'balance', 'allowance'];

function calculateSimilarity(query, target) {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  
  // Exact match
  if (t === q) return 100;
  
  // One contains the other
  if (t.includes(q)) return 70 + (q.length / t.length) * 20;
  if (q.includes(t)) return 60 + (t.length / q.length) * 15;
  
  let score = 0;
  
  // Common starting substring bonus (important for typos like "swp" -> "swap")
  let commonStart = 0;
  for (let i = 0; i < Math.min(q.length, t.length); i++) {
    if (q[i] === t[i]) {
      commonStart++;
    } else {
      break;
    }
  }
  score += commonStart * 5; // Increased bonus for matching start
  
  // Character-level matching
  let common = 0;
  const maxLen = Math.max(q.length, t.length);
  if (maxLen > 0) {
    let qi = 0;
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (q[qi] === t[ti]) {
        common++;
        qi++;
      }
    }
    score += (common / maxLen) * 25;
  }
  
  // Token-based matching
  const qTokens = q.split(/[_\-]+/).filter(Boolean);
  const tTokens = t.split(/[_\-]+/).filter(Boolean);
  
  for (const qt of qTokens) {
    for (const tt of tTokens) {
      if (qt === tt) {
        score += 30;
      } else if (tt.includes(qt)) {
        score += 20;
      } else if (qt.includes(tt)) {
        score += 15;
      } else {
        // Common substrings
        for (let len = 2; len <= Math.min(qt.length, tt.length); len++) {
          for (let i = 0; i <= qt.length - len; i++) {
            const sub = qt.substring(i, i + len);
            if (tt.includes(sub)) {
              score += len * 1.5;
              break;
            }
          }
        }
      }
    }
  }
  
  return score;
}

function parseOperation(segment, availableTokens = [], previousOp = null, knownActions = []) {
  const doc = nlp(segment);
  
  // Check for WATCH patterns
  const watchMatch = segment.match(/\b(watch|monitor|track|listen)\s+(?:the\s+)?([A-Za-z]+)(?:\s+event)?/i);
  if (watchMatch) {
    return {
      action: watchMatch[1].toLowerCase(),
      eventName: watchMatch[2],
      isWatch: true
    };
  }
  
  // Extract raw action
  let rawAction = doc.verbs(0).out('text').toLowerCase();
  if (!rawAction) {
    rawAction = doc.terms(0).out('text').toLowerCase();
  }
  
  // FUZZY MATCH: Correct typos with lower threshold
  let action = rawAction;
  let actionCorrected = false;
  
  if (knownActions.length > 0 && rawAction) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const knownAction of knownActions) {
      const score = calculateSimilarity(rawAction, knownAction);
      if (score > bestScore && score >= 25) { // Lowered threshold for typo tolerance
        bestScore = score;
        bestMatch = knownAction;
      }
    }
    
    if (bestMatch && bestMatch !== rawAction) {
      action = bestMatch;
      actionCorrected = true;
    }
  }
  
  // Extract amount - handle "all" specially
  let amount = null;
  const text = doc.out('text');
  
  // Check for "all" keyword
  if (/\ball\b/i.test(text)) {
    amount = 'all';
  } else {
    const numbers = doc.numbers().json();
    if (numbers.length > 0) {
      const numData = numbers[0];
      amount = typeof numData === 'object' ? numData.num || numData.number : numData;
    }
  }
  
  // Extract tokenIn - prefer exact matches
  let tokenIn = null;
  
  // First try exact matches (case insensitive)
  for (const token of availableTokens) {
    const tokenPattern = new RegExp(`\\b${token}\\b`, 'i');
    if (tokenPattern.test(text)) {
      tokenIn = token;
      break;
    }
  }
  
  // INFERENCE from previous operation
  if (!tokenIn && previousOp && (previousOp.tokenOut || previousOp.tokenIn)) {
    tokenIn = previousOp.tokenOut || previousOp.tokenIn;
  }
  
  // Check for pronouns
  const isReference = doc.match('(it|them|this|that)').found;
  
  // Extract tokenOut
  let tokenOut = null;
  const toMatch = doc.match('to [#Noun]');
  if (toMatch.found) {
    const candidate = toMatch.nouns(0).out('text').toUpperCase();
    // Validate against available tokens
    for (const token of availableTokens) {
      if (token === candidate) {
        tokenOut = candidate;
        break;
      }
    }
  }
  
  // Extract protocol
  let protocol = null;
  const prepMatch = doc.match('(at|on|via|in) #Noun');
  if (prepMatch.found) {
    protocol = prepMatch.nouns(0).out('text');
  }
  
  // INFERENCE from reference
  if (!tokenIn && isReference && previousOp && (previousOp.tokenOut || previousOp.tokenIn)) {
    tokenIn = previousOp.tokenOut || previousOp.tokenIn;
  }
  
  const isRead = /^(balance|get|check|view|read|query|allowance|name|symbol|decimals|total)/i.test(action);
  
  return { 
    action, 
    rawAction: actionCorrected ? rawAction : undefined,
    amount, 
    tokenIn, 
    tokenOut, 
    protocol, 
    isReference, 
    isRead,
    actionCorrected,
    inferred: (!tokenIn && previousOp) ? { tokenIn: true } : undefined
  };
}

function parsePrompt(prompt, availableTokens = [], knownActions = []) {
  const operations = [];
  const segments = prompt.split(/\b(then|and|after|next)\b|,|;|\./i);
  
  for (const seg of segments) {
    const s = seg.trim();
    if (!s || /^(then|and|after|next)$/i.test(s)) continue;
    
    const previousOp = operations.length > 0 ? operations[operations.length - 1] : null;
    const op = parseOperation(s, availableTokens, previousOp, knownActions);
    if (!op) continue;
    
    if (op.isReference && previousOp) {
      if (!op.tokenIn) op.tokenIn = previousOp.tokenOut || previousOp.tokenIn;
      if (!op.amount) op.amount = previousOp.amount;
    }
    
    operations.push(op);
  }
  
  return { operations };
}

// Test prompts
const testPrompts = [
  "swap 10 ETH to STRK",
  "swap 10 ETH to STRK then deposit in Typhoon",
  "swp 5 USDC to ETH",
  "trasnfer 100 STRK to alice",
  "check my ETH balance",
  "claim rewards then stake it in Ekubo",
  "mint NFT then sell it on Starkbook",
  "deposit 50 USDT",
  "withdraw all ETH",
  "bridge 20 STRK to Ethereum"
];

console.log("=== PARSING TEST RESULTS ===\n");

for (let i = 0; i < testPrompts.length; i++) {
  const prompt = testPrompts[i];
  const result = parsePrompt(prompt, availableTokens, knownActions);
  
  console.log(`Test ${i + 1}: "${prompt}"`);
  console.log(`Operations: ${result.operations.length}`);
  
  result.operations.forEach((op, idx) => {
    console.log(`  ${idx + 1}. action: ${op.action}${op.rawAction ? ` (corrected from "${op.rawAction}")` : ''}`);
    console.log(`     amount: ${op.amount}`);
    console.log(`     tokenIn: ${op.tokenIn}${op.inferred ? ' (inferred)' : ''}`);
    console.log(`     tokenOut: ${op.tokenOut || 'null'}`);
    console.log(`     protocol: ${op.protocol || 'null'}`);
    console.log(`     isReference: ${op.isReference}`);
    console.log(`     actionCorrected: ${op.actionCorrected}`);
  });
  console.log('');
}