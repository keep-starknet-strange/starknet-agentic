import {
  deployAccountViaFactory,
  type DeployerAccountLike,
  type ProviderLike,
} from "@starknet-agentic/onboarding-utils";
import type { StarknetNetworkConfig } from "../config.js";

export interface DeployAccountResult {
  accountAddress: string;
  agentId: string;
  publicKey: string;
  privateKey: string;
  deployTxHash: string;
}

export async function deployAccount(args: {
  provider: ProviderLike;
  deployerAccount: DeployerAccountLike;
  networkConfig: StarknetNetworkConfig;
  network: string;
  tokenUri: string;
  gasfree?: boolean;
  paymasterUrl?: string;
  paymasterApiKey?: string;
  salt?: string;
}): Promise<DeployAccountResult> {
  const gasfree = args.gasfree ?? false;
  if (gasfree && !args.paymasterApiKey) {
    throw new Error("Gasfree mode requires AVNU_PAYMASTER_API_KEY.");
  }

  return await deployAccountViaFactory({
    provider: args.provider,
    deployerAccount: args.deployerAccount,
    factoryAddress: args.networkConfig.factory,
    tokenUri: args.tokenUri,
    gasfree,
    requireEvent: true,
    salt: args.salt,
  });
}
