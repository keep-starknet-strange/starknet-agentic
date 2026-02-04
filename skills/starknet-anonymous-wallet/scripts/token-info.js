#!/usr/bin/env node
/**
 * typhoon-starknet-account: token-info.js
 *
 * Fetch common ERC20 metadata and decode felt short strings.
 *
 * INPUT: JSON as first argument
 * { "tokenAddress": "0x..." }
 */

import { Provider, Contract, shortString } from 'starknet';

import { resolveRpcUrl } from './_rpc.js';

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
}

function tryDecodeFeltToShortString(v) {
  const s = String(v);
  try {
    const decoded = shortString.decodeShortString(s);
    // ensure printable-ish
    if (!decoded) return null;
    if (/[^\x20-\x7E]/.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function main() {
  const raw = process.argv[2];
  if (!raw) fail('No input.');

  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    fail(`JSON parse error: ${e.message}`);
  }

  if (!input.tokenAddress) fail('Missing "tokenAddress".');

  const rpcUrl = resolveRpcUrl(input);
  const provider = new Provider({ nodeUrl: rpcUrl });
  const cls = await provider.getClassAt(input.tokenAddress);
  if (!cls.abi) fail('Token has no ABI on chain.');

  const token = new Contract({ abi: cls.abi, address: input.tokenAddress, provider });

  // Best-effort metadata calls
  const out = {
    success: true,
    tokenAddress: input.tokenAddress,
    name: null,
    symbol: null,
    decimals: null,
    totalSupply: null
  };

  try {
    const v = await token.call('name', []);
    out.name = tryDecodeFeltToShortString(v) ?? String(v);
  } catch {}

  try {
    const v = await token.call('symbol', []);
    out.symbol = tryDecodeFeltToShortString(v) ?? String(v);
  } catch {}

  try {
    const v = await token.call('decimals', []);
    out.decimals = Number(String(v));
  } catch {}

  try {
    const v = await token.call('total_supply', []);
    out.totalSupply = String(v);
  } catch {}

  console.log(JSON.stringify(out));
}

main().catch((err) => fail(err.message));
