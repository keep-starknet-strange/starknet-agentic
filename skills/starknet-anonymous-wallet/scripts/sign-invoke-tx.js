#!/usr/bin/env node
/**
 * typhoon-starknet-account: sign-invoke-tx.js
 *
 * Purpose: Sign a Starknet INVOKE transaction (one or more calls) WITHOUT broadcasting.
 *
 * SECURITY:
 * - NEVER prints the private key.
 * - Reads the private key locally from ~/.openclaw/secrets/starknet via accountAddress.
 *
 * INPUT (JSON as argv[2]):
 * {
 *   "accountAddress": "0x...",
 *   "calls": [
 *     { "contractAddress":"0x...", "entrypoint":"transfer", "calldata":["0x..","123"] }
 *   ],
 *   "rpcUrl": "https://rpc.starknet.lava.build:443",          // optional
 *   "nonce": "0x...",                                         // optional (auto-fetch)
 *   "maxFee": "0x...",                                        // optional (auto-estimate)
 *   "version": "0x3",                                         // optional (default 0x3)
 *   "onlyQuery": false                                         // optional (default false)
 * }
 *
 * OUTPUT (stdout): JSON
 * {
 *   ok: true,
 *   accountAddress,
 *   chainId,
 *   nonce,
 *   maxFee,
 *   version,
 *   invokeTransaction: {
 *     type: "INVOKE",
 *     sender_address,
 *     calldata,
 *     signature,
 *     max_fee,
 *     nonce,
 *     version
 *   },
 *   feeEstimate?: {...}
 * }
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Account, Provider, Contract } from 'starknet';

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
  console.error(JSON.stringify({ error: err?.message || String(err), stack: err?.stack }, null, 2));
  process.exit(1);
}

function biReplacer(_k, v) {
  return typeof v === 'bigint' ? v.toString() : v;
}

async function main() {
  const raw = process.argv[2];
  if (!raw) throw new Error('Missing JSON input argument');
  const input = JSON.parse(raw);

  const accountAddress = input.accountAddress;
  const callsInput = input.calls;
  const rpcUrl = input.rpcUrl || process.env.STARKNET_RPC_URL || 'https://rpc.starknet.lava.build:443';
  const version = input.version || '0x3';

  if (!accountAddress) throw new Error('Missing accountAddress');
  if (!Array.isArray(callsInput) || callsInput.length === 0) throw new Error('Missing calls[]');

  const pkPath = resolvePrivateKeyPath({ accountAddress, privateKeyPath: input.privateKeyPath });
  const pk = fs.readFileSync(pkPath, 'utf-8').trim();

  const provider = new Provider({ nodeUrl: rpcUrl });
  const account = new Account({ provider, address: accountAddress, signer: pk });

  const chainId = await provider.getChainId();

  // Normalize calls:
  // - if a call has { contractAddress, method, args } we ABI-populate it
  // - otherwise expect { contractAddress, entrypoint, calldata }
  const normalizedCalls = [];
  for (const c of callsInput) {
    if (c && c.contractAddress && c.method) {
      const cls = await provider.getClassAt(c.contractAddress);
      if (!cls.abi) throw new Error(`Contract has no ABI on chain: ${c.contractAddress}`);
      const contract = new Contract({ abi: cls.abi, address: c.contractAddress, provider });
      normalizedCalls.push(contract.populate(c.method, c.args || []));
    } else if (c && c.contractAddress && c.entrypoint) {
      normalizedCalls.push({
        contractAddress: c.contractAddress,
        entrypoint: c.entrypoint,
        calldata: c.calldata || [],
      });
    } else {
      throw new Error('Each call must be either {contractAddress, method, args} or {contractAddress, entrypoint, calldata}');
    }
  }

  const nonce = input.nonce || (await account.getNonce());

  // Fee estimate / bounds
  let feeEstimate = null;
  try {
    feeEstimate = await account.estimateInvokeFee(normalizedCalls, { nonce });
  } catch {
    feeEstimate = null;
  }

  // Sign WITHOUT broadcasting
  // starknet.js signer.signTransaction requires additional v3 fields.
  const cairoVersion = await account.getCairoVersion();

  const details = {
    walletAddress: accountAddress,
    cairoVersion,
    chainId,
    // v3 params
    version,
    nonce,
    nonceDataAvailabilityMode: 'L1',
    feeDataAvailabilityMode: 'L1',
    resourceBounds: feeEstimate?.resourceBounds,
    tip: 1n,
    paymasterData: [],
    accountDeploymentData: [],
    // keep maxFee for debugging (unused in v3 hash)
    maxFee: input.maxFee || '0x0',
  };

  const inv = await account.buildInvocation(normalizedCalls, details);

  // Build RPC payload for starknet_addInvokeTransaction.
  const invokeTransaction = {
    type: 'INVOKE',
    sender_address: accountAddress,
    calldata: inv.calldata,
    signature: Array.isArray(inv.signature)
      ? inv.signature
      : (inv.signature && typeof inv.signature === 'object' && 'r' in inv.signature && 's' in inv.signature)
        ? [String(inv.signature.r), String(inv.signature.s)]
        : inv.signature,
    nonce: inv.nonce ?? nonce,
    version: inv.version ?? version,
    // v3 fields (when present)
    resource_bounds: inv.resourceBounds ?? details.resourceBounds ?? null,
    tip: inv.tip ?? details.tip ?? null,
    paymaster_data: inv.paymasterData ?? [],
    account_deployment_data: inv.accountDeploymentData ?? [],
    // legacy field (kept for debugging)
    max_fee: inv.maxFee ?? details.maxFee ?? null,
  };

  console.log(
    JSON.stringify(
      {
        ok: true,
        accountAddress,
        chainId,
        nonce: details.nonce,
        maxFee: details.maxFee,
        version: details.version,
        feeEstimate,
        invokeTransaction,
      },
      biReplacer,
      2,
    ),
  );
}

main().catch(fail);
