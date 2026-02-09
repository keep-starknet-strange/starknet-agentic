import {
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

// Load environment variables from .env file in scripts directory
dotenv.config({ path: path.join(__dirname, ".env") });

async function main() {
  console.log("Deploying AgentAccountFactory to Sepolia\n");
  console.log("===================================================================\n");

  // ==================== ENV VALIDATION ====================
  const rpcUrl = process.env.STARKNET_RPC_URL;
  const accountAddress = process.env.DEPLOYER_ADDRESS;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const identityRegistryAddress = process.env.IDENTITY_REGISTRY_ADDRESS;

  if (!rpcUrl) {
    console.error("Error: STARKNET_RPC_URL not set in .env file");
    console.error("  Copy .env.example to .env and configure your settings");
    process.exit(1);
  }
  if (!accountAddress) {
    console.error("Error: DEPLOYER_ADDRESS not set in .env file");
    process.exit(1);
  }
  if (
    !privateKey ||
    privateKey ===
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    console.error("Error: DEPLOYER_PRIVATE_KEY not set in .env file");
    console.error("  Please set your actual private key (never commit this!)");
    process.exit(1);
  }
  if (!identityRegistryAddress) {
    console.error("Error: IDENTITY_REGISTRY_ADDRESS not set in .env file");
    console.error(
      "  Deploy ERC-8004 contracts first, then set the IdentityRegistry address"
    );
    process.exit(1);
  }

  // ==================== PROVIDER + ACCOUNT ====================
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  // Hard-assert chain is SN_SEPOLIA
  const chainId = await provider.getChainId();
  console.log("Chain ID:", chainId);

  if (chainId !== "SN_SEPOLIA" && chainId !== "0x534e5f5345504f4c4941") {
    console.error(
      `Error: Expected SN_SEPOLIA chain, got ${chainId}`
    );
    console.error("  This deploy script is Sepolia-only for v1.");
    process.exit(1);
  }

  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey,
    cairoVersion: "1",
  });
  console.log("Account:", accountAddress);
  console.log("Identity Registry:", identityRegistryAddress);
  console.log("Account connected.\n");

  // ==================== HELPERS ====================
  function loadContract(contractName) {
    const basePath = path.join(__dirname, "..", "target", "dev");

    const sierraPath = path.join(
      basePath,
      `agent_account_${contractName}.contract_class.json`
    );
    const casmPath = path.join(
      basePath,
      `agent_account_${contractName}.compiled_contract_class.json`
    );

    if (!fs.existsSync(sierraPath)) {
      console.error(`Error: Sierra file not found: ${sierraPath}`);
      console.error('  Run "scarb build" in contracts/agent-account/ first.');
      process.exit(1);
    }
    if (!fs.existsSync(casmPath)) {
      console.error(`Error: CASM file not found: ${casmPath}`);
      console.error('  Run "scarb build" in contracts/agent-account/ first.');
      process.exit(1);
    }

    const compiledSierra = json.parse(
      fs.readFileSync(sierraPath).toString("ascii")
    );
    const compiledCasm = json.parse(
      fs.readFileSync(casmPath).toString("ascii")
    );

    return { compiledSierra, compiledCasm };
  }

  // Idempotent declare: reuses class hash if already declared
  async function declareContract(contractName) {
    console.log(`Declaring ${contractName}...`);

    const { compiledSierra, compiledCasm } = loadContract(contractName);

    const classHash = hash.computeContractClassHash(compiledSierra);
    console.log(`  Computed Class Hash: ${classHash}`);

    // Check if already declared (idempotent)
    try {
      await provider.getClass(classHash);
      console.log(`  Already declared, reusing class hash.\n`);
      return classHash;
    } catch {
      // Not declared, proceed with declaration
    }

    try {
      const declareResponse = await account.declare({
        contract: compiledSierra,
        casm: compiledCasm,
      });

      console.log(
        `  Waiting for declaration tx: ${declareResponse.transaction_hash.slice(0, 20)}...`
      );
      await provider.waitForTransaction(declareResponse.transaction_hash);
      console.log(`  Declared! Class Hash: ${declareResponse.class_hash}\n`);

      return declareResponse.class_hash;
    } catch (error) {
      if (
        error.message?.includes("already declared") ||
        error.message?.includes("CLASS_ALREADY_DECLARED")
      ) {
        console.log(`  Already declared (caught from node), reusing.\n`);
        return classHash;
      }
      throw error;
    }
  }

  async function deployContract(classHash, constructorCalldata, contractName) {
    console.log(`Deploying ${contractName}...`);
    console.log(`  Class Hash: ${classHash}`);

    const { transaction_hash, address } = await account.deployContract({
      classHash,
      constructorCalldata,
    });

    console.log(
      `  Waiting for deploy tx: ${transaction_hash.slice(0, 20)}...`
    );
    await provider.waitForTransaction(transaction_hash);
    console.log(`  Deployed! Address: ${address}\n`);

    return { address, transaction_hash };
  }

  // ==================== DECLARE AGENT ACCOUNT CLASS ====================
  console.log("==============================================================");
  console.log("                    AGENT ACCOUNT CLASS");
  console.log("==============================================================\n");

  const agentAccountClassHash = await declareContract("AgentAccount");

  // ==================== DECLARE + DEPLOY FACTORY ====================
  console.log("==============================================================");
  console.log("                 AGENT ACCOUNT FACTORY");
  console.log("==============================================================\n");

  const factoryClassHash = await declareContract("AgentAccountFactory");

  // Constructor: (account_class_hash: ClassHash, identity_registry: ContractAddress)
  const { address: factoryAddress, transaction_hash: factoryDeployTxHash } =
    await deployContract(
      factoryClassHash,
      [agentAccountClassHash, identityRegistryAddress],
      "AgentAccountFactory"
    );

  // ==================== SAVE DEPLOYMENT INFO ====================
  const deploymentInfo = {
    version: "1",
    network: "sepolia",
    chainId: String(chainId),
    rpcUrl,
    deployerAddress: accountAddress,
    identityRegistryAddress,
    contracts: {
      agentAccount: {
        classHash: agentAccountClassHash,
      },
      agentAccountFactory: {
        classHash: factoryClassHash,
        address: factoryAddress,
        deployTxHash: factoryDeployTxHash,
      },
    },
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(__dirname, "..", "deployed_addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(deploymentInfo, null, 2));

  const sepoliaOutputPath = path.join(
    __dirname,
    "..",
    "deployed_addresses_sepolia.json"
  );
  fs.writeFileSync(sepoliaOutputPath, JSON.stringify(deploymentInfo, null, 2));

  // ==================== SUMMARY ====================
  console.log("==============================================================");
  console.log("             DEPLOYMENT SUCCESSFUL");
  console.log("==============================================================\n");

  console.log("Contract Info:");
  console.log(`  AgentAccount class hash:        ${agentAccountClassHash}`);
  console.log(`  AgentAccountFactory class hash:  ${factoryClassHash}`);
  console.log(`  AgentAccountFactory address:     ${factoryAddress}`);
  console.log(`  IdentityRegistry (input):        ${identityRegistryAddress}`);
  console.log("");
  console.log("Deployment info saved to:");
  console.log("  - deployed_addresses.json");
  console.log("  - deployed_addresses_sepolia.json");
  console.log("");
  console.log("View on Voyager:");
  console.log(
    `  https://sepolia.voyager.online/contract/${factoryAddress}`
  );
  console.log("");
  console.log("Next step: use the factory address in examples/onboard-agent/");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nDEPLOYMENT FAILED\n");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  });
