// Offline smoke test for deploy.js and verify_owners.js (`npm run smoke`).
//
// Runs both scripts against the in-process fake JSON-RPC in fake-rpc.mjs.
// Nothing reaches a network: sockets and DNS are blocked, STARKNET_RPC_URL
// uses the reserved .invalid TLD, and each run gets a clean environment with a
// throwaway key. The scripts run from a temporary copy of this package so the
// deployed_addresses*.json files they write never land in the repo.
//
// Requires the Sierra/CASM artifacts: run `scarb build` in contracts/erc8004-cairo first.
// Set SMOKE_ONLY=<regex> to run a subset of scenarios.
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { constants, ec, encode, num } from "starknet";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(__dirname, "..");
const TARGET_DIR = path.join(SCRIPTS_DIR, "..", "target", "dev");
const CONTRACTS = ["IdentityRegistry", "ReputationRegistry", "ValidationRegistry"];

for (const name of CONTRACTS) {
  for (const suffix of ["contract_class", "compiled_contract_class"]) {
    if (!fs.existsSync(path.join(TARGET_DIR, `erc8004_${name}.${suffix}.json`))) {
      console.error(`❌ Missing erc8004_${name}.${suffix}.json in ${TARGET_DIR}. Run \`scarb build\` in contracts/erc8004-cairo first.`);
      process.exit(1);
    }
  }
}

// Temporary copy of contracts/erc8004-cairo: scripts/ (script files plus a
// node_modules symlink) and target/dev (symlink), so __dirname-relative paths
// in the scripts resolve the same way they do in the repo.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "erc8004-smoke-"));
const workScripts = path.join(workDir, "scripts");
fs.mkdirSync(workScripts);
fs.mkdirSync(path.join(workDir, "target"));
for (const file of ["deploy.js", "verify_owners.js", "package.json"]) {
  fs.copyFileSync(path.join(SCRIPTS_DIR, file), path.join(workScripts, file));
}
fs.symlinkSync(path.join(SCRIPTS_DIR, "node_modules"), path.join(workScripts, "node_modules"), "dir");
fs.symlinkSync(TARGET_DIR, path.join(workDir, "target", "dev"), "dir");

const SN_MAIN = constants.StarknetChainId.SN_MAIN;
const SN_SEPOLIA = constants.StarknetChainId.SN_SEPOLIA;
const RPC_URL = "http://rpc.smoke.invalid/rpc";
const DEPLOYER = "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd";
const THROWAWAY_KEY = `0x${encode.buf2hex(ec.starkCurve.utils.randomPrivateKey())}`;

const results = [];

function run(name, script, env, check) {
  if (process.env.SMOKE_ONLY && !new RegExp(process.env.SMOKE_ONLY).test(name)) return;
  const logPath = path.join(workDir, `${name}.jsonl`);
  for (const file of fs.readdirSync(workDir)) {
    if (file.startsWith("deployed_addresses")) fs.rmSync(path.join(workDir, file));
  }
  const started = Date.now();
  const child = spawnSync(process.execPath, ["--import", path.join(__dirname, "fake-rpc.mjs"), script], {
    cwd: workScripts,
    encoding: "utf8",
    // Clean environment: nothing from the caller's shell (no real RPC URL or keys).
    env: {
      PATH: process.env.PATH,
      STARKNET_RPC_URL: RPC_URL,
      FAKE_RPC_TARGET_DIR: TARGET_DIR,
      FAKE_RPC_LOG: logPath,
      ...env,
    },
  });
  const lines = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    : [];
  const summary = lines.find((line) => line.summary)?.summary ?? {};
  const ctx = { status: child.status, output: `${child.stdout}\n${child.stderr}`, lines, summary };
  let problems;
  try {
    problems = check(ctx);
  } catch (error) {
    problems = [`check threw: ${error.message}`];
  }
  problems.push(...(summary.failures ?? []).map((failure) => `fake-rpc: ${failure}`));
  results.push({
    name,
    ok: problems.length === 0,
    exit: child.status,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
    rpcMethods: summary.rpcMethods ?? {},
    problems,
    output: ctx.output,
  });
}

const deployEnv = { DEPLOYER_ADDRESS: DEPLOYER, DEPLOYER_PRIVATE_KEY: THROWAWAY_KEY };
const reviewGates = { ALLOW_PUBLIC_DEPLOY: "true", REVIEW_ACKNOWLEDGED: "true", REVIEWER_IDENTITY: "offline-smoke" };
const expectExit = (ctx, code) => (ctx.status === code ? [] : [`exit ${ctx.status}, expected ${code}`]);
const expectOutput = (ctx, text) => (ctx.output.includes(text) ? [] : [`missing output: ${text}`]);
const expectNoTransactions = (ctx) => {
  const methods = ctx.summary.rpcMethods ?? {};
  return methods.starknet_addDeclareTransaction || methods.starknet_addInvokeTransaction ? ["sent a transaction"] : [];
};

