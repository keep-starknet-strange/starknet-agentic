/**
 * Deploy Prediction Market Contracts to Sepolia
 *
 * Declares PredictionMarket, AccuracyTracker, MarketFactory classes,
 * deploys factory + tracker, then creates 14 Super Bowl LX + crypto markets.
 *
 * Usage:
 *   npx tsx contracts/prediction-market/scripts/deploy_sepolia.ts
 *
 * Requires .env at repo root or contracts/prediction-market/:
 *   STARKNET_RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY
 */

import {
  RpcProvider,
  Account,
  Contract,
  json,
  hash,
  CallData,
  shortString,
} from "starknet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading .env from multiple locations
function loadEnv() {
  const locations = [
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", "..", ".env"),
    path.join(__dirname, "..", "..", "..", "examples", "prediction-agent", ".env"),
  ];
  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      const content = fs.readFileSync(loc, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
      console.log(`  Loaded env from ${loc}`);
    }
  }
}

// Super Bowl LX markets + crypto markets
const MARKETS = [
  // Super Bowl LX — Feb 8, 2026
  { question: "Seahawks win SB LX", resolutionHours: 8, feeBps: 200 },
  { question: "Total score over 45.5", resolutionHours: 8, feeBps: 200 },
  { question: "100+ rush yards player", resolutionHours: 8, feeBps: 200 },
  { question: "Halftime over 15 min", resolutionHours: 8, feeBps: 150 },
  { question: "MVP is a quarterback", resolutionHours: 10, feeBps: 200 },
  { question: "Defensive/ST touchdown", resolutionHours: 8, feeBps: 200 },
  { question: "Seahawks cover -4.5", resolutionHours: 8, feeBps: 200 },
  { question: "First score touchdown", resolutionHours: 6, feeBps: 200 },
  { question: "Score last 2min 1H", resolutionHours: 5, feeBps: 200 },
  { question: "SB LX overtime", resolutionHours: 8, feeBps: 200 },
  // Crypto markets — longer resolution
  { question: "ETH above 5000 Mar26", resolutionHours: 24 * 30, feeBps: 200 },
  { question: "STRK above 2 Q3 2026", resolutionHours: 24 * 150, feeBps: 200 },
  { question: "Starknet 100 TPS Feb", resolutionHours: 24 * 21, feeBps: 200 },
  { question: "BTC above 90k Feb26", resolutionHours: 24 * 21, feeBps: 200 },
];

// STRK token on Sepolia (same address as mainnet)
const STRK_SEPOLIA =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

