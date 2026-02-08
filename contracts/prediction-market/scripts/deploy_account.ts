/**
 * Deploy an OpenZeppelin account on Starknet Sepolia using V3 transactions (STRK gas).
 */

import { Account, RpcProvider, ec, CallData, hash, constants } from "starknet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    if (!process.env[trimmed.slice(0, eq).trim()])
      process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

async function main() {
  const rpcUrl = process.env.STARKNET_RPC_URL!;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  const pubKey = ec.starkCurve.getStarkKey(privateKey);
  console.log("Public key:", pubKey);

  // OZ Account class hash (v0.14, declared on Sepolia)
  const OZ_CLASS_HASH =
    "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f";

  const constructorCalldata = CallData.compile({ public_key: pubKey });
  const address = hash.calculateContractAddressFromHash(
    pubKey,
    OZ_CLASS_HASH,
    constructorCalldata,
    0
  );
  console.log("Account address:", address);

  // Check if already deployed
  try {
    const ch = await provider.getClassHashAt(address);
    console.log("Already deployed! Class hash:", ch);
    return;
  } catch {
    console.log("Not deployed yet...");
  }

  // Use Account with cairoVersion "1" for proper V3 support
  const account = new Account(provider, address, privateKey, "1");

  const deployPayload = {
    classHash: OZ_CLASS_HASH,
    constructorCalldata,
    addressSalt: pubKey,
  };

  // Force V3 by providing resource bounds
  console.log("Deploying account (V3 / STRK gas)...");
  const { suggestedMaxFee } = await account.estimateAccountDeployFee(deployPayload);
  console.log("Estimated fee:", suggestedMaxFee.toString());

  const { transaction_hash, contract_address } = await account.deployAccount(
    deployPayload,
    {
      maxFee: suggestedMaxFee * 2n, // 2x buffer
    }
  );

  console.log("Tx:", transaction_hash);
  console.log("Waiting for confirmation...");
  await provider.waitForTransaction(transaction_hash);
  console.log("Account deployed at:", contract_address);
  console.log(
    "Voyager:",
    `https://sepolia.voyager.online/contract/${contract_address}`
  );
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  if (err.baseError) console.error("Base:", JSON.stringify(err.baseError, null, 2));
  process.exit(1);
});
