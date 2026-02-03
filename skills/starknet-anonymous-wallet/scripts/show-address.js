#!/usr/bin/env node
/**
 * typhoon-starknet-account: show-address.js
 * 
 * Shows the address(es) of existing Starknet account(s).
 * 
 * INPUT:  Optional: index (0-based) as first argument to show specific account
 * OUTPUT: JSON to stdout with address info
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
  const indexArg = process.argv[2];
  const index = indexArg !== undefined ? parseInt(indexArg, 10) : null;

  if (!fs.existsSync(SECRETS_DIR)) {
    fail("No Starknet accounts found. Create one first using create-account.js");
  }

  const files = fs.readdirSync(SECRETS_DIR)
    .filter(f => f.endsWith('.json'))
    .sort(); // Consistent ordering

  if (files.length === 0) {
    fail("No Starknet accounts found. Create one first using create-account.js");
  }

  const accounts = files.map((f, i) => {
    const artifactPath = path.join(SECRETS_DIR, f);
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
      return {
        index: i,
        address: artifact.address,
        network: artifact.network || 'mainnet',
        deployed: artifact.deployed || false,
        explorer: `https://voyager.online/contract/${artifact.address}`,
        starkscan: `https://starkscan.co/contract/${artifact.address}`,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  if (index !== null) {
    if (index < 0 || index >= accounts.length) {
      fail(`Invalid index ${index}. Valid range: 0-${accounts.length - 1}`);
    }
    const account = accounts[index];
    console.log(JSON.stringify({
      address: account.address,
      network: account.network,
      deployed: account.deployed,
      explorer: account.explorer,
      starkscan: account.starkscan,
    }));
    return;
  }

  // Return all addresses
  if (accounts.length === 1) {
    const account = accounts[0];
    console.log(JSON.stringify({
      address: account.address,
      network: account.network,
      deployed: account.deployed,
      explorer: account.explorer,
      starkscan: account.starkscan,
    }));
  } else {
    console.log(JSON.stringify({
      count: accounts.length,
      accounts: accounts.map(a => ({
        index: a.index,
        address: a.address,
        network: a.network,
        deployed: a.deployed,
        explorer: a.explorer,
      })),
      hint: "Pass index as argument to get specific account details",
    }));
  }
}

main();
