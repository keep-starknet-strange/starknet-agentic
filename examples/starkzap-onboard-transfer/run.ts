#!/usr/bin/env npx tsx
/**
 * Starkzap Demo: Gasless Onboarding + STRK Transfer on Sepolia
 *
 * Flow:
 *   1. SDK init on Sepolia (with optional AVNU paymaster for sponsored)
 *   2. Connect wallet via Signer strategy (or Privy in full demo)
 *   3. wallet.ensureReady({ deploy: "if_needed" }) — sponsored deploy when paymaster configured
 *   4. wallet.transfer(STRK, [...]) — transfer (gasless with --sponsored)
 *   5. tx.wait() — stream finality confirmation
 *
 * Usage:
 *   npx tsx run.ts [--recipient 0x...] [--amount 10] [--sponsored]
 *
 * Env:
 *   PRIVATE_KEY          — test signer (generate with: PRIVATE_KEY=0x$(openssl rand -hex 32))
 *   AVNU_PAYMASTER_API_KEY — for --sponsored mode (get from portal.avnu.fi)
 *   STARKNET_RPC_URL     — optional, defaults to public Sepolia RPC
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";
import {
  assertPositiveAmount,
  assertPrivateKeyFormat,
  parseArgs,
  sanitizeErrorForLog,
} from "./lib";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), override: true, quiet: true });
import {
  StarkSDK,
  StarkSigner,
  OnboardStrategy,
  Amount,
  fromAddress,
  sepoliaTokens,
} from "starkzap";

const SEPOLIA_PAYMASTER = "https://sepolia.paymaster.avnu.fi";
const DEFAULT_RPC = "https://starknet-sepolia-rpc.publicnode.com";
const STARKSCAN_TX_BASE_URL = "https://sepolia.starkscan.co/tx/";
const RECIPIENT_ADDRESS_PATTERN = /^0x[0-9a-fA-F]+$/;

const EVIDENCE_FILE = "demo-evidence.json";

function logEvidence(doLog: boolean, data: Record<string, unknown>) {
  if (!doLog) return;
  const file = path.join(process.cwd(), EVIDENCE_FILE);
  const existing: unknown[] = [];
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) existing.push(...parsed);
  } catch {
    /* file missing or invalid */
  }
  existing.push({ ...data, timestamp: new Date().toISOString() });
  try {
    fs.writeFileSync(file, JSON.stringify(existing, null, 2));
  } catch (writeErr) {
    const message = writeErr instanceof Error ? writeErr.message : String(writeErr);
    console.warn("Warning: could not write evidence file:", message);
  }
}

function getOptionalStringProperty(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const candidate = record[key];
  if (typeof candidate !== "string" || candidate.length === 0) {
    return undefined;
  }
  return candidate;
}

function assertWaitable(value: unknown): asserts value is { wait: () => Promise<unknown> } {
  if (typeof value !== "object" || value === null) {
    throw new Error("transfer response is missing wait()");
  }
  const maybeWait = (value as { wait?: unknown }).wait;
  if (typeof maybeWait !== "function") {
    throw new Error("transfer response is missing wait()");
  }
}

