import { constants, RpcProvider } from "starknet";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const KNOWN_DEPLOYMENTS = {
  mainnet: {
    identity: "0x33653298d42aca87f9c004c834c6830a08e8f1c0bd694faaa1412ec8fe77595",
    reputation: "0x698849defe3997eccd3dc5e096c01ae8f4fbc2e49e8d67efcb0b0642447944",
    validation: "0x3c2aae404b64ddf09f7ef07dfb4f723c9053443d35038263acf7d5d77efcd83",
  },
  sepolia: {
    identity: "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631",
    reputation: "0x5a68b5e121a014b9fc39455d4d3e0eb79fe2327329eb734ab637cee4c55c78e",
    validation: "0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f",
  },
};

function normalizeAddress(address) {
  if (address === undefined || address === null) {
    return "";
  }
  let hex = String(address).trim().toLowerCase();
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }
  hex = hex.replace(/^0+/, "");
  return `0x${hex || "0"}`;
}

function resolveNetwork(chainId) {
  const normalizedChainId = String(chainId);
  if (normalizedChainId === String(constants.StarknetChainId.SN_MAIN)) {
    return "mainnet";
  }
  if (
    normalizedChainId === String(constants.StarknetChainId.SN_SEPOLIA) ||
    normalizedChainId === String(constants.StarknetChainId.SN_INTEGRATION_SEPOLIA)
  ) {
    return "sepolia";
  }
  return "custom";
}

function resolveContractAddresses(network) {
  const overrideAddresses = {
    identity: process.env.ERC8004_IDENTITY_REGISTRY_ADDRESS,
    reputation: process.env.ERC8004_REPUTATION_REGISTRY_ADDRESS,
    validation: process.env.ERC8004_VALIDATION_REGISTRY_ADDRESS,
  };

  if (overrideAddresses.identity && overrideAddresses.reputation && overrideAddresses.validation) {
    return {
      addresses: {
        identity: normalizeAddress(overrideAddresses.identity),
        reputation: normalizeAddress(overrideAddresses.reputation),
        validation: normalizeAddress(overrideAddresses.validation),
      },
      source: "environment overrides",
    };
  }

  if (KNOWN_DEPLOYMENTS[network]) {
    return {
      addresses: KNOWN_DEPLOYMENTS[network],
      source: `built-in ${network} defaults`,
    };
  }

  throw new Error(
    "No contract addresses resolved for this network. Set ERC8004_IDENTITY_REGISTRY_ADDRESS, ERC8004_REPUTATION_REGISTRY_ADDRESS, and ERC8004_VALIDATION_REGISTRY_ADDRESS."
  );
}

async function readOwner(provider, contractAddress) {
  const result = await provider.callContract({
    contractAddress,
    entrypoint: "owner",
    calldata: [],
  });
  return normalizeAddress(result[0]);
}

async function main() {
  const rpcUrl = process.env.STARKNET_RPC_URL;
  if (!rpcUrl) {
    throw new Error("STARKNET_RPC_URL is required.");
  }

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const chainId = await provider.getChainId();
  const network = resolveNetwork(chainId);
  const { addresses, source } = resolveContractAddresses(network);
  const expectedOwner = process.env.EXPECTED_OWNER_ADDRESS
    ? normalizeAddress(process.env.EXPECTED_OWNER_ADDRESS)
    : null;

  console.log("🔎 Verifying ERC-8004 registry owners");
  console.log(`   Network: ${network}`);
  console.log(`   Chain ID: ${chainId}`);
  console.log(`   Address source: ${source}`);
  if (expectedOwner) {
    console.log(`   Expected owner: ${expectedOwner}`);
  }
  console.log("");

  const ownerRows = [];
  for (const [name, address] of Object.entries(addresses)) {
    const owner = await readOwner(provider, address);
    ownerRows.push({ name, address: normalizeAddress(address), owner });
  }

  for (const row of ownerRows) {
    console.log(`${row.name.padEnd(10)} ${row.address} -> owner: ${row.owner}`);
  }
  console.log("");

  const distinctOwners = [...new Set(ownerRows.map((row) => row.owner))];
  let hasError = false;

  if (distinctOwners.length !== 1) {
    hasError = true;
    console.error("❌ Owner mismatch: registry contracts do not share the same owner address.");
  } else {
    console.log("✅ All three registries share the same owner address.");
  }

  if (expectedOwner && distinctOwners[0] !== expectedOwner) {
    hasError = true;
    console.error(`❌ Expected owner mismatch: on-chain owner ${distinctOwners[0]} != ${expectedOwner}`);
  } else if (expectedOwner) {
    console.log("✅ On-chain owner matches EXPECTED_OWNER_ADDRESS.");
  }

  if (hasError) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`❌ Verification failed: ${error.message}`);
  process.exit(1);
});
