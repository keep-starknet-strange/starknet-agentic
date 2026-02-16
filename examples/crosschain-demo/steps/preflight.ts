import { preflightStarknet } from "@starknet-agentic/onboarding-utils";
import type { Account, RpcProvider } from "starknet";
import { STARKNET_NETWORKS, TOKENS, type StarknetNetworkConfig } from "../config.js";

export interface PreflightResult {
  provider: RpcProvider;
  account: Account;
  networkConfig: StarknetNetworkConfig;
  network: string;
  chainId: string;
  balances: Record<string, string>;
}

export async function preflight(env: {
  network: string;
  rpcUrl?: string;
  accountAddress: string;
  privateKey: string;
  paymasterUrl?: string;
  paymasterApiKey?: string;
}): Promise<PreflightResult> {
  const { network, accountAddress, privateKey } = env;
  const networkConfig = STARKNET_NETWORKS[network];

  if (!networkConfig) {
    throw new Error(
      `Unknown network "${network}". Available: ${Object.keys(STARKNET_NETWORKS).join(", ")}`,
    );
  }

  if (!networkConfig.factory || !networkConfig.registry) {
    throw new Error(
      `Factory or registry address not set for network "${network}". Update examples/crosschain-demo/config.ts first.`,
    );
  }

  const { provider, account, chainId, balances } = await preflightStarknet({
    network,
    networkConfig,
    tokens: TOKENS[network] || {},
    accountAddress,
    privateKey,
    paymasterUrl: env.paymasterUrl,
    paymasterApiKey: env.paymasterApiKey,
    rpcUrlOverride: env.rpcUrl,
  });

  return {
    provider,
    account,
    networkConfig,
    network,
    chainId,
    balances,
  };
}
