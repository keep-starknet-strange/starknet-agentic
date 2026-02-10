#!/usr/bin/env npx tsx
/**
 * E2E Agent Onboarding Flow
 *
 * Canonical path to onboard an agent to Starknet:
 *   1. Preflight — validate env, RPC, chain, deployer balance
 *   2. Deploy   — generate keypair, call factory.deploy_account()
 *   3. Verify   — read new account balances, optional self-transfer
 *   4. Receipt  — emit onboarding_receipt.json
 *
 * Usage:
 *   npx tsx run.ts [--network sepolia] [--token-uri "ipfs://..."] [--verify-tx] [--gasfree]
 *
 * Requires:
 *   - .env file with STARKNET_RPC_URL, DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY
 *   - Factory + IdentityRegistry deployed (addresses in config.ts)
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { preflight } from "./steps/preflight.js";
import { deployAccount } from "./steps/deploy-account.js";
import { firstAction } from "./steps/first-action.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

// --- Parse CLI args ---
function parseArgs(): {
  network: string;
  tokenUri: string;
  verifyTx: boolean;
  gasfree: boolean;
  salt?: string;
} {
  const args = process.argv.slice(2);
  let network = "sepolia";
  let tokenUri = "";
  let verifyTx = false;
  let gasfree = false;
  let salt: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--network":
        network = args[++i];
        break;
      case "--token-uri":
        tokenUri = args[++i];
        break;
      case "--verify-tx":
        verifyTx = true;
        break;
      case "--gasfree":
        gasfree = true;
        break;
      case "--salt":
        salt = args[++i];
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!tokenUri) {
    // Default token URI for demo purposes
    tokenUri = "https://example.com/agent-metadata.json";
    console.log(
      `No --token-uri provided, using default: ${tokenUri}\n`
    );
  }

  return { network, tokenUri, verifyTx, gasfree, salt };
}

async function main() {
  const { network, tokenUri, verifyTx, gasfree, salt } = parseArgs();

  console.log("=== Starknet Agent Onboarding ===\n");
  console.log(`Network: ${network}`);
  console.log(`Token URI: ${tokenUri}`);
  console.log(`Verify TX: ${verifyTx}`);
  console.log(`Gasfree: ${gasfree}`);
  console.log("");

  // ==================== STEP 1: PREFLIGHT ====================
  console.log("[1/3] Preflight checks...");

  const rpcUrl = process.env.STARKNET_RPC_URL;
  const accountAddress = process.env.DEPLOYER_ADDRESS;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!accountAddress) {
    console.error("Error: DEPLOYER_ADDRESS not set in .env");
    process.exit(1);
  }
  if (!privateKey) {
    console.error("Error: DEPLOYER_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const pre = await preflight({
    network,
    rpcUrl,
    accountAddress,
    privateKey,
    paymasterUrl: process.env.AVNU_PAYMASTER_URL,
    paymasterApiKey: process.env.AVNU_PAYMASTER_API_KEY,
  });

  console.log("  Preflight passed.\n");

  // ==================== STEP 2: DEPLOY ACCOUNT ====================
  console.log("[2/3] Deploying agent account via factory...");

  const deploy = await deployAccount({
    provider: pre.provider,
    deployerAccount: pre.account,
    networkConfig: pre.networkConfig,
    network,
    tokenUri,
    gasfree,
    paymasterUrl: process.env.AVNU_PAYMASTER_URL,
    paymasterApiKey: process.env.AVNU_PAYMASTER_API_KEY,
    salt,
  });

  console.log("");

  // ==================== STEP 3: FIRST ACTION ====================
  console.log("[3/3] Verifying new account...");

  const action = await firstAction({
    provider: pre.provider,
    accountAddress: deploy.accountAddress,
    privateKey: deploy.privateKey,
    network,
    verifyTx,
  });

  console.log("");

  // ==================== EMIT RECEIPT ====================
  const receipt = {
    version: "1",
    chain_id: pre.chainId,
    network,
    account_address: deploy.accountAddress,
    agent_id: deploy.agentId,
    public_key: deploy.publicKey,
    identity_registry: pre.networkConfig.registry,
    factory_address: pre.networkConfig.factory,
    deploy_tx_hash: deploy.deployTxHash,
    first_action_tx_hash: action.verifyTxHash,
    balances: action.balances,
    token_uri: tokenUri,
    timestamp: new Date().toISOString(),
  };

  const receiptPath = path.join(__dirname, "onboarding_receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  console.log("=== Onboarding Complete ===\n");
  console.log("Receipt saved to: onboarding_receipt.json\n");
  console.log("IMPORTANT: Save these credentials securely!");
  console.log(`  Account address: ${deploy.accountAddress}`);
  console.log(`  Public key:      ${deploy.publicKey}`);
  console.log(`  Private key:     ${deploy.privateKey}`);
  console.log(`  Agent ID:        ${deploy.agentId}`);
  console.log("");
  console.log(
    `View on explorer: ${pre.networkConfig.explorer}/contract/${deploy.accountAddress}`
  );
  console.log("");
  console.log("Next steps:");
  console.log("  1. Fund the new account with ETH or STRK for gas");
  console.log("  2. Set up session keys for delegated operations");
  console.log("  3. Publish capabilities via agent-passport");
  console.log(
    "  4. Connect to the MCP server for AI-agent operations"
  );
}

main().catch((error) => {
  console.error("\nONBOARDING FAILED\n");
  console.error("Error:", error.message);
  if (error.stack) {
    console.error("\nStack trace:");
    console.error(error.stack);
  }
  process.exit(1);
});