function expectDeployment(ctx, { network, chainId, declares }) {
  const problems = [...expectExit(ctx, 0), ...expectOutput(ctx, "Deployment completed.")];
  const methods = ctx.summary.rpcMethods ?? {};
  if ((methods.starknet_addDeclareTransaction ?? 0) !== declares) {
    problems.push(`${methods.starknet_addDeclareTransaction ?? 0} declare transactions, expected ${declares}`);
  }
  if ((methods.starknet_addInvokeTransaction ?? 0) !== 3) {
    problems.push(`${methods.starknet_addInvokeTransaction ?? 0} deploy transactions, expected 3`);
  }

  const deployed = Object.fromEntries(ctx.lines.filter((line) => line.deployed).map((line) => [line.deployed, line]));
  const owner = num.toHex(DEPLOYER);
  const identity = deployed.IdentityRegistry?.address;
  if (JSON.stringify(deployed.IdentityRegistry?.constructorCalldata) !== JSON.stringify([owner])) {
    problems.push("IdentityRegistry constructor calldata != [owner]");
  }
  for (const name of ["ReputationRegistry", "ValidationRegistry"]) {
    if (JSON.stringify(deployed[name]?.constructorCalldata) !== JSON.stringify([owner, identity])) {
      problems.push(`${name} constructor calldata != [owner, identity_registry]`);
    }
  }

  for (const file of ["deployed_addresses.json", `deployed_addresses_${network}.json`]) {
    const filePath = path.join(workDir, file);
    if (!fs.existsSync(filePath)) {
      problems.push(`${file} not written`);
      continue;
    }
    const info = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (info.network !== network) problems.push(`${file}: network ${info.network}`);
    if (info.chainId !== chainId.toLowerCase()) problems.push(`${file}: chainId ${info.chainId}`);
    if (info.reviewerIdentity !== "offline-smoke") problems.push(`${file}: reviewerIdentity ${info.reviewerIdentity}`);
    for (const name of CONTRACTS) {
      const key = name[0].toLowerCase() + name.slice(1);
      if (num.toHex(info.contracts[key].address) !== deployed[name]?.address) problems.push(`${file}: ${key} address mismatch`);
    }
  }
  const timestamped = new RegExp(`^deployed_addresses_${network}_.+\\.json$`);
  if (!fs.readdirSync(workDir).some((file) => timestamped.test(file))) problems.push("timestamped artifact not written");
  return problems;
}

// ==================== deploy.js ====================
run("deploy sepolia", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, STARKNET_NETWORK: "sepolia", ...deployEnv, ...reviewGates },
  (ctx) => expectDeployment(ctx, { network: "sepolia", chainId: SN_SEPOLIA, declares: 3 }));

const sepoliaProof = path.join(workDir, "sepolia-proof.json");
if (fs.existsSync(path.join(workDir, "deployed_addresses_sepolia.json"))) {
  fs.copyFileSync(path.join(workDir, "deployed_addresses_sepolia.json"), sepoliaProof);
}

run("deploy sepolia (starknet 0.14.0 poseidon casm hash)", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, FAKE_RPC_STARKNET_VERSION: "0.14.0", ...deployEnv, ...reviewGates },
  (ctx) => expectDeployment(ctx, { network: "sepolia", chainId: SN_SEPOLIA, declares: 3 }));

run("deploy sepolia (classes already declared)", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, FAKE_RPC_PREDECLARED: "all", ...deployEnv, ...reviewGates },
  (ctx) => [
    ...expectDeployment(ctx, { network: "sepolia", chainId: SN_SEPOLIA, declares: 0 }),
    ...expectOutput(ctx, "Contract already declared"),
  ]);

run("deploy sepolia (CLASS_ALREADY_DECLARED on declare)", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, FAKE_RPC_DECLARE_ERROR: "51", ...deployEnv, ...reviewGates },
  (ctx) => {
    const problems = [...expectExit(ctx, 0), ...expectOutput(ctx, "Contract already declared"), ...expectOutput(ctx, "Deployment completed.")];
    if ((ctx.summary.rpcMethods?.starknet_addInvokeTransaction ?? 0) !== 3) problems.push("expected 3 deploy transactions");
    return problems;
  });

run("deploy mainnet (with sepolia proof)", "deploy.js",
  {
    FAKE_RPC_CHAIN_ID: SN_MAIN,
    STARKNET_NETWORK: "mainnet",
    ALLOW_MAINNET_DEPLOY: "true",
    SEPOLIA_DEPLOYMENT_ARTIFACT: sepoliaProof,
    ...deployEnv,
    ...reviewGates,
  },
  (ctx) => expectDeployment(ctx, { network: "mainnet", chainId: SN_MAIN, declares: 3 }));

