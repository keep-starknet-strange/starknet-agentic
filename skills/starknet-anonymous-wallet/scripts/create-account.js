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

const ARGENTX_CLASS_HASH = '0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f';
const SECRETS_DIR = path.join(os.homedir(), '.openclaw', 'secrets', 'starknet');
const RPC_URL = 'https://rpc.starknet.lava.build:443';

function fail(message, stack) {
  console.error(JSON.stringify({ error: message, stack }));
  process.exit(1);
}

function parseInput() {
  // Try first argument, then stdin
  let raw = process.argv[2];
  
  if (!raw) {
    // Read from stdin synchronously
    try {
      raw = fs.readFileSync(0, 'utf-8');
    } catch {
      fail('No input. Pass JSON as argument or via stdin.');
    }
  }
  
  if (!raw || !raw.trim()) {
    fail('Empty input.');
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
        fail(`Note ${i}: missing field "${field}"`);
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
    const provider = new Provider({ nodeUrl: RPC_URL });
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
