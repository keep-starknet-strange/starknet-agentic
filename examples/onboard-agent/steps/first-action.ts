/**
 * First action: prove the new account is alive.
 *
 * Primary (always): read balances of the new account (deterministic, safe, read-only).
 * Optional (--verify-tx): send a 0-value self-transfer to prove tx plumbing.
 */

import {
  Account,
  CallData,
  cairo,
  ETransactionVersion,
  type RpcProvider,
} from "starknet";
import { TOKENS } from "../config.js";

export interface FirstActionResult {
  balances: Record<string, string>;
  verifyTxHash: string | null;
}

export async function firstAction(args: {
  provider: RpcProvider;
  accountAddress: string;
  privateKey: string;
  network: string;
  verifyTx: boolean;
}): Promise<FirstActionResult> {
  const { provider, accountAddress, privateKey, network, verifyTx } = args;

  // --- Read balances ---
  const tokens = TOKENS[network] || {};
  const balances: Record<string, string> = {};

  console.log(`  Checking balances for ${accountAddress}...`);

  for (const [symbol, tokenAddress] of Object.entries(tokens)) {
    try {
      const result = await provider.callContract({
        contractAddress: tokenAddress,
        entrypoint: "balance_of",
        calldata: [accountAddress],
      });
      const low = BigInt(result[0]);
      const high = BigInt(result[1]);
      const raw = low + (high << 128n);
      const formatted = formatBalance(raw, 18);
      balances[symbol] = formatted;
      console.log(`    ${symbol}: ${formatted}`);
    } catch {
      balances[symbol] = "0";
      console.log(`    ${symbol}: could not fetch (defaulting to 0)`);
    }
  }

  // --- Optional: verify tx path ---
  let verifyTxHash: string | null = null;

  if (verifyTx) {
    console.log(`  Sending 0-value self-transfer to verify tx path...`);

    // Find first token with non-zero balance, or use ETH
    const ethAddress =
      tokens.ETH ||
      "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7";

    const newAccount = new Account({
      provider,
      address: accountAddress,
      signer: privateKey,
      transactionVersion: ETransactionVersion.V3,
    });

    try {
      const result = await newAccount.execute({
        contractAddress: ethAddress,
        entrypoint: "transfer",
        calldata: CallData.compile({
          recipient: accountAddress,
          amount: cairo.uint256(0),
        }),
      });

      console.log(`  Verify tx sent: ${result.transaction_hash}`);
      await provider.waitForTransaction(result.transaction_hash);
      console.log(`  Verify tx confirmed.`);
      verifyTxHash = result.transaction_hash;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(
        `  WARNING: Verify tx failed (account may not have gas): ${msg}`
      );
    }
  }

  return { balances, verifyTxHash };
}

function formatBalance(raw: bigint, decimals: number): string {
  if (raw === 0n) return "0";
  const s = raw.toString();
  if (s.length <= decimals) {
    const frac = s.padStart(decimals, "0").replace(/0+$/, "");
    return frac ? `0.${frac}` : "0";
  }
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}
