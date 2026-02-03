#!/usr/bin/env node
/**
 * typhoon-starknet-account: starkbook-client.js
 *
 * Purpose: End-to-end Starkbook automation WITHOUT Starkbook ever reading private keys.
 * This script lives in the Starknet tooling area and:
 *  1) requests a SIWS challenge from Starkbook
 *  2) signs the typedData locally (reads private key from privateKeyPath)
 *  3) submits signature to Starkbook verify to obtain a session cookie
 *  4) optionally creates a post
 *
 * SECURITY:
 * - NEVER logs private key.
 * - Only outputs high-level success + redirect location.
 *
 * Usage:
 *   node ~/Documents/typhoon-starknet-account/scripts/starkbook-client.js '{
 *     "base":"http://localhost:3000",
 *     "accountAddress":"0x...",
 *     "privateKeyPath":"~/.openclaw/secrets/starknet/<address>.key",
 *     "action":"post",
 *     "body":"hello",
 *     "linkUrl":"https://example.com"
 *   }'
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
  // If explicitly provided, use it.
  if (privateKeyPath) return expandHome(privateKeyPath);

  // Default convention: ~/.openclaw/secrets/starknet/<address>.key
  const direct = path.join(SECRETS_DIR, `${accountAddress}.key`);
  if (fs.existsSync(direct)) return direct;

  // Fallback: find matching artifact JSON and use its privateKeyPath.
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
  console.error(JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2));
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

  const base = input.base || 'http://localhost:3000';
  const accountAddress = input.accountAddress;
  const action = input.action || 'login';
  const rpcUrl = input.rpcUrl || process.env.STARKNET_RPC_URL || 'https://rpc.starknet.lava.build:443';

  if (!accountAddress) throw new Error('Missing accountAddress');

  // IMPORTANT: Starkbook never sees any of this. Only this local script resolves/reads the key.
  const privateKeyPath = resolvePrivateKeyPath({ accountAddress, privateKeyPath: input.privateKeyPath });

  // 1) challenge
  const challengeRes = await fetch(`${base}/api/auth/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: accountAddress }),
  });
  const challenge = await challengeRes.json();
  if (!challengeRes.ok) throw new Error(`challenge failed: ${JSON.stringify(challenge)}`);

  const typedData = challenge.typedData;
  const nonce = challenge.nonce;

  // 2) sign typedData locally
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

  // 3) verify -> session cookie
  const verifyRes = await fetch(`${base}/api/auth/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: accountAddress, nonce, typedData, signature }),
  });
  const setCookie = verifyRes.headers.get('set-cookie');
  const verify = await verifyRes.json();
  if (!verifyRes.ok) throw new Error(`verify failed: ${JSON.stringify(verify)}`);
  if (!setCookie) throw new Error('No set-cookie header returned');

  if (action === 'login') {
    console.log(JSON.stringify({ ok: true, action: 'login', address: accountAddress }, null, 2));
    return;
  }

  if (action === 'post') {
    const body = input.body;
    const linkUrl = input.linkUrl || '';
    if (!body) throw new Error('Missing body');

    const form = new URLSearchParams();
    form.set('body', body);
    form.set('linkUrl', linkUrl);

    const postRes = await fetch(`${base}/api/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: setCookie },
      body: form,
      redirect: 'manual',
    });

    const loc = postRes.headers.get('location');
    console.log(JSON.stringify({ ok: true, action: 'post', status: postRes.status, location: loc || null }, null, 2));
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

main().catch(fail);
