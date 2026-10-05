// Preload for the offline smoke test: `node --import ./smoke/fake-rpc.mjs <script>`.
//
// 1. Blocks sockets, TLS, DNS and node:http(s), so nothing can leave the process.
// 2. Replaces globalThis.fetch before starknet.js loads (starknet.js binds fetch
//    when its module is evaluated) and answers Starknet JSON-RPC 0.10 in-process.
// 3. Only then imports starknet.js, which resolves to the same module instance
//    the script under test uses, and points its config at the fake fetch.
//
// Configuration (all optional except FAKE_RPC_CHAIN_ID):
//   FAKE_RPC_CHAIN_ID          value returned by starknet_chainId
//   FAKE_RPC_STARKNET_VERSION  block starknet_version (default 0.14.1)
//   FAKE_RPC_TARGET_DIR        scarb target/dev, to check declared class hashes
//   FAKE_RPC_PREDECLARED=all   report every artifact class as already declared
//   FAKE_RPC_DECLARE_ERROR=51  answer declares with CLASS_ALREADY_DECLARED
//   FAKE_RPC_OWNERS            JSON {address|default: owner} for owner() calls
//   FAKE_RPC_LOG               JSONL file receiving calls, deployments, summary
import net from "net";
import tls from "tls";
import dns from "dns";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";

const blocked = (what) => function blockedNetwork() {
  throw new Error(`[fake-rpc] network blocked: ${what}`);
};
net.Socket.prototype.connect = blocked("net.Socket.connect");
net.connect = blocked("net.connect");
net.createConnection = blocked("net.createConnection");
tls.connect = blocked("tls.connect");
dns.lookup = blocked("dns.lookup");
dns.resolve = blocked("dns.resolve");
dns.promises.lookup = blocked("dns.promises.lookup");
http.request = blocked("http.request");
http.get = blocked("http.get");
https.request = blocked("https.request");
https.get = blocked("https.get");

const EXPECTED_URL = process.env.STARKNET_RPC_URL;
const CHAIN_ID = process.env.FAKE_RPC_CHAIN_ID;
const STARKNET_VERSION = process.env.FAKE_RPC_STARKNET_VERSION ?? "0.14.1";
const TARGET_DIR = process.env.FAKE_RPC_TARGET_DIR;
const LOG_PATH = process.env.FAKE_RPC_LOG;
const CONTRACTS = ["IdentityRegistry", "ReputationRegistry", "ValidationRegistry"];

const failures = [];
const methodCounts = {};
const log = (entry) => {
  if (LOG_PATH) fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
};

let sn; // starknet.js, imported after fetch is replaced
const declared = new Set();
const receipts = new Map();
const nonces = new Map();
const expected = new Map(); // class hash -> { name, compiledClassHash }
let txCounter = 0;

const norm = (value) => sn.num.toHex(value);
const nextTxHash = () => norm(0x7700000n + BigInt(++txCounter));

class RpcFail extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// Class hash as a sequencer derives it from the submitted payload: the ABI is
// hashed exactly as the string that was sent, without re-serializing it.
function nodeClassHash(contractClass) {
  const poseidon = (values) => BigInt(sn.hash.computePoseidonHashOnElements(values));
  const entryPoints = (eps) => poseidon(eps.flatMap((ep) => [BigInt(ep.selector), BigInt(ep.function_idx)]));
  if (typeof contractClass.abi !== "string") failures.push("declare: contract_class.abi is not a string");
  return norm(poseidon([
    BigInt(sn.shortString.encodeShortString("CONTRACT_CLASS_V0.1.0")),
    entryPoints(contractClass.entry_points_by_type.EXTERNAL),
    entryPoints(contractClass.entry_points_by_type.L1_HANDLER),
    entryPoints(contractClass.entry_points_by_type.CONSTRUCTOR),
    BigInt(sn.hash.starknetKeccak(String(contractClass.abi))),
    poseidon(contractClass.sierra_program.map((felt) => BigInt(felt))),
  ]));
}

function block() {
  return {
    status: "ACCEPTED_ON_L2",
    block_hash: "0x1234",
    parent_hash: "0x1233",
    block_number: 1000,
    new_root: "0x1",
    timestamp: 1759650000,
    sequencer_address: "0x1",
    l1_gas_price: { price_in_fri: "0x10", price_in_wei: "0x1" },
    l2_gas_price: { price_in_fri: "0x10", price_in_wei: "0x1" },
    l1_data_gas_price: { price_in_fri: "0x10", price_in_wei: "0x1" },
    l1_da_mode: "BLOB",
    starknet_version: STARKNET_VERSION,
    event_commitment: "0x0",
    transaction_commitment: "0x0",
    receipt_commitment: "0x0",
    state_diff_commitment: "0x0",
    event_count: 0,
    transaction_count: 0,
    state_diff_length: 0,
    transactions: [],
  };
}

