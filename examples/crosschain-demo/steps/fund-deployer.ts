import { TOKENS } from "../config.js";
import { getFundingProvider } from "../funding/index.js";
import type {
  FundResult,
  FundingConfig,
  FundingProvider,
  FundingProviderSelection,
} from "../funding/types.js";

interface BalanceReader {
  callContract(args: { contractAddress: string; entrypoint: string; calldata: string[] }): Promise<string[]>;
}

interface FundDeployerArgs {
  provider: BalanceReader;
  network: string;
  deployerAddress: string;
  providerSelection: FundingProviderSelection;
  config: FundingConfig;
  resolveProvider?: (name: "mock" | "skipped" | "starkgate-l1") => FundingProvider;
}

export async function readTokenBalanceWei(args: {
  provider: BalanceReader;
  network: string;
  accountAddress: string;
  token: "ETH";
}): Promise<bigint> {
  const tokenAddress = TOKENS[args.network]?.[args.token];
  if (!tokenAddress) {
    throw new Error(`Token ${args.token} not configured for network "${args.network}"`);
  }

  const result = await args.provider.callContract({
    contractAddress: tokenAddress,
    entrypoint: "balance_of",
    calldata: [args.accountAddress],
  });

  const low = BigInt(result[0] || "0");
  const high = BigInt(result[1] || "0");
  return low + (high << 128n);
}

export async function fundDeployer(args: FundDeployerArgs): Promise<{ funding: FundResult; balanceWei: bigint }> {
  const resolver = args.resolveProvider || getFundingProvider;
  const balanceWei = await readTokenBalanceWei({
    provider: args.provider,
    network: args.network,
    accountAddress: args.deployerAddress,
    token: "ETH",
  });

  const min = args.config.minDeployerBalanceWei;
  const topUpWei = min > balanceWei ? min - balanceWei : 0n;
  const alreadyFunded = balanceWei >= min;

  if (!alreadyFunded && args.providerSelection === "skipped") {
    throw new Error(
      "FUNDING_PROVIDER=skipped requires deployer balance >= MIN_STARKNET_DEPLOYER_BALANCE_WEI",
    );
  }

  if (!alreadyFunded && args.providerSelection === "auto") {
    if (!args.config.l1RpcUrl || !args.config.l1PrivateKey) {
      throw new Error(
        "Deployer balance is below MIN_STARKNET_DEPLOYER_BALANCE_WEI and no real funding provider is configured. " +
          "Set FUNDING_PROVIDER=mock for dry-run testing, or configure L1_RPC_URL + L1_PRIVATE_KEY for StarkGate funding.",
      );
    }
  }

  const selected =
    alreadyFunded || args.providerSelection === "skipped"
      ? resolver("skipped")
      : resolver(args.providerSelection === "auto" ? "starkgate-l1" : args.providerSelection);

  await selected.preflight(args.config);
  const funding = await selected.fund({
    targetAddress: args.deployerAddress,
    amountWei: topUpWei,
    token: "ETH",
    network: args.network,
    requiredBalanceWei: args.config.minDeployerBalanceWei,
    readTargetBalanceWei: () =>
      readTokenBalanceWei({
        provider: args.provider,
        network: args.network,
        accountAddress: args.deployerAddress,
        token: "ETH",
      }),
  });

  return { funding, balanceWei };
}
