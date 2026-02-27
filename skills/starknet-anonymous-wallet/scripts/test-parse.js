#!/usr/bin/env node
/**
 * Test script for parsing logic
 */

import nlp from 'compromise';
import { calculateSimilarity, escapeRegExp } from './parse-utils.js';

// Mock data
const availableTokens = ['ETH', 'STRK', 'USDC', 'USDT', 'WBTC', 'DAI'];
const knownActions = ['swap', 'send', 'transfer', 'deposit', 'withdraw', 'stake', 'unstake', 'claim', 'harvest', 'mint', 'burn', 'buy', 'sell', 'trade', 'bridge', 'lock', 'unlock', 'vote', 'propose', 'execute', 'cancel', 'approve', 'check', 'get', 'view', 'read', 'query', 'watch', 'balance', 'allowance'];

function parseOperation(segment, tokenUniverse = [], previousOp = null, actionUniverse = []) {
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
  
  if (actionUniverse.length > 0 && rawAction) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const knownAction of actionUniverse) {
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
  let inferredTokenIn = false;
  
  // First try exact matches (case insensitive)
  for (const token of tokenUniverse) {
    const tokenPattern = new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i');
    if (tokenPattern.test(text)) {
      tokenIn = token;
      break;
    }
  }
  
  // INFERENCE from previous operation
  if (!tokenIn && previousOp && (previousOp.tokenOut || previousOp.tokenIn)) {
    tokenIn = previousOp.tokenOut || previousOp.tokenIn;
    inferredTokenIn = true;
  }
  
  // Check for pronouns
  const isReference = doc.match('(it|them|this|that)').found;
  
  // Extract tokenOut
  let tokenOut = null;
  const toMatch = text.match(/\bto\s+([A-Za-z0-9._-]{2,16})\b/i);
  if (toMatch && toMatch[1]) {
    const candidate = toMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Validate against available tokens
    for (const token of tokenUniverse) {
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
  
  // INFERENCE from references such as "stake it"
  if (!tokenIn && isReference && previousOp && (previousOp.tokenOut || previousOp.tokenIn)) {
    tokenIn = previousOp.tokenOut || previousOp.tokenIn;
    inferredTokenIn = true;
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
    inferred: inferredTokenIn ? { tokenIn: true } : undefined
  };
}

function parsePrompt(prompt, tokenUniverse = [], actionUniverse = []) {
  const operations = [];
  const segments = prompt.split(/\b(?:then|and|after|next)\b|,|;/i);
  
  for (const seg of segments) {
    const s = seg.trim();
    if (!s || /^(then|and|after|next)$/i.test(s)) continue;
    
    const previousOp = operations.length > 0 ? operations[operations.length - 1] : null;
    const op = parseOperation(s, tokenUniverse, previousOp, actionUniverse);
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
  "swa 5 USDC to ETH",
  "trasnfer 100 STRK to alice",
  "check my ETH balance",
  "claim rewards then stake it in Ekubo",
  "mint NFT then sell it on Starkbook",
  "deposit 50 USDT",
  "withdraw all ETH",
  "bridge 20 STRK to Ethereum"
];

const expectations = [
  (result) => result.operations.length === 1 && result.operations[0].action === 'swap' && result.operations[0].tokenIn === 'ETH' && result.operations[0].tokenOut === 'STRK',
  (result) => result.operations.length >= 2 && result.operations[0].action === 'swap' && result.operations[1].action === 'deposit',
  (result) => result.operations.length === 1 && result.operations[0].action === 'swap',
  (result) => result.operations.length === 1 && ['trasnfer', 'transfer'].includes(result.operations[0].action) && result.operations[0].tokenIn === 'STRK',
  (result) => result.operations.length === 1 && result.operations[0].isRead === true,
  (result) => result.operations.length >= 2 && result.operations[1].isReference === true && result.operations[1].action === 'stake',
  (result) => result.operations.length >= 2 && result.operations[1].isReference === true && result.operations[1].action === 'sell',
  (result) => result.operations.length === 1 && result.operations[0].action === 'deposit',
  (result) => result.operations.length === 1 && result.operations[0].amount === 'all',
  (result) => result.operations.length === 1 && result.operations[0].action === 'bridge'
];

console.log("=== PARSING TEST RESULTS ===\n");
let passed = 0;
let failed = 0;
const failures = [];

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
  const ok = expectations[i] ? expectations[i](result) : true;
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
    failures.push({ prompt, result });
  }
  console.log(`Assertion: ${ok ? 'PASS' : 'FAIL'}`);
  console.log('');
}

console.log(`Summary: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(JSON.stringify({ failed, failures }, null, 2));
  process.exit(1);
}