function receipt(type, transactionHash, events = []) {
  return {
    type,
    transaction_hash: transactionHash,
    actual_fee: { amount: "0x1", unit: "FRI" },
    execution_status: "SUCCEEDED",
    finality_status: "ACCEPTED_ON_L2",
    block_hash: "0x1234",
    block_number: 1000,
    messages_sent: [],
    events,
    execution_resources: { l1_gas: 1, l1_data_gas: 1, l2_gas: 1 },
  };
}

function checkV3Transaction(tx, kind) {
  const problems = [];
  if (tx.version !== "0x3") problems.push(`version=${tx.version}`);
  if (!Array.isArray(tx.signature) || tx.signature.length < 2) problems.push("signature missing");
  for (const resource of ["l1_gas", "l2_gas", "l1_data_gas"]) {
    if (!tx.resource_bounds?.[resource]) problems.push(`resource_bounds.${resource} missing`);
  }
  if (problems.length > 0) failures.push(`${kind}: ${problems.join(", ")}`);
}

function bumpNonce(sender) {
  nonces.set(sender, (nonces.get(sender) ?? 0n) + 1n);
}

function declareTransaction({ declare_transaction: tx }) {
  checkV3Transaction(tx, "declare");
  const classHash = nodeClassHash(tx.contract_class);
  if (process.env.FAKE_RPC_DECLARE_ERROR === "51") {
    declared.add(classHash);
    throw new RpcFail(51, "Class already declared");
  }
  const artifact = expected.get(classHash);
  if (TARGET_DIR && !artifact) {
    failures.push(`declare: a node would compute class hash ${classHash}, which matches no artifact`);
  } else if (artifact && norm(tx.compiled_class_hash) !== artifact.compiledClassHash) {
    failures.push(
      `declare ${artifact.name}: compiled_class_hash ${tx.compiled_class_hash} != ${artifact.compiledClassHash} (starknet ${STARKNET_VERSION})`,
    );
  }
  bumpNonce(norm(tx.sender_address));
  declared.add(classHash);
  const transactionHash = nextTxHash();
  receipts.set(transactionHash, receipt("DECLARE", transactionHash));
  log({ declared: artifact?.name ?? classHash, classHash });
  return { transaction_hash: transactionHash, class_hash: classHash };
}

// Decodes a Cairo 1 account __execute__ calldata of UDC deploy calls and emits
// the ContractDeployed events the UDC would.
function invokeTransaction({ invoke_transaction: tx }) {
  checkV3Transaction(tx, "invoke");
  const sender = norm(tx.sender_address);
  const udc = norm(sn.constants.UDC.ADDRESS);
  const deploySelector = norm(sn.hash.getSelectorFromName(sn.constants.UDC.ENTRYPOINT));
  const calldata = tx.calldata.map((felt) => BigInt(felt));
  const events = [];
  let offset = 1;
  for (let call = 0; call < Number(calldata[0]); call += 1) {
    const to = norm(calldata[offset]);
    const selector = norm(calldata[offset + 1]);
    const length = Number(calldata[offset + 2]);
    const data = calldata.slice(offset + 3, offset + 3 + length);
    offset += 3 + length;
    if (to !== udc || selector !== deploySelector) {
      failures.push(`invoke: unexpected call to ${to} selector ${selector}`);
      continue;
    }
    const [classHashFelt, salt, unique, constructorLength, ...rest] = data;
    const classHash = norm(classHashFelt);
    if (!declared.has(classHash)) {
      throw new RpcFail(28, `Class hash not found (deploy of undeclared ${classHash})`);
    }
    const constructorCalldata = rest.slice(0, Number(constructorLength));
    const address = norm(sn.hash.calculateContractAddressFromHash(
      unique ? sn.ec.starkCurve.pedersen(sender, norm(salt)) : salt,
      classHash,
      constructorCalldata,
      unique ? udc : 0,
    ));
    events.push({
      from_address: udc,
      keys: [norm(sn.hash.getSelectorFromName("ContractDeployed"))],
      data: [address, sender, norm(unique), classHash, norm(constructorLength), ...constructorCalldata.map(norm), norm(salt)],
    });
    log({ deployed: expected.get(classHash)?.name ?? classHash, address, constructorCalldata: constructorCalldata.map(norm) });
  }
  bumpNonce(sender);
  const transactionHash = nextTxHash();
  receipts.set(transactionHash, receipt("INVOKE", transactionHash, events));
  return { transaction_hash: transactionHash };
}

