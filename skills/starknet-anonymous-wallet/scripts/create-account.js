#!/usr/bin/env node
/**
 * typhoon-starknet-account: create-account.js
 * 
 * INPUT:  JSON via stdin or first argument
 *         Schema: { secret, nullifier, txHash, pool, day } or array of them
 * OUTPUT: JSON to stdout with account details
 * ERRORS: JSON to stderr
 */

import { stark, hash, ec, Provider } from 'starknet';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { TyphoonSDK } from 'typhoon-sdk';
import { resolveRpcUrl } from './_rpc.js';

const ARGENTX_CLASS_HASH = '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f';
const SECRETS_DIR = path.join(os.homedir(), '.openclaw', 'secrets', 'starknet');

function fail(message, stack) {
  console.error(JSON.stringify({ error: message, stack }));
  process.exit(1);
}

function printCreateAccountGuide(reason = 'CREATE_ACCOUNT_REQUIRED') {
  console.log(JSON.stringify({
    success: true,
    canProceed: false,
    nextStep: 'CREATE_ACCOUNT_REQUIRED',
    reason,
    message: 'No account note provided yet. Follow the steps below to create your Starknet account.',
    instructions: [
      'Step 1: Go to https://www.typhoon-finance.com/app',
      'Step 2: Make a deposit and download your note file (recommended: STRK for deploy + gas)',
      'Step 3: Paste the full note JSON here with secret, nullifier, txHash, pool, day'
    ],
    noAccountGuide: {
      title: 'Create Starknet Account via Typhoon',
      explanation: 'To create an anonymous Starknet account, provide your Typhoon deposit note JSON.',
      requiredFields: ['secret', 'nullifier', 'txHash', 'pool', 'day'],
      steps: [
        { step: 1, title: 'Go to the Typhoon website', url: 'https://www.typhoon-finance.com/app' },
        { step: 2, title: 'Make a deposit and download your deposit note', description: 'Recommended: deposit STRK so the account has funds for deploy + fees' },
        { step: 3, title: 'Paste your note JSON', description: 'Paste the full note JSON (secret, nullifier, txHash, pool, day)' }
      ]
    },
    exampleInput: {
      secret: '...',
      nullifier: '...',
      txHash: '0x...',
      pool: '0x...',
      day: 0
    }
  }));
  process.exit(0);
}

function parseInput() {
  // Try first argument, then stdin
  let raw = process.argv[2];
  
  if (!raw) {
    // Read from stdin synchronously
    try {
      raw = fs.readFileSync(0, 'utf-8');
    } catch {
      printCreateAccountGuide('NO_INPUT');
    }
  }
  
  if (!raw || !raw.trim()) {
    printCreateAccountGuide('EMPTY_INPUT');
  }

  let notes;
  const trimmed = raw.trim();

  try {
    if (trimmed.startsWith('[')) {
      notes = JSON.parse(trimmed);
    } else if (trimmed.startsWith('{')) {
      notes = JSON.parse('[' + trimmed + ']');
    } else {
      fail('Invalid JSON format.');
    }
  } catch (e) {
    fail(`JSON parse error: ${e.message}`);
  }

  if (!Array.isArray(notes)) notes = [notes];

  const required = ['secret', 'nullifier', 'txHash', 'pool', 'day'];
  return notes.map((note, i) => {
    for (const field of required) {
      if (note[field] === undefined || note[field] === null) {
        printCreateAccountGuide(`MISSING_FIELD_${field.toUpperCase()}`);
      }
    }
    return {
      secret: String(note.secret),
      nullifier: String(note.nullifier),
      txHash: note.txHash,
      pool: note.pool,
      day: note.day,
    };
  });
}

function generateKeypair() {
  const salt = randomBytes(4);
  const privateKey = hash.computePoseidonHash(stark.randomAddress(), BigInt(salt.readUInt32BE(0)));
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  return { privateKey, publicKey };
}

function computeAddress(publicKey) {
  return hash.calculateContractAddressFromHash(
    publicKey,
    ARGENTX_CLASS_HASH,
    ["0", publicKey, "1"],
    "0x0"
  );
}

function saveArtifact(keypair, address) {
  if (!fs.existsSync(SECRETS_DIR)) {
    fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
  }

  const keyPath = path.join(SECRETS_DIR, `${address}.key`);
  fs.writeFileSync(keyPath, String(keypair.privateKey), { mode: 0o600 });

  const artifact = {
    address,
    publicKey: keypair.publicKey,
    privateKeyPath: keyPath,
    classHash: ARGENTX_CLASS_HASH,
    network: 'mainnet',
    deployed: false,
    createdAt: new Date().toISOString(),
  };

  const artifactPath = path.join(SECRETS_DIR, `${address}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), { mode: 0o600 });

  return artifactPath;
}

async function main() {
  const notes = parseInput();

  // Init Typhoon SDK
  const sdk = new TyphoonSDK();
  sdk.init(
    notes.map(n => n.secret),
    notes.map(n => n.nullifier),
    notes.map(n => n.pool)
  );

  // Generate keypair and compute address
  const keypair = generateKeypair();
  const address = computeAddress(keypair.publicKey);

  // Save artifact
  const artifactPath = saveArtifact(keypair, address);

  // Deploy via Typhoon
  await sdk.withdraw_to_anonymous_bot(keypair.publicKey, notes[0].txHash);

  // Capture latest block AFTER deployment (best-effort provenance)
  let latestBlock = null;
  try {
    const rpcUrl = resolveRpcUrl();
    const provider = new Provider({ nodeUrl: rpcUrl });
    const b = await provider.getBlock('latest');
    latestBlock = {
      blockNumber: b.block_number,
      blockHash: b.block_hash,
      timestamp: b.timestamp,
    };
  } catch {
    // ignore
  }

  // Update artifact as deployed
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  artifact.deployed = true;
  artifact.deployedAt = new Date().toISOString();
  artifact.deployedLatestBlock = latestBlock;
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), { mode: 0o600 });

  // Output result
  console.log(JSON.stringify({
    success: true,
    address,
    publicKey: keypair.publicKey,
    privateKeyPath: path.join(SECRETS_DIR, `${address}.key`),
    artifactPath,
    deployed: true,
    deployedLatestBlock: latestBlock,
    explorer: `https://voyager.online/contract/${address}`,
  }));
}

main().catch(err => fail(err?.message || String(err), err?.stack));
