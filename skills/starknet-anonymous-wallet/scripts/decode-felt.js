#!/usr/bin/env node
/**
 * typhoon-starknet-account: decode-felt.js
 *
 * Decode a felt252 that represents a short string.
 *
 * INPUT: JSON as first argument
 * { "felt": "1398035019" }
 */

import { shortString } from 'starknet';

function fail(message) {
  console.error(JSON.stringify({ error: message }));
  process.exit(1);
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

  if (input.felt === undefined || input.felt === null) fail('Missing "felt".');

  const feltStr = String(input.felt);
  let decoded;
  try {
    decoded = shortString.decodeShortString(feltStr);
  } catch (e) {
    fail(`Decode failed: ${e.message}`);
  }

  console.log(JSON.stringify({ success: true, felt: feltStr, decoded }));
}

main().catch((err) => fail(err.message));
