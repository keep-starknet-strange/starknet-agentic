/**
 * First action: prove the new account is alive.
 *
 * Primary (always): read balances of the new account (deterministic, safe, read-only).
 * Optional (--verify-tx): send a 0-value self-transfer to prove tx plumbing.
 */

import { firstActionBalances, type ProviderLike } from "@starknet-agentic/onboarding-utils";
import { TOKENS } from "../config.js";

export interface FirstActionResult {
  balances: Record<string, string>;
  verifyTxHash: string | null;
}

export async function firstAction(args: {
  provider: ProviderLike;
  accountAddress: string;
  privateKey: string;
  network: string;
  verifyTx: boolean;
}): Promise<FirstActionResult> {
  return await firstActionBalances({
    provider: args.provider,
    tokens: TOKENS[args.network] || {},
    accountAddress: args.accountAddress,
    privateKey: args.privateKey,
    verifyTx: args.verifyTx,
  });
}
