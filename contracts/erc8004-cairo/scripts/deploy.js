import {
  constants,
  Provider,
  Contract,
  Account,
  json,
  shortString,
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

function resolveNetworkMetadata(chainId) {
  const normalizedChainId = typeof chainId === "bigint" ? `0x${chainId.toString(16)}` : String(chainId);

  const networks = new Map([
    [String(constants.StarknetChainId.SN_MAIN), {
      slug: "mainnet",
      label: "Starknet Mainnet",
      voyagerContractBase: "https://voyager.online/contract/",
    }],
    [String(constants.StarknetChainId.SN_SEPOLIA), {
      slug: "sepolia",
      label: "Starknet Sepolia",
      voyagerContractBase: "https://sepolia.voyager.online/contract/",
    }],
    [String(constants.StarknetChainId.SN_INTEGRATION_SEPOLIA), {
      slug: "integration-sepolia",
      label: "Starknet Integration Sepolia",
      voyagerContractBase: "https://integration-sepolia.voyager.online/contract/",
    }],
  ]);

  return (
    networks.get(normalizedChainId) || {
      slug: "custom",
      label: `Custom network (${normalizedChainId})`,
      voyagerContractBase: null,
    }
  );
}

async function main() {
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

  console.log(`🚀 Deploying ERC-8004 Contracts to ${network.label}\n`);
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("🔗 Chain ID:", chainId);

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
    chainId: String(chainId),
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
  fs.writeFileSync(networkOutputPath, JSON.stringify(deploymentInfo, null, 2));

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
  console.log("");
  if (network.voyagerContractBase) {
    console.log("🔍 View on Voyager:");
    console.log(`   ${network.voyagerContractBase}${identityAddress}`);
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