function call({ request }) {
  if (norm(request.entry_point_selector) !== norm(sn.hash.getSelectorFromName("owner"))) {
    throw new RpcFail(21, "Invalid message selector");
  }
  const owners = JSON.parse(process.env.FAKE_RPC_OWNERS ?? "{}");
  const owner = owners[norm(request.contract_address)] ?? owners.default;
  if (!owner) throw new RpcFail(20, "Contract not found");
  return [owner];
}

const handlers = {
  starknet_specVersion: () => "0.10.2",
  starknet_chainId: () => CHAIN_ID,
  starknet_blockNumber: () => 1000,
  starknet_blockHashAndNumber: () => ({ block_hash: "0x1234", block_number: 1000 }),
  starknet_getBlockWithTxHashes: block,
  starknet_getBlockWithTxs: block,
  starknet_getClass: ({ class_hash }) => {
    if (!declared.has(norm(class_hash))) throw new RpcFail(28, "Class hash not found");
    return {
      sierra_program: [],
      contract_class_version: "0.1.0",
      entry_points_by_type: { CONSTRUCTOR: [], EXTERNAL: [], L1_HANDLER: [] },
      abi: "[]",
    };
  },
  starknet_getNonce: ({ contract_address }) => norm(nonces.get(norm(contract_address)) ?? 0n),
  starknet_estimateFee: ({ request }) => request.map(() => ({
    l1_gas_consumed: "0x100",
    l1_gas_price: "0x10",
    l2_gas_consumed: "0x100000",
    l2_gas_price: "0x10",
    l1_data_gas_consumed: "0x100",
    l1_data_gas_price: "0x10",
    overall_fee: "0x1002000",
    unit: "FRI",
  })),
  starknet_addDeclareTransaction: declareTransaction,
  starknet_addInvokeTransaction: invokeTransaction,
  starknet_getTransactionStatus: ({ transaction_hash }) => {
    if (!receipts.has(norm(transaction_hash))) throw new RpcFail(29, "Transaction hash not found");
    return { finality_status: "ACCEPTED_ON_L2", execution_status: "SUCCEEDED" };
  },
  starknet_getTransactionReceipt: ({ transaction_hash }) => {
    const found = receipts.get(norm(transaction_hash));
    if (!found) throw new RpcFail(29, "Transaction hash not found");
    return found;
  },
  starknet_call: call,
};

function answer(request) {
  methodCounts[request.method] = (methodCounts[request.method] ?? 0) + 1;
  const handler = handlers[request.method];
  if (!handler) {
    failures.push(`unhandled RPC method ${request.method}`);
    return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } };
  }
  try {
    return { jsonrpc: "2.0", id: request.id, result: handler(request.params ?? {}) };
  } catch (error) {
    if (!(error instanceof RpcFail)) throw error;
    return { jsonrpc: "2.0", id: request.id, error: { code: error.code, message: error.message } };
  }
}

async function fakeFetch(url, init = {}) {
  if (String(url) !== EXPECTED_URL) {
    failures.push(`fetch to unexpected URL ${url}`);
    throw new Error(`[fake-rpc] unexpected fetch URL ${url}`);
  }
  const body = JSON.parse(init.body);
  const response = Array.isArray(body) ? body.map(answer) : answer(body);
  return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
}

globalThis.fetch = fakeFetch;
sn = await import("starknet");
sn.config.set("fetch", fakeFetch);
// waitForTransaction sleeps transactionRetryIntervalFallback (5s) before each
// status poll; the fake confirms immediately, so poll every 10ms instead.
const channelDefaults = sn.config.get("channelDefaults");
sn.config.set("channelDefaults", {
  ...channelDefaults,
  options: { ...channelDefaults.options, transactionRetryIntervalFallback: 10 },
});

if (TARGET_DIR) {
  for (const name of CONTRACTS) {
    const read = (suffix) => sn.json.parse(
      fs.readFileSync(path.join(TARGET_DIR, `erc8004_${name}.${suffix}.json`)).toString("ascii"),
    );
    const classHash = norm(sn.hash.computeContractClassHash(read("contract_class")));
    const compiledClassHash = norm(sn.hash.computeCompiledClassHash(read("compiled_contract_class"), STARKNET_VERSION));
    expected.set(classHash, { name, compiledClassHash });
    if (process.env.FAKE_RPC_PREDECLARED === "all") declared.add(classHash);
  }
}

process.on("exit", (code) => {
  log({ summary: { exitCode: code, rpcMethods: methodCounts, failures } });
  if (failures.length > 0) {
    process.stderr.write(`[fake-rpc] failures:\n  ${failures.join("\n  ")}\n`);
    process.exitCode = 99;
  }
});
