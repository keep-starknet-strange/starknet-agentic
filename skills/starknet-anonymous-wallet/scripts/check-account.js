#!/usr/bin/env node
/**
 * typhoon-starknet-account: check-account.js
 * 
 * Checks if a Starknet account already exists for this agent.
 * 
 * INPUT:  None required (optional: address as first argument to check specific account)
 * OUTPUT: JSON to stdout with account status
 * ERRORS: JSON to stderr
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const SECRETS_DIR = path.join(os.homedir(), '.openclaw', 'secrets', 'starknet');

function main() {
  const targetAddress = process.argv[2] || null;

  // Check if secrets directory exists
  if (!fs.existsSync(SECRETS_DIR)) {
    console.log(JSON.stringify({
      hasAccount: false,
      accountCount: 0,
      accounts: [],
      message: "No Starknet accounts found. A new account needs to be created."
    }));
    return;
  }

  // Find all account artifacts
  const files = fs.readdirSync(SECRETS_DIR).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log(JSON.stringify({
      hasAccount: false,
      accountCount: 0,
      accounts: [],
      message: "No Starknet accounts found. A new account needs to be created."
    }));
    return;
  }

  // Load all accounts
  const accounts = files.map(f => {
    const artifactPath = path.join(SECRETS_DIR, f);
    try {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
      return {
        address: artifact.address,
        publicKey: artifact.publicKey,
        network: artifact.network || 'mainnet',
        deployed: artifact.deployed || false,
        createdAt: artifact.createdAt,
        deployedAt: artifact.deployedAt,
        explorer: `https://voyager.online/contract/${artifact.address}`,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  // If checking for a specific address
  if (targetAddress) {
    const found = accounts.find(a => 
      a.address.toLowerCase() === targetAddress.toLowerCase() ||
      a.address.toLowerCase().endsWith(targetAddress.toLowerCase())
    );
    
    if (found) {
      console.log(JSON.stringify({
        hasAccount: true,
        accountCount: 1,
        accounts: [found],
        message: `Account found: ${found.address}`
      }));
    } else {
      console.log(JSON.stringify({
        hasAccount: false,
        accountCount: 0,
        accounts: [],
        message: `No account found with address: ${targetAddress}`
      }));
    }
    return;
  }

  // Return all accounts
  console.log(JSON.stringify({
    hasAccount: true,
    accountCount: accounts.length,
    accounts,
    message: accounts.length === 1 
      ? `Found 1 Starknet account: ${accounts[0].address}`
      : `Found ${accounts.length} Starknet accounts.`
  }));
}

main();