run("deploy blocked: sepolia without ALLOW_PUBLIC_DEPLOY", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, ...deployEnv },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "Starknet Sepolia deployment blocked."), ...expectNoTransactions(ctx)]);

run("deploy blocked: missing review acknowledgement", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, ALLOW_PUBLIC_DEPLOY: "true", ...deployEnv },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "human review acknowledgement required"), ...expectNoTransactions(ctx)]);

run("deploy blocked: STARKNET_NETWORK mismatch", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, STARKNET_NETWORK: "mainnet", ...deployEnv, ...reviewGates },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "does not match the RPC chain ID"), ...expectNoTransactions(ctx)]);

run("deploy blocked: unsupported chain", "deploy.js",
  { FAKE_RPC_CHAIN_ID: "0x1234", ...deployEnv, ...reviewGates },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "Unsupported chain ID 0x1234"), ...expectNoTransactions(ctx)]);

run("deploy blocked: mainnet without sepolia proof", "deploy.js",
  { FAKE_RPC_CHAIN_ID: SN_MAIN, ALLOW_MAINNET_DEPLOY: "true", ...deployEnv, ...reviewGates },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "Sepolia deployment proof is required"), ...expectNoTransactions(ctx)]);

// ==================== verify_owners.js ====================
const OWNER_A = "0xaaa";
const OWNER_B = "0xbbb";
const SEPOLIA_REPUTATION = num.toHex("0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e");

run("verify sepolia: shared owner", "verify_owners.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, FAKE_RPC_OWNERS: JSON.stringify({ default: OWNER_A }) },
  (ctx) => [
    ...expectExit(ctx, 0),
    ...expectOutput(ctx, "Address source: built-in sepolia defaults"),
    ...expectOutput(ctx, "All three registries share the same owner address."),
  ]);

run("verify sepolia: owner mismatch", "verify_owners.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, FAKE_RPC_OWNERS: JSON.stringify({ default: OWNER_A, [SEPOLIA_REPUTATION]: OWNER_B }) },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "Owner mismatch")]);

run("verify mainnet: expected owner matches", "verify_owners.js",
  { FAKE_RPC_CHAIN_ID: SN_MAIN, FAKE_RPC_OWNERS: JSON.stringify({ default: OWNER_A }), EXPECTED_OWNER_ADDRESS: OWNER_A },
  (ctx) => [
    ...expectExit(ctx, 0),
    ...expectOutput(ctx, "Address source: built-in mainnet defaults"),
    ...expectOutput(ctx, "On-chain owner matches EXPECTED_OWNER_ADDRESS."),
  ]);

run("verify mainnet: expected owner mismatch", "verify_owners.js",
  { FAKE_RPC_CHAIN_ID: SN_MAIN, FAKE_RPC_OWNERS: JSON.stringify({ default: OWNER_A }), EXPECTED_OWNER_ADDRESS: OWNER_B },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "Expected owner mismatch")]);

run("verify: partial address override", "verify_owners.js",
  { FAKE_RPC_CHAIN_ID: SN_SEPOLIA, ERC8004_IDENTITY_REGISTRY_ADDRESS: "0x1" },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "Partial ERC-8004 address override detected")]);

run("verify custom chain: no overrides", "verify_owners.js",
  { FAKE_RPC_CHAIN_ID: "0x1234" },
  (ctx) => [...expectExit(ctx, 1), ...expectOutput(ctx, "No contract addresses resolved")]);

run("verify custom chain: full overrides", "verify_owners.js",
  {
    FAKE_RPC_CHAIN_ID: "0x1234",
    FAKE_RPC_OWNERS: JSON.stringify({ default: OWNER_A }),
    ERC8004_IDENTITY_REGISTRY_ADDRESS: "0x11",
    ERC8004_REPUTATION_REGISTRY_ADDRESS: "0x22",
    ERC8004_VALIDATION_REGISTRY_ADDRESS: "0x33",
  },
  (ctx) => [
    ...expectExit(ctx, 0),
    ...expectOutput(ctx, "Address source: environment overrides"),
    ...expectOutput(ctx, "All three registries share the same owner address."),
  ]);

// ==================== SUMMARY ====================
for (const result of results) {
  const rpc = Object.entries(result.rpcMethods).map(([method, count]) => `${method.replace("starknet_", "")}x${count}`).join(" ");
  console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name.padEnd(54)} exit=${result.exit} ${result.seconds}s  ${rpc}`);
  for (const problem of result.problems) console.log(`        - ${problem}`);
}
const failed = results.filter((result) => !result.ok);
for (const result of failed) {
  console.log(`\n──── output: ${result.name} ────\n${result.output.trim()}`);
}
console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length === 0) fs.rmSync(workDir, { recursive: true, force: true });
else console.log(`Logs kept in ${workDir}`);
process.exit(failed.length > 0 || results.length === 0 ? 1 : 0);
