import {
  constants,
  Account,
  json,
  RpcProvider,
  hash,
} from "starknet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function normalizeChainId(chainId) {
  if (typeof chainId === "bigint") {
    return `0x${chainId.toString(16)}`.toLowerCase();
  }
  return String(chainId).toLowerCase();
}

const KNOWN_NETWORKS = new Map([
  [normalizeChainId(constants.StarknetChainId.SN_MAIN), {
    slug: "mainnet",
    label: "Starknet Mainnet",
    voyagerContractBase: "https://voyager.online/contract/",
    isPublicTestnet: false,
  }],
  [normalizeChainId(constants.StarknetChainId.SN_SEPOLIA), {
    slug: "sepolia",
    label: "Starknet Sepolia",
    voyagerContractBase: "https://sepolia.voyager.online/contract/",
    isPublicTestnet: true,
  }],
]);

function resolveNetworkMetadata(chainId) {
  const normalizedChainId = normalizeChainId(chainId);
  const known = KNOWN_NETWORKS.get(normalizedChainId);
  if (known) {
    return known;
  }

  console.warn(
    `⚠️  Unknown chain ID ${normalizedChainId} — using slug "custom-${normalizedChainId}"`,
  );
  return {
    slug: `custom-${normalizedChainId}`,
    label: `Custom network (${normalizedChainId})`,
    voyagerContractBase: null,
    isPublicTestnet: false,
  };
}

function assertChainIdNormalizationMappings() {
  const expectedMappings = [
    { chainId: constants.StarknetChainId.SN_MAIN, slug: "mainnet" },
    { chainId: constants.StarknetChainId.SN_SEPOLIA, slug: "sepolia" },
  ];

  for (const entry of expectedMappings) {
    const resolved = resolveNetworkMetadata(entry.chainId);
    if (resolved.slug !== entry.slug) {
      throw new Error(
        `Chain ID normalization mismatch for ${entry.slug}: got ${resolved.slug}`,
      );
    }
  }
}

function enforceHumanReviewAcknowledgement(network) {
  const requiresReview = network.slug === "mainnet" || network.isPublicTestnet;
  if (!requiresReview) {
    return;
  }

  const reviewAcknowledged = process.env.REVIEW_ACKNOWLEDGED === "true";
  const reviewerIdentity = (process.env.REVIEWER_IDENTITY ?? "").trim();
  if (!reviewAcknowledged || reviewerIdentity.length === 0) {
    console.error(`❌ ${network.label} deployment blocked: human review acknowledgement required.`);
    console.error(
      "   Set REVIEW_ACKNOWLEDGED=true and REVIEWER_IDENTITY=<name|handle|ticket> in .env.",
    );
    process.exit(1);
  }

  const reviewedAt = new Date().toISOString();
  console.log(`🧾 Human review acknowledged by ${reviewerIdentity} at ${reviewedAt}`);
}

function enforceDeploymentSafetyGate(network) {
  if (network.slug === "mainnet") {
    const allowMainnet = process.env.ALLOW_MAINNET_DEPLOY === "true";
    if (!allowMainnet) {
      console.error("❌ Mainnet deployment blocked.");
      console.error("   Set ALLOW_MAINNET_DEPLOY=true in .env to proceed intentionally.");
      process.exit(1);
    }
    enforceHumanReviewAcknowledgement(network);
    console.warn("⚠️  MAINNET DEPLOYMENT ENABLED (ALLOW_MAINNET_DEPLOY=true)");
    console.warn("   Verify multisig owner, class hashes, and Sepolia dry run before continuing.\n");
    return;
  }

  if (network.isPublicTestnet) {
    const allowPublic = process.env.ALLOW_PUBLIC_DEPLOY === "true";
    if (!allowPublic) {
      console.error(`❌ ${network.label} deployment blocked.`);
      console.error("   Set ALLOW_PUBLIC_DEPLOY=true in .env to proceed intentionally.");
      process.exit(1);
    }
    enforceHumanReviewAcknowledgement(network);
    console.warn(`⚠️  ${network.label} DEPLOYMENT ENABLED (ALLOW_PUBLIC_DEPLOY=true)`);
    console.warn("   Verify class hashes, owner account, and post-deploy smoke tests.\n");
  }
}

