#!/usr/bin/env tsx
/**
 * Tongo E2E Demo: fund → transfer → rollover → withdraw
 *
 * Usage: tsx demo-e2e.ts
 *
 * Requires .env with:
 *   STARKNET_RPC_URL          - Starknet JSON-RPC endpoint
 *   STARKNET_ACCOUNT_ADDRESS  - Starknet account paying gas
 *   STARKNET_PRIVATE_KEY      - Starknet account private key
 *   TONGO_CONTRACT_ADDRESS    - Deployed Tongo contract
 *   TONGO_PRIVATE_KEY_SENDER  - Sender's Tongo private key
 *   TONGO_PRIVATE_KEY_RECEIVER - Receiver's Tongo private key
 */

import "dotenv/config";
import { Account as TongoAccount } from "@fatsolutions/tongo-sdk";
import { Account, RpcProvider, TransactionExecutionStatus } from "starknet";

async function waitSuccess(provider: RpcProvider, txHash: string) {
  const receipt = await provider.waitForTransaction(txHash);
  if (receipt.execution_status === TransactionExecutionStatus.REVERTED) {
    throw new Error(`Transaction reverted: ${receipt.revert_reason ?? "no revert reason provided"}`);
  }
  return receipt;
}

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const provider = new RpcProvider({ nodeUrl: required("STARKNET_RPC_URL") });
  const tongoContractAddress = required("TONGO_CONTRACT_ADDRESS");

  const account = new Account({
    provider,
    address: required("STARKNET_ACCOUNT_ADDRESS"),
    signer: required("STARKNET_PRIVATE_KEY"),
  });

  const sender = new TongoAccount(
    required("TONGO_PRIVATE_KEY_SENDER"),
    tongoContractAddress,
    provider,
  );
  // WARNING: Test-only pattern. In production, each Tongo private key must only
  // exist on its owner's machine. Never co-locate multiple Tongo keys.
  const receiver = new TongoAccount(
    required("TONGO_PRIVATE_KEY_RECEIVER"),
    tongoContractAddress,
    provider,
  );

  const AMOUNT = 10n;

  // --- 1. Fund ---
  console.log(`\n[1/4] Funding sender with ${AMOUNT} tokens...`);
  const fundOp = await sender.fund({
    amount: AMOUNT,
    sender: account.address,
    fee_to_sender: 0n,
  });
  let tx = await account.execute([fundOp.approve, fundOp.toCalldata()]);
  await waitSuccess(provider, tx.transaction_hash);

  let state = await sender.state();
  console.log(`  Sender balance: ${state.balance}`);

  if (state.balance < AMOUNT) {
    throw new Error(
      `Sender balance (${state.balance}) is less than transfer amount (${AMOUNT}). Aborting.`,
    );
  }

  // --- 2. Transfer ---
  console.log(`\n[2/4] Transferring ${AMOUNT} to receiver...`);
  const transferOp = await sender.transfer({
    amount: AMOUNT,
    to: receiver.tongoAddress(),
    sender: account.address,
    fee_to_sender: 0n,
  });
  tx = await account.execute(transferOp.toCalldata());
  await waitSuccess(provider, tx.transaction_hash);

  state = await receiver.state();
  console.log(`  Receiver pending: ${state.pending}`);

  if (state.pending === 0n) {
    throw new Error("Receiver pending is 0 after transfer. Aborting.");
  }

  // --- 3. Rollover ---
  // NOTE: In production, receiver would have their own Starknet account for gas.
  // This demo reuses `account` for simplicity (test-only pattern).
  console.log("\n[3/4] Rolling over receiver's pending balance...");
  const rolloverOp = await receiver.rollover({ sender: account.address });
  tx = await account.execute(rolloverOp.toCalldata());
  await waitSuccess(provider, tx.transaction_hash);

  state = await receiver.state();
  console.log(`  Receiver balance: ${state.balance}`);

  if (state.balance < AMOUNT) {
    throw new Error(
      `Receiver balance (${state.balance}) is less than withdraw amount (${AMOUNT}). Aborting.`,
    );
  }

  // --- 4. Withdraw ---
  // NOTE: In production, receiver would withdraw to their own Starknet address.
  // `account.address` is used here for demo simplicity (tokens return to the shared gas account).
  console.log(`\n[4/4] Withdrawing ${AMOUNT} back to ERC20...`);
  const withdrawOp = await receiver.withdraw({
    amount: AMOUNT,
    to: account.address,
    sender: account.address,
    fee_to_sender: 0n,
  });
  tx = await account.execute(withdrawOp.toCalldata());
  await waitSuccess(provider, tx.transaction_hash);

  state = await receiver.state();
  console.log(`  Receiver balance after withdraw: ${state.balance}`);

  console.log("\nE2E demo complete.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