async function main() {
  loadEnv();

  console.log("\n========================================================");
  console.log("  DEPLOYING PREDICTION MARKET CONTRACTS TO SEPOLIA");
  console.log("========================================================\n");

  const rpcUrl = process.env.STARKNET_RPC_URL;
  const deployerAddress = process.env.DEPLOYER_ADDRESS;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl) {
    console.error("ERROR: STARKNET_RPC_URL not set");
    process.exit(1);
  }
  if (!deployerAddress) {
    console.error("ERROR: DEPLOYER_ADDRESS not set");
    process.exit(1);
  }
  if (!deployerKey || deployerKey === "0x0" || deployerKey.endsWith("0000000000")) {
    console.error("ERROR: DEPLOYER_PRIVATE_KEY not set (or is placeholder)");
    process.exit(1);
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const chainId = await provider.getChainId();
  console.log(`Chain: ${chainId}`);
  console.log(`RPC:   ${rpcUrl}`);
  console.log(`Deployer: ${deployerAddress}\n`);

  const account = new Account(provider, deployerAddress, deployerKey, "1");

  // ---- Load compiled artifacts ----
  const basePath = path.join(__dirname, "..", "target", "dev");

  function loadArtifact(contractName: string) {
    const sierraPath = path.join(
      basePath,
      `prediction_market_${contractName}.contract_class.json`
    );
    const casmPath = path.join(
      basePath,
      `prediction_market_${contractName}.compiled_contract_class.json`
    );

    if (!fs.existsSync(sierraPath)) {
      console.error(`Missing Sierra artifact: ${sierraPath}`);
      process.exit(1);
    }
    if (!fs.existsSync(casmPath)) {
      console.error(`Missing CASM artifact: ${casmPath}`);
      process.exit(1);
    }

    const sierra = json.parse(fs.readFileSync(sierraPath).toString("ascii"));
    const casm = json.parse(fs.readFileSync(casmPath).toString("ascii"));
    return { sierra, casm };
  }

  async function declareContract(name: string, sierra: any, casm: any): Promise<string> {
    console.log(`[DECLARE] ${name}...`);
    const classHash = hash.computeContractClassHash(sierra);
    console.log(`  Class hash: ${classHash}`);

    // Check if already declared
    try {
      await provider.getClass(classHash);
      console.log(`  Already declared.\n`);
      return classHash;
    } catch {
      // Not declared yet
    }

    // Compute local compiled_class_hash
    const localCompiledHash = hash.computeCompiledClassHash(casm);
    console.log(`  Compiled hash (local): ${localCompiledHash}`);

    // Try declare, handle compiled_class_hash mismatch from different compiler versions
    try {
      const resp = await account.declare({ contract: sierra, casm });
      console.log(`  Tx: ${resp.transaction_hash}`);
      await provider.waitForTransaction(resp.transaction_hash);
      console.log(`  Declared!\n`);
      return resp.class_hash;
    } catch (err: any) {
      if (
        err.message?.includes("already declared") ||
        err.message?.includes("CLASS_ALREADY_DECLARED")
      ) {
        console.log(`  Already declared (caught from tx).\n`);
        return classHash;
      }

      // Extract expected compiled_class_hash from mismatch error
      const mismatchMatch = err.message?.match(/Expected:\s*(0x[0-9a-fA-F]+)/);
      if (mismatchMatch) {
        const expectedHash = mismatchMatch[1];
        console.log(`  Compiled hash mismatch, retrying with network-expected: ${expectedHash}`);

        // Retry with the correct compiledClassHash
        const resp = await account.declare({
          contract: sierra,
          casm,
          compiledClassHash: expectedHash,
        });
        console.log(`  Tx: ${resp.transaction_hash}`);
        await provider.waitForTransaction(resp.transaction_hash);
        console.log(`  Declared!\n`);
        return resp.class_hash;
      }

      throw err;
    }
  }

  // ---- Declare all contracts ----
  const market = loadArtifact("PredictionMarket");
  const tracker = loadArtifact("AccuracyTracker");
  const factory = loadArtifact("MarketFactory");

  const marketClassHash = await declareContract("PredictionMarket", market.sierra, market.casm);
  const trackerClassHash = await declareContract("AccuracyTracker", tracker.sierra, tracker.casm);
  const factoryClassHash = await declareContract("MarketFactory", factory.sierra, factory.casm);

  // ---- Deploy MarketFactory ----
  console.log("[DEPLOY] MarketFactory...");
  const factoryDeploy = await account.deployContract({
    classHash: factoryClassHash,
    constructorCalldata: CallData.compile({
      owner: deployerAddress,
      market_class_hash: marketClassHash,
    }),
  });
  console.log(`  Tx: ${factoryDeploy.transaction_hash}`);
  await provider.waitForTransaction(factoryDeploy.transaction_hash);
  const factoryAddress = (factoryDeploy as any).contract_address ?? (factoryDeploy as any).address;
  console.log(`  Factory deployed: ${factoryAddress}\n`);

  // ---- Deploy AccuracyTracker ----
  console.log("[DEPLOY] AccuracyTracker...");
  const trackerDeploy = await account.deployContract({
    classHash: trackerClassHash,
    constructorCalldata: CallData.compile({
      owner: deployerAddress,
    }),
  });
  console.log(`  Tx: ${trackerDeploy.transaction_hash}`);
  await provider.waitForTransaction(trackerDeploy.transaction_hash);
  const trackerAddress = (trackerDeploy as any).contract_address ?? (trackerDeploy as any).address;
  console.log(`  Tracker deployed: ${trackerAddress}\n`);

  // ---- Create 14 markets via factory ----
  console.log("========================================================");
  console.log("  CREATING 14 PREDICTION MARKETS");
  console.log("========================================================\n");

  const FACTORY_ABI = [
    {
      name: "create_market",
      type: "function",
      inputs: [
        { name: "question_hash", type: "core::felt252" },
        { name: "resolution_time", type: "core::integer::u64" },
        { name: "oracle", type: "core::starknet::contract_address::ContractAddress" },
        { name: "collateral_token", type: "core::starknet::contract_address::ContractAddress" },
        { name: "fee_bps", type: "core::integer::u16" },
      ],
      outputs: [
        { type: "core::starknet::contract_address::ContractAddress" },
        { type: "core::integer::u256" },
      ],
      state_mutability: "external",
    },
  ] as const;

  const factoryContract = new Contract(FACTORY_ABI as any, factoryAddress, account);

  const now = Math.floor(Date.now() / 1000);
  const marketAddresses: string[] = [];

  for (let i = 0; i < MARKETS.length; i++) {
    const m = MARKETS[i];
    const questionHash = shortString.encodeShortString(m.question.slice(0, 31));
    const resolutionTime = now + m.resolutionHours * 3600;

    console.log(`[${i}] "${m.question}"`);
    console.log(`    Resolution: ${new Date(resolutionTime * 1000).toISOString()}`);
    console.log(`    Fee: ${m.feeBps} bps`);

    try {
      const result = await factoryContract.invoke("create_market", [
        questionHash,
        resolutionTime,
        deployerAddress, // oracle = deployer (we resolve manually)
        STRK_SEPOLIA,
        m.feeBps,
      ]);

      console.log(`    Tx: ${result.transaction_hash}`);
      await provider.waitForTransaction(result.transaction_hash);

      // Read market address from factory
      const FACTORY_READ_ABI = [
        {
          name: "get_market",
          type: "function",
          inputs: [{ name: "id", type: "core::integer::u256" }],
          outputs: [{ type: "core::starknet::contract_address::ContractAddress" }],
          state_mutability: "view",
        },
      ] as const;
      const factoryRead = new Contract(FACTORY_READ_ABI as any, factoryAddress, provider);
      const addr = await factoryRead.get_market(i);
      const marketAddr = addr.toString();
      marketAddresses.push(marketAddr);
      console.log(`    Market address: ${marketAddr}\n`);
    } catch (err: any) {
      console.error(`    ERROR creating market ${i}: ${err.message}\n`);
      marketAddresses.push("FAILED");
    }
  }

  // ---- Save deployed addresses ----
  const deployment = {
    network: "sepolia",
    deployedAt: new Date().toISOString(),
    chainId: chainId.toString(),
    deployer: deployerAddress,
    contracts: {
      marketClassHash,
      trackerClassHash,
      factoryClassHash,
      factoryAddress,
      trackerAddress,
    },
    markets: MARKETS.map((m, i) => ({
      id: i,
      question: m.question,
      address: marketAddresses[i],
      feeBps: m.feeBps,
    })),
  };

  const outputPath = path.join(__dirname, "..", "deployed_addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log(`\nSaved deployment info to ${outputPath}`);

  // ---- Print summary ----
  console.log("\n========================================================");
  console.log("  DEPLOYMENT COMPLETE");
  console.log("========================================================\n");
  console.log(`Factory:  ${factoryAddress}`);
  console.log(`Tracker:  ${trackerAddress}`);
  console.log(`Markets:  ${marketAddresses.filter((a) => a !== "FAILED").length} / ${MARKETS.length} created`);
  console.log("");
  console.log("Add to your prediction-agent .env:");
  console.log(`  MARKET_FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`  ACCURACY_TRACKER_ADDRESS=${trackerAddress}`);
  console.log(`  AGENT_PRIVATE_KEY=${deployerKey}`);
  console.log(`  AGENT_ADDRESS=${deployerAddress}`);
  console.log("");
  console.log("View on Voyager:");
  console.log(`  https://sepolia.voyager.online/contract/${factoryAddress}`);
  console.log(`  https://sepolia.voyager.online/contract/${trackerAddress}`);
  console.log("");

  for (let i = 0; i < marketAddresses.length; i++) {
    if (marketAddresses[i] !== "FAILED") {
      console.log(`  Market ${i}: https://sepolia.voyager.online/contract/${marketAddresses[i]}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nDEPLOYMENT FAILED:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
