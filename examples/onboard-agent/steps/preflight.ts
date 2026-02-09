/**
 * Preflight checks: validate environment, RPC connectivity,
 * chain ID, and deployer balance.
 */

import { RpcProvider, Account, ETransactionVersion } from "starknet";
import { NETWORKS, TOKENS, type NetworkConfig } from "../config.js";

export interface PreflightResult {
  provider: RpcProvider;
  account: Account;
  networkConfig: NetworkConfig;
  network: string;
  chainId: string;
  balances: Record<string, string>;
}

export async function preflight(env: {
  network: string;
  rpcUrl?: string;
  accountAddress: string;
  privateKey: string;
}): Promise<PreflightResult> {
  const { network, accountAddress, privateKey } = env;

  // --- Network config ---
  const networkConfig = NETWORKS[network];
  if (!networkConfig) {
    throw new Error(
      `Unknown network "${network}". Available: ${Object.keys(NETWORKS).join(", ")}`
    );
  }

  if (!networkConfig.factory || !networkConfig.registry) {
    throw new Error(
      `Factory or registry address not set for network "${network}".\n` +
        "Deploy contracts first: see contracts/agent-account/scripts/deploy.js\n" +
        "Then update examples/onboard-agent/config.ts with the deployed addresses."
    );
  }

  // Allow RPC override via env
  const rpcUrl = env.rpcUrl || networkConfig.rpc;

  // --- Provider ---
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  const chainId = await provider.getChainId();
  console.log(`  Chain ID: ${chainId}`);

  // Sanity: if network is sepolia, chain should be SN_SEPOLIA
  // starknet.js v8 returns hex-encoded chain IDs
  const chainIdStr = String(chainId);
  const isSepoliaChain =
    chainIdStr === "0x534e5f5345504f4c4941" || chainIdStr === "SN_SEPOLIA";

  if (network === "sepolia" && !isSepoliaChain) {
    throw new Error(
      `Network is "sepolia" but chain returned ${chainIdStr}. Check your RPC URL.`
    );
  }

  // --- Account ---
  const account = new Account({
    provider,
    address: accountAddress,
    signer: privateKey,
    transactionVersion: ETransactionVersion.V3,
  });

  console.log(`  Deployer account: ${accountAddress}`);

  // --- Balance check ---
  const tokens = TOKENS[network] || {};
  const balances: Record<string, string> = {};

  for (const [symbol, tokenAddress] of Object.entries(tokens)) {
    try {
      const result = await provider.callContract({
        contractAddress: tokenAddress,
        entrypoint: "balance_of",
        calldata: [accountAddress],
      });
      // balance_of returns u256 as two felts (low, high)
      const low = BigInt(result[0]);
      const high = BigInt(result[1]);
      const raw = low + (high << 128n);
      // Format with 18 decimals
      const formatted = formatBalance(raw, 18);
      balances[symbol] = formatted;
      console.log(`  ${symbol} balance: ${formatted}`);
    } catch {
      balances[symbol] = "error";
      console.log(`  ${symbol} balance: could not fetch`);
    }
  }

  // Warn if both balances are zero
  const hasAnyFunds = Object.values(balances).some((b) => {
    if (b === "error") return false;
    return parseFloat(b) > 0;
  });

  if (!hasAnyFunds) {
    console.log(
      "\n  WARNING: Deployer account has no funds. The factory call will fail."
    );
    console.log(
      "  Fund the account first. For Sepolia, use the Starknet faucet."
    );
  }

  return {
    provider,
    account,
    networkConfig,
    network,
    chainId: String(chainId),
    balances,
  };
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
