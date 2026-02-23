#!/usr/bin/env npx tsx
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Account,
  CallData,
  ETransactionVersion,
  RpcProvider,
  byteArray,
  cairo,
} from "starknet";
import {
  parseValidationRequestHashFromReceipt,
  readAgentExists,
  readTotalAgents,
  readValidationSummary,
  toU256Calldata,
} from "./lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env") });

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

async function main() {
  const rpcUrl = getEnv("STARKNET_RPC_URL");
  const accountAddress = getEnv("STARKNET_ACCOUNT_ADDRESS");
  const privateKey = getEnv("STARKNET_PRIVATE_KEY");

  // Maintainer-reviewed defaults sourced from docs/DEPLOYMENT_TRUTH_SHEET.md.
  const identityRegistry =
    process.env.ERC8004_IDENTITY_REGISTRY ||
    "0x72eb37b0389e570bf8b158ce7f0e1e3489de85ba43ab3876a0594df7231631";
  const validationRegistry =
    process.env.ERC8004_VALIDATION_REGISTRY ||
    "0x7c8ac08e98d8259e1507a2b4b719f7071104001ed7152d4e9532a6850a62a4f";

  const explorer = process.env.STARKNET_EXPLORER || "https://sepolia.voyager.online";

  const tokenUri = process.env.AGENT_TOKEN_URI || "https://example.com/agent.json";
  const tag = process.env.VALIDATION_TAG || "demo";
  const responseScore = BigInt(process.env.VALIDATION_RESPONSE || "100");

  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey,
    transactionVersion: ETransactionVersion.V3,
  });

  console.log("=== ERC-8004 Validation Demo (Starknet) ===\n");
  console.log(`IdentityRegistry:   ${identityRegistry}`);
  console.log(`ValidationRegistry: ${validationRegistry}`);
  console.log("");

  const totalBefore = await readTotalAgents({ provider, identityRegistry });
  const predictedAgentId = totalBefore + 1n;

  console.log(`total_agents(before) = ${totalBefore.toString()}`);
  console.log(`predicted agent_id   = ${predictedAgentId.toString()}\n`);

  // 1) Register agent
  const registerCall = {
    contractAddress: identityRegistry,
    entrypoint: "register_with_token_uri",
    calldata: CallData.compile({
      token_uri: byteArray.byteArrayFromString(tokenUri),
    }),
  };

  const registerTx = await account.execute(registerCall);
  await provider.waitForTransaction(registerTx.transaction_hash);

  const exists = await readAgentExists({ provider, identityRegistry, agentId: predictedAgentId });
  if (!exists) {
    throw new Error("Agent registration did not land (agent_exists=false)");
  }

  console.log(`Registered agent_id=${predictedAgentId.toString()}`);
  console.log(`register tx: ${explorer}/tx/${registerTx.transaction_hash}`);
  console.log("");

  // 2) Create validation request (validator = deployer account)
  const requestCall = {
    contractAddress: validationRegistry,
    entrypoint: "validation_request",
    calldata: CallData.compile({
      validator_address: accountAddress,
      agent_id: cairo.uint256(predictedAgentId),
      request_uri: byteArray.byteArrayFromString("data:application/json,{}"),
      request_hash: cairo.uint256(0), // allow auto-generation in contract
    }),
  };

  const requestTx = await account.execute(requestCall);
  const requestReceipt = await provider.waitForTransaction(requestTx.transaction_hash);

  const requestHash = parseValidationRequestHashFromReceipt({
    receipt: requestReceipt,
    expectedValidator: accountAddress,
    expectedAgentId: predictedAgentId,
  });

  console.log(`Validation request_hash=${requestHash.toString()}`);
  console.log(`request tx: ${explorer}/tx/${requestTx.transaction_hash}`);
  console.log("");

  // 3) Respond
  const responseCall = {
    contractAddress: validationRegistry,
    entrypoint: "validation_response",
    calldata: [
      ...toU256Calldata(requestHash),
      responseScore.toString(),
      ...CallData.compile(byteArray.byteArrayFromString("data:application/json,{}")),
      ...toU256Calldata(0n),
      ...CallData.compile(byteArray.byteArrayFromString(tag)),
    ],
  };

  const responseTx = await account.execute(responseCall);
  await provider.waitForTransaction(responseTx.transaction_hash);

  console.log(`response tx: ${explorer}/tx/${responseTx.transaction_hash}`);
  console.log("");

  // 4) Summary
  const summary = await readValidationSummary({
    provider,
    validationRegistry,
    agentId: predictedAgentId,
    tag,
  });

  console.log(`summary(count=${summary.count.toString()}, avg=${summary.avg.toString()})`);

  const receipt = {
    version: "1",
    generated_at: new Date().toISOString(),
    network: "sepolia",
    identity_registry: identityRegistry,
    validation_registry: validationRegistry,
    agent_id: predictedAgentId.toString(),
    validator_address: accountAddress,
    request_hash: requestHash.toString(),
    response: responseScore.toString(),
    tag,
    tx: {
      register: registerTx.transaction_hash,
      request: requestTx.transaction_hash,
      response: responseTx.transaction_hash,
    },
    explorer: {
      register: `${explorer}/tx/${registerTx.transaction_hash}`,
      request: `${explorer}/tx/${requestTx.transaction_hash}`,
      response: `${explorer}/tx/${responseTx.transaction_hash}`,
    },
    summary: {
      count: summary.count.toString(),
      avg: summary.avg.toString(),
    },
  };

  const outPath = path.join(__dirname, "validation_receipt.json");
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error("\nFAILED");
  console.error(err);
  process.exit(1);
});