async function main() {
  assertChainIdNormalizationMappings();

  // Get configuration from environment variables
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const accountAddress = process.env.DEPLOYER_ADDRESS;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  // Validate required environment variables
  if (!rpcUrl) {
    console.error("❌ Error: STARKNET_RPC_URL not set in .env file");
    console.error("   Copy .env.example to .env and configure your settings");
    process.exit(1);
  }
  if (!accountAddress) {
    console.error("❌ Error: DEPLOYER_ADDRESS not set in .env file");
    process.exit(1);
  }
  if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    console.error("❌ Error: DEPLOYER_PRIVATE_KEY not set in .env file");
    console.error("   Please set your actual private key (never commit this!)");
    process.exit(1);
  }

  // Initialize RPC provider
  const provider = new RpcProvider({
    nodeUrl: rpcUrl,
  });

  // Check that communication with provider is OK
  const chainId = await provider.getChainId();
  const network = resolveNetworkMetadata(chainId);
  const chainIdHex = normalizeChainId(chainId);

  enforceDeploymentSafetyGate(network);

  console.log(`🚀 Deploying ERC-8004 Contracts to ${network.label}\n`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("🔗 Chain ID:", chainIdHex);

  // starknet.js v9 Account constructor uses options object
  const account = new Account({
    provider: provider,
    address: accountAddress,
    signer: privateKey,
    cairoVersion: "1",
  });
  console.log("👤 Account:", accountAddress);
  console.log("✅ Account connected.\n");

  // Helper function to load contract files
  function loadContract(contractName) {
    const basePath = path.join(__dirname, "..", "target", "dev");
    
    const sierraPath = path.join(basePath, `erc8004_${contractName}.contract_class.json`);
    const casmPath = path.join(basePath, `erc8004_${contractName}.compiled_contract_class.json`);
    
    const compiledSierra = json.parse(fs.readFileSync(sierraPath).toString("ascii"));
    const compiledCasm = json.parse(fs.readFileSync(casmPath).toString("ascii"));
    
    return { compiledSierra, compiledCasm };
  }

  // Helper function to declare contract
  async function declareContract(contractName) {
    console.log(`📝 Declaring ${contractName}...`);
    
    const { compiledSierra, compiledCasm } = loadContract(contractName);
    
    // Compute class hash
    const classHash = hash.computeContractClassHash(compiledSierra);
    console.log(`   Computed Class Hash: ${classHash}`);
    
    // Check if already declared
    try {
      await provider.getClass(classHash);
      console.log(`   ⚠️  Contract already declared\n`);
      return classHash;
    } catch (e) {
      // Not declared, proceed
    }
    
    try {
      const declareResponse = await account.declare({
        contract: compiledSierra,
        casm: compiledCasm,
      });
      
      console.log(`   ⏳ Waiting for declaration tx: ${declareResponse.transaction_hash.slice(0, 20)}...`);
      await provider.waitForTransaction(declareResponse.transaction_hash);
      console.log(`   ✅ Declared! Class Hash: ${declareResponse.class_hash}\n`);
      
      return declareResponse.class_hash;
    } catch (error) {
      if (error.message?.includes("already declared") || error.message?.includes("CLASS_ALREADY_DECLARED")) {
        console.log(`   ⚠️  Contract already declared\n`);
        return classHash;
      }
      throw error;
    }
  }

  // Helper function to deploy contract
  async function deployContract(classHash, constructorCalldata, contractName) {
    console.log(`🏗️  Deploying ${contractName}...`);
    console.log(`   Class Hash: ${classHash}`);
    
    const { transaction_hash, address } = await account.deployContract({
      classHash: classHash,
      constructorCalldata: constructorCalldata,
    });
    
    console.log(`   ⏳ Waiting for deploy tx: ${transaction_hash.slice(0, 20)}...`);
    await provider.waitForTransaction(transaction_hash);
    console.log(`   ✅ Deployed! Address: ${address}\n`);
    
    return address;
  }

  // ==================== IDENTITY REGISTRY ====================
  console.log("══════════════════════════════════════════════════════════");
  console.log("                   IDENTITY REGISTRY");
  console.log("══════════════════════════════════════════════════════════\n");

  const identityClassHash = await declareContract("IdentityRegistry");
  const identityAddress = await deployContract(
    identityClassHash,
    [accountAddress], // owner
    "IdentityRegistry"
  );

  // ==================== REPUTATION REGISTRY ====================
  console.log("══════════════════════════════════════════════════════════");
  console.log("                  REPUTATION REGISTRY");
  console.log("══════════════════════════════════════════════════════════\n");

  const reputationClassHash = await declareContract("ReputationRegistry");
  const reputationAddress = await deployContract(
    reputationClassHash,
    [accountAddress, identityAddress], // owner, identity_registry
    "ReputationRegistry"
  );

  // ==================== VALIDATION REGISTRY ====================
  console.log("══════════════════════════════════════════════════════════");
  console.log("                  VALIDATION REGISTRY");
  console.log("══════════════════════════════════════════════════════════\n");

  const validationClassHash = await declareContract("ValidationRegistry");
  const validationAddress = await deployContract(
    validationClassHash,
    [accountAddress, identityAddress], // owner, identity_registry
    "ValidationRegistry"
  );

  // ==================== SAVE DEPLOYMENT INFO ====================
  const deploymentInfo = {
    network: network.slug,
    chainId: chainIdHex,
    rpcUrl: rpcUrl,
    accountAddress: accountAddress,
    ownerAddress: accountAddress,
    contracts: {
      identityRegistry: {
        classHash: identityClassHash,
        address: identityAddress,
      },
      reputationRegistry: {
        classHash: reputationClassHash,
        address: reputationAddress,
      },
      validationRegistry: {
        classHash: validationClassHash,
        address: validationAddress,
      },
    },
    deployedAt: new Date().toISOString(),
  };

  // Save to project root
  const outputPath = path.join(__dirname, "..", "deployed_addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  const networkOutputPath = path.join(__dirname, "..", `deployed_addresses_${network.slug}.json`);
  if (fs.existsSync(networkOutputPath)) {
    console.warn(`⚠️  Overwriting existing ${path.basename(networkOutputPath)} (latest deployment pointer).`);
  }
  fs.writeFileSync(networkOutputPath, JSON.stringify(deploymentInfo, null, 2));
  const timestampSuffix = deploymentInfo.deployedAt.replace(/[:.]/g, "-");
  const immutableOutputPath = path.join(
    __dirname,
    "..",
    `deployed_addresses_${network.slug}_${timestampSuffix}.json`,
  );
  fs.writeFileSync(immutableOutputPath, JSON.stringify(deploymentInfo, null, 2));

  // ==================== SUMMARY ====================
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║              DEPLOYMENT SUCCESSFUL! 🎉                         ║");
  console.log("╚════════════════════════════════════════════════════════════════╝\n");

  console.log("📋 Contract Addresses:");
  console.log(`   IdentityRegistry:   ${identityAddress}`);
  console.log(`   ReputationRegistry: ${reputationAddress}`);
  console.log(`   ValidationRegistry: ${validationAddress}`);
  console.log("");
  console.log("📄 Deployment info saved to:");
  console.log("   - deployed_addresses.json");
  console.log(`   - deployed_addresses_${network.slug}.json`);
  console.log(`   - deployed_addresses_${network.slug}_${timestampSuffix}.json`);
  console.log("");
  if (network.voyagerContractBase) {
    console.log("🔍 View on Voyager:");
    console.log(`   ${network.voyagerContractBase}${identityAddress}`);
    console.log(`   ${network.voyagerContractBase}${reputationAddress}`);
    console.log(`   ${network.voyagerContractBase}${validationAddress}`);
    console.log("");
  }
  console.log("🧪 To run E2E tests:");
  console.log("   cd e2e-tests && npm install && npm test");
  console.log("");
  console.log("✅ Deployment completed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ DEPLOYMENT FAILED\n");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  });
