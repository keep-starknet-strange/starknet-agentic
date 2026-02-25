#!/usr/bin/env node

/**
 * Controller Calls Spike - Generate calls.json from MCP-style input
 *
 * Usage:
 *   node run.mjs                       # prints sample calls.json to stdout
 *   node run.mjs > calls.json          # save to file
 *   node run.mjs --execute             # execute with starknet.js (needs env vars)
 *
 * Env vars (only for --execute):
 *   STARKNET_RPC_URL
 *   STARKNET_RPC_SPEC_VERSION (optional, defaults to 0.9.0; supports 0.9.x/0.10.x)
 *   STARKNET_ACCOUNT_ADDRESS
 *   STARKNET_PRIVATE_KEY
 */

import { readFileSync, writeFileSync } from "node:fs";

// --- Call builder (mirrors starknet_build_calls MCP tool logic) ---

const FELT_MAX = (1n << 251n) - 1n;

function resolveRpcSpecVersion(value) {
  const normalized = value?.trim();
  if (!normalized || normalized.startsWith("0.9")) {
    return "0.9.0";
  }
  if (normalized.startsWith("0.10")) {
    return "0.10.0";
  }
  throw new Error(
    `Unsupported STARKNET_RPC_SPEC_VERSION: "${normalized}". Expected 0.9.x or 0.10.x`
  );
}

function validateFelt(name, value) {
  const n = BigInt(value);
  if (n < 0n || n > FELT_MAX) {
    throw new Error(`${name}: ${value} is out of felt range`);
  }
  return "0x" + n.toString(16);
}

function buildCalls(rawCalls) {
  if (!rawCalls || rawCalls.length === 0) {
    throw new Error("calls array must not be empty");
  }

  return rawCalls.map((call, i) => {
    if (!call.contractAddress) throw new Error(`calls[${i}].contractAddress required`);
    if (!call.entrypoint) throw new Error(`calls[${i}].entrypoint required`);

    const calldata = (call.calldata || []).map((v, j) =>
      validateFelt(`calls[${i}].calldata[${j}]`, v)
    );

    return {
      contractAddress: call.contractAddress,
      entrypoint: call.entrypoint,
      calldata,
    };
  });
}

// --- Sample calls ---

const sampleCalls = [
  {
    contractAddress:
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    entrypoint: "transfer",
    calldata: [
      "0x0000000000000000000000000000000000000000000000000000000000000123",
      "0x0",
      "0x64",
      "0x0",
    ],
  },
];

// --- Main ---

const args = process.argv.slice(2);
const executeMode = args.includes("--execute");

const calls = buildCalls(sampleCalls);
const callsJson = JSON.stringify(calls, null, 2);

if (!executeMode) {
  // Print calls.json to stdout
  console.log(callsJson);
  console.error(
    `\n# ${calls.length} call(s) built. To execute with Cartridge Controller:\n` +
    `#   node run.mjs > calls.json\n` +
    `#   # Then in your Controller-enabled app:\n` +
    `#   import calls from "./calls.json" assert { type: "json" };\n` +
    `#   await account.execute(calls);\n`
  );
  process.exit(0);
}

// --- Execute mode (starknet.js, not Controller) ---

const { RpcProvider, Account } = await import("starknet");

const rpcUrl = process.env.STARKNET_RPC_URL;
const address = process.env.STARKNET_ACCOUNT_ADDRESS;
const privateKey = process.env.STARKNET_PRIVATE_KEY;

if (!rpcUrl || !address || !privateKey) {
  console.error(
    "Set STARKNET_RPC_URL, STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY"
  );
  process.exit(1);
}
let rpcSpecVersion;
try {
  rpcSpecVersion = resolveRpcSpecVersion(process.env.STARKNET_RPC_SPEC_VERSION);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.error("Executing calls with starknet.js...");
console.error("Calls:", callsJson);

const provider = new RpcProvider({ nodeUrl: rpcUrl, specVersion: rpcSpecVersion });
const account = new Account(provider, address, privateKey);
const result = await account.execute(calls);

console.log(JSON.stringify({ transactionHash: result.transaction_hash }, null, 2));

const receipt = await provider.waitForTransaction(result.transaction_hash);
console.error("Transaction accepted:", result.transaction_hash);
