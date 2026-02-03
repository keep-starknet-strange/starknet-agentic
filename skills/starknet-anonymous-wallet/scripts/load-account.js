#!/usr/bin/env node
/**
 * typhoon-starknet-account: load-account.js
 * 
 * INPUT:  Optional address as first argument (loads first found if omitted)
 * OUTPUT: JSON to stdout with account details (includes privateKey)
 * ERRORS: JSON to stderr
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const SECRETS_DIR = path.join(os.homedir(), '.openclaw', 'secrets', 'starknet');

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function main() {
  const targetAddress = process.argv[2] || null;

  if (!fs.existsSync(SECRETS_DIR)) {
    console.log(JSON.stringify({ exists: false, account: null }));
    return;
  }

  const files = fs.readdirSync(SECRETS_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(JSON.stringify({ exists: false, account: null }));
    return;
  }

  let artifactFile;
  if (targetAddress) {
    artifactFile = files.find(f => f.includes(targetAddress));
    if (!artifactFile) {
      fail(`No account found with address: ${targetAddress}`);
    }
  } else if (files.length > 1) {
    // Multiple accounts - return list
    const accounts = files.map(f => f.replace('.json', ''));
    console.log(JSON.stringify({ exists: true, multiple: true, accounts }));
    return;
  } else {
    artifactFile = files[0];
  }

  const artifactPath = path.join(SECRETS_DIR, artifactFile);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

  console.log(JSON.stringify({
    exists: true,
    account: {
      address: artifact.address,
      publicKey: artifact.publicKey,
      privateKeyPath: artifact.privateKeyPath,
      network: artifact.network,
      deployed: artifact.deployed,
      classHash: artifact.classHash,
      artifactPath,
    },
  }));
}

main();