async function main() {
  const { recipient, amount, sponsored, addressOnly, evidence } = parseArgs(
    process.argv.slice(2),
  );

  const privateKey = process.env.PRIVATE_KEY?.trim();
  if (!privateKey) {
    console.error(
      "Missing PRIVATE_KEY. Generate one: PRIVATE_KEY=0x$(openssl rand -hex 32)\n" +
        "Then fund it at https://starknet-faucet.vercel.app/ (only needed for non-sponsored deploy)"
    );
    process.exit(1);
  }
  assertPrivateKeyFormat(privateKey);

  const paymasterApiKey = process.env.AVNU_PAYMASTER_API_KEY?.trim();
  if (sponsored && !paymasterApiKey) {
    console.error(
      "Sponsored mode requires AVNU_PAYMASTER_API_KEY. Get one at https://portal.avnu.fi/"
    );
    process.exit(1);
  }

  const recipientAddress = recipient || process.env.RECIPIENT_ADDRESS?.trim();
  if (!addressOnly && !recipientAddress) {
    console.error(
      "Provide --recipient 0x... or set RECIPIENT_ADDRESS in .env"
    );
    process.exit(1);
  }
  if (recipientAddress && !RECIPIENT_ADDRESS_PATTERN.test(recipientAddress)) {
    console.error("Invalid recipient address format. Expected 0x-prefixed hex string.");
    logEvidence(evidence, { step: "invalid_recipient", error: true });
    process.exit(1);
  }

  const rpcUrl = process.env.STARKNET_RPC_URL?.trim() || DEFAULT_RPC;

  console.log("=== Starkzap Onboard + STRK Transfer Demo ===\n");
  console.log("Network: Sepolia");
  if (!addressOnly) {
    console.log("Recipient:", recipientAddress);
    console.log("Amount:", amount, "STRK");
  }
  console.log("Sponsored:", sponsored);
  if (evidence) console.log("Evidence: logging to", EVIDENCE_FILE);
  console.log("");

  const sdk = new StarkSDK(
    sponsored && paymasterApiKey
      ? {
          network: "sepolia",
          rpcUrl,
          paymaster: {
            nodeUrl: SEPOLIA_PAYMASTER,
            headers: { "x-paymaster-api-key": paymasterApiKey },
          },
        }
      : {
          network: "sepolia",
          rpcUrl,
        },
  );

  if (sponsored && paymasterApiKey) {
    logEvidence(evidence, {
      step: "paymaster_configured",
      nodeUrl: SEPOLIA_PAYMASTER,
    });
  }

  if (addressOnly) {
    const wallet = await sdk.connectWallet({
      account: { signer: new StarkSigner(privateKey) },
      feeMode: "user_pays",
    });
    const addr = wallet.address.toString();
    console.log("Wallet address (fund this):");
    console.log(addr);
    console.log("\nFaucet: https://starknet-faucet.vercel.app/");
    logEvidence(evidence, { step: "address_only", address: addr });
    return;
  }

  logEvidence(evidence, {
    step: "start",
    network: "sepolia",
    recipient: recipientAddress,
    amount,
    sponsored,
  });

  if (!recipientAddress) {
    throw new Error("recipient address is required for transfer mode");
  }

  const { wallet } = await sdk.onboard({
    strategy: OnboardStrategy.Signer,
    account: { signer: new StarkSigner(privateKey) },
    deploy: "if_needed",
    feeMode: sponsored ? "sponsored" : "user_pays",
  });

  const addr = wallet.address.toString();
  console.log("[1/4] Wallet address:", addr);
  logEvidence(evidence, { step: "wallet_ready", address: addr });

  console.log("[2/4] Ensuring account is deployed...");
  await wallet.ensureReady({ deploy: "if_needed" });
  console.log("      Account ready.");
  logEvidence(evidence, { step: "account_deployed" });

  const STRK = sepoliaTokens.STRK;
  const balance = await wallet.balanceOf(STRK);
  console.log("[3/4] STRK balance:", balance.toFormatted());
  logEvidence(evidence, {
    step: "balance_check",
    balance: balance.toFormatted(),
    balanceRaw: balance.toBase().toString(),
  });

  assertPositiveAmount(amount);

  let transferAmount;
  try {
    transferAmount = Amount.parse(amount, STRK);
  } catch {
    console.error(
      "Invalid transfer amount. Provide a positive numeric value (e.g. 1 or 0.5).",
    );
    logEvidence(evidence, { step: "invalid_amount", error: true });
    process.exit(1);
  }
  if (balance.lt(transferAmount)) {
    console.error(
      `Insufficient balance. Need ${amount} STRK. Get test tokens: https://starknet-faucet.vercel.app/`
    );
    logEvidence(evidence, { step: "insufficient_balance", error: true });
    process.exit(1);
  }

  console.log("[4/4] Sending", amount, "STRK to", recipientAddress, "...");
  const tx = await wallet.transfer(
    STRK,
    [{ to: fromAddress(recipientAddress), amount: transferAmount }],
    sponsored ? { feeMode: "sponsored" } : undefined
  );

  const txHash =
    getOptionalStringProperty(tx, "transactionHash") ??
    getOptionalStringProperty(tx, "transaction_hash");
  const explorerUrl =
    getOptionalStringProperty(tx, "explorerUrl") ??
    (txHash ? `${STARKSCAN_TX_BASE_URL}${txHash}` : undefined);

  console.log("      Tx hash:", txHash ?? "pending");
  if (explorerUrl) console.log("      Explorer:", explorerUrl);

  logEvidence(evidence, {
    step: "transfer_submitted",
    txHash,
    explorerUrl,
  });

  console.log("      Waiting for finality...");
  assertWaitable(tx);
  await tx.wait();
  console.log("\n✅ Transfer complete.");
  logEvidence(evidence, {
    step: "transfer_confirmed",
    txHash,
    explorerUrl,
  });
}

main().catch((err) => {
  console.error("Demo failed:", sanitizeErrorForLog(err));
  process.exit(1);
});
