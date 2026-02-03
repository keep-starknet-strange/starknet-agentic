#!/usr/bin/env node
/**
 * typhoon-starknet-account: sign-typed-data.js
 *
 * Purpose: Sign Starknet typedData (EIP-712 style) using a local account private key file.
 *
 * SECURITY:
 * - NEVER prints the private key.
 * - Only reads private key from privateKeyPath and outputs the signature.
 *
 * INPUT (JSON as argv[2]):
 * {
 *   "privateKeyPath": "~/.openclaw/secrets/starknet/<addr>.key",
 *   "accountAddress": "0x...",
 *   "typedData": { ... },
 *   "rpcUrl": "https://rpc.starknet.lava.build:443" // optional
 * }
 *
 * Alternative: provide typedDataPath instead of typedData:
 * {
 *   "privateKeyPath": "...",
 *   "accountAddress": "0x...",
 *   "typedDataPath": "/tmp/typedData.json",
 *   "rpcUrl": "..."
 * }
 *
 * OUTPUT (stdout):
 * { "ok": true, "signature": ["0x...","0x..."], "address": "0x..." }
 *
 * ERRORS (stderr): { "error": "...", "stack": "..." }
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Account, Provider } from 'starknet';

const SECRETS_DIR = path.join(os.homedir(), '.openclaw', 'secrets', 'starknet');

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolvePrivateKeyPath({ accountAddress, privateKeyPath }) {
  if (privateKeyPath) return expandHome(privateKeyPath);

  const direct = path.join(SECRETS_DIR, `${accountAddress}.key`);
  if (fs.existsSync(direct)) return direct;

  if (fs.existsSync(SECRETS_DIR)) {
    const jsons = fs.readdirSync(SECRETS_DIR).filter((f) => f.endsWith('.json'));
    for (const f of jsons) {
      try {
        const artifact = JSON.parse(fs.readFileSync(path.join(SECRETS_DIR, f), 'utf-8'));
        if (artifact?.address?.toLowerCase?.() === accountAddress.toLowerCase()) {
          if (artifact.privateKeyPath) return expandHome(artifact.privateKeyPath);
        }
      } catch {
        // ignore
      }
    }
  }

  throw new Error('Could not resolve private key path for this accountAddress');
}

function fail(err) {
  const message = err?.message || String(err);
  console.error(JSON.stringify({ error: message, stack: err?.stack }, null, 2));
  process.exit(1);
}

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error('Missing JSON input argument');

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error('Input must be valid JSON string as argv[2]');
  }

  const accountAddress = input.accountAddress;
  const rpcUrl = input.rpcUrl || process.env.STARKNET_RPC_URL || 'https://rpc.starknet.lava.build:443';

  if (!accountAddress) throw new Error('Missing accountAddress');

  const privateKeyPath = resolvePrivateKeyPath({ accountAddress, privateKeyPath: input.privateKeyPath });

  let typedData = input.typedData;
  if (!typedData && input.typedDataPath) {
    const tdPath = expandHome(input.typedDataPath);
    typedData = JSON.parse(fs.readFileSync(tdPath, 'utf-8'));
  }
  if (!typedData) throw new Error('Missing typedData (or typedDataPath)');

  const pk = fs.readFileSync(privateKeyPath, 'utf-8').trim();

  const provider = new Provider({ nodeUrl: rpcUrl });
  const account = new Account({ provider, address: accountAddress, signer: pk });

  const sigRaw = await account.signMessage(typedData);
  const sigArr = Array.isArray(sigRaw)
    ? sigRaw
    : (sigRaw && typeof sigRaw === 'object' && 'r' in sigRaw && 's' in sigRaw)
      ? [sigRaw.r, sigRaw.s]
      : null;

  if (!sigArr) throw new Error('Unexpected signature shape from account.signMessage');

  const signature = sigArr.map((x) => (typeof x === 'bigint' ? '0x' + x.toString(16) : String(x)));

  console.log(JSON.stringify({ ok: true, address: accountAddress, signature }, null, 2));
}

main().catch(fail);
